import "server-only";

import { cacheRemember } from "@/lib/cache";
import { createPublicClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isMissingTableError } from "@/lib/supabase/errors";
import { INTELLIGENCE_CACHE_PREFIX } from "@/lib/intelligence/cache-keys";
import {
  EMPTY_ENGAGEMENT,
  fundingLinkVerified,
  verifiedCompanyName,
  type ProductEngagement,
} from "@/lib/intelligence/connections";
import { normalizeSite } from "@/lib/daily-agent/domain";
import { normalizeEntityName } from "@/lib/funding/normalize";
import { getStartupFundingProfile, type FundingRoundRow } from "@/services/funding";

/**
 * What connects one product to the rest of BharatHunt: the Daily 5 list that
 * picked it, the engagement BharatHunt recorded for it, and — when verified —
 * the company's funding history.
 *
 * Read-only, cached, and fail-soft: every function returns an empty answer on
 * a query error, so a product page never breaks over a supporting section. No
 * function here fetches anything outside the database or calls a model.
 */

const HOUR = 3600;

export type Daily5Origin = {
  date: string;
  companyName: string | null;
  city: string | null;
};

/** The Daily 5 day that published this product, with the company facts the agent verified. */
export async function getDaily5Origin(product: {
  id: string;
  name: string;
  website_url: string | null;
}): Promise<Daily5Origin | null> {
  const productId = product.id;
  return cacheRemember(`${INTELLIGENCE_CACHE_PREFIX}daily5-origin:v2:${productId}`, HOUR, async () => {
    try {
      const supabase = createServiceClient();
      const { data, error } = await supabase
        .from("daily_agent_candidates")
        .select("facts, batch:daily_agent_batches!inner(batch_date, is_dry_run)")
        .eq("product_id", productId)
        .eq("status", "published")
        .maybeSingle();
      if (error || !data) return null;
      const batch = (Array.isArray(data.batch) ? data.batch[0] : data.batch) as
        | { batch_date: string; is_dry_run: boolean }
        | null;
      if (!batch || batch.is_dry_run) return null;
      const facts = (data.facts ?? {}) as { companyName?: string | null; city?: string | null };
      return { date: batch.batch_date, companyName: verifiedCompanyName(facts.companyName, product), city: facts.city ?? null };
    } catch {
      return null;
    }
  });
}

function istDay(offsetDays: number): string {
  return new Date(Date.now() + 5.5 * HOUR * 1000 - offsetDays * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Thirty days of BharatHunt engagement from `product_signal_daily` — rows the
 * hourly signal job already aggregated, so this is a 30-row read, never a scan
 * of raw events.
 */
export async function getProductEngagement(productId: string, days = 30): Promise<ProductEngagement> {
  return cacheRemember(`${INTELLIGENCE_CACHE_PREFIX}engagement:${productId}:${days}`, HOUR, async () => {
    try {
      const supabase = createServiceClient();
      const { data, error } = await supabase
        .from("product_signal_daily")
        .select("visitors, website_clicks, saves, unsaves, compares, match_clicks, search_clicks")
        .eq("product_id", productId)
        .gte("day", istDay(days - 1));
      if (error) {
        if (!isMissingTableError(error)) console.error(`[product-connections] engagement: ${error.message}`);
        return { ...EMPTY_ENGAGEMENT, days };
      }
      const total = { ...EMPTY_ENGAGEMENT, days };
      for (const row of data ?? []) {
        total.visitors += row.visitors ?? 0;
        total.websiteClicks += row.website_clicks ?? 0;
        // Net saves: a save undone the same month is not interest.
        total.saves += (row.saves ?? 0) - (row.unsaves ?? 0);
        total.compares += row.compares ?? 0;
        total.discoveryClicks += (row.match_clicks ?? 0) + (row.search_clicks ?? 0);
      }
      total.saves = Math.max(0, total.saves);
      return total;
    } catch {
      return { ...EMPTY_ENGAGEMENT, days };
    }
  });
}

export type ProductFunding = {
  name: string;
  slug: string;
  roundCount: number;
  totalDisclosedInr: number;
  rounds: Pick<
    FundingRoundRow,
    "id" | "funding_stage" | "amount" | "amount_numeric" | "currency" | "announcement_date" | "investors" | "lead_investor" | "source_name" | "source_url"
  >[];
};

/**
 * The published funding history of the company behind a product — only when
 * `fundingLinkVerified` accepts the link (name *and* domain agree). Otherwise
 * null, and the page shows no funding section at all.
 *
 * Candidates are the startups whose folded name starts with the product
 * domain's first label, or equals the product's (or Daily 5 company's) name;
 * the pure check then decides. Cached for six hours; a rebuild clears it.
 */
export async function getProductFunding(product: {
  id: string;
  name: string;
  website_url: string | null;
  companyName?: string | null;
}): Promise<ProductFunding | null> {
  const site = normalizeSite(product.website_url);
  if (!site) return null;

  return cacheRemember(`${INTELLIGENCE_CACHE_PREFIX}funding-link:${product.id}:${site.key}`, 6 * HOUR, async () => {
    try {
      const label = site.key.split(".")[0].replace(/[^a-z0-9]/g, "");
      const names = [product.name, product.companyName]
        .map((name) => normalizeEntityName(name))
        .filter((name) => name.length >= 4)
        // Quoted for PostgREST's `in` list; folded names are lowercase words.
        .map((name) => `"${name.replace(/"/g, "")}"`);
      const clauses = [label.length >= 4 ? `normalized_name.ilike.${label}%` : null, names.length ? `normalized_name.in.(${names.join(",")})` : null].filter(
        Boolean,
      );
      if (clauses.length === 0) return null;

      const supabase = createPublicClient();
      const { data, error } = await supabase
        .from("funding_startups")
        .select("name, slug, website")
        .or(clauses.join(","))
        .limit(8);
      if (error || !data) return null;

      const match = data.find((startup) => fundingLinkVerified(product, startup));
      if (!match) return null;

      const profile = await getStartupFundingProfile(match.slug);
      if (!profile || profile.rounds.length === 0) return null;
      return {
        name: profile.name,
        slug: profile.slug,
        roundCount: profile.published_round_count,
        totalDisclosedInr: profile.total_disclosed_inr,
        rounds: profile.rounds.slice(0, 3).map((round) => ({
          id: round.id,
          funding_stage: round.funding_stage,
          amount: round.amount,
          amount_numeric: round.amount_numeric,
          currency: round.currency,
          announcement_date: round.announcement_date,
          investors: round.investors,
          lead_investor: round.lead_investor,
          source_name: round.source_name,
          source_url: round.source_url,
        })),
      };
    } catch {
      return null;
    }
  });
}

export type LaunchPerformance = ProductEngagement & {
  /** All-time counters on the product row. */
  views: number;
  upvotes: number;
  comments: number;
};

/**
 * What BharatHunt itself measured for a launch, for its maker's Launch Agent
 * dashboard. Callers MUST have authorised the maker (authorizeCampaignAccess)
 * first: the counts are service-role reads. External platforms are absent on
 * purpose — BharatHunt cannot see them, so it does not report them.
 */
export async function getLaunchPerformance(productId: string): Promise<LaunchPerformance> {
  const engagement = await getProductEngagement(productId);
  try {
    const { data } = await createServiceClient()
      .from("products")
      .select("view_count, upvote_count, comment_count")
      .eq("id", productId)
      .maybeSingle();
    return {
      ...engagement,
      views: data?.view_count ?? 0,
      upvotes: data?.upvote_count ?? 0,
      comments: data?.comment_count ?? 0,
    };
  } catch {
    return { ...engagement, views: 0, upvotes: 0, comments: 0 };
  }
}
