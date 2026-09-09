import "server-only";

import { cacheRemember } from "@/lib/cache";
import { createPublicClient } from "@/lib/supabase/server";
import {
  FUNDING_CACHE_PREFIX,
  FUNDING_CACHE_TTL,
  FUNDING_INVESTORS_PAGE_SIZE,
  FUNDING_PAGE_SIZE,
} from "@/lib/funding/constants";
import {
  fundingFilterKey,
  toFundingQuery,
  type FundingFilters,
} from "@/lib/funding/filters";

/**
 * Every public read of the funding dataset.
 *
 * On the client used here
 * -----------------------
 * `createPublicClient()` — the anon, identity-free one. This is the right
 * choice and worth stating, because the default in this codebase is the
 * Clerk-scoped client: the funding pages are byte-identical for every visitor,
 * signed in or not, and the RLS policy they rely on (`status = 'published' and
 * not is_hidden`) needs no `sub` claim to be satisfied. Reaching for the
 * authenticated client would call Clerk's `auth()`, which is a dynamic API, and
 * opt `/funding` out of static rendering for no benefit at all.
 *
 * On the cache
 * ------------
 * `cacheRemember` with a short TTL, fail-open, same as the product reads. The
 * TTL is deliberately shorter than most of those (`FUNDING_CACHE_TTL`, two
 * minutes) because this page's headline claim is a timestamp — it tells the
 * reader when the data last changed, and a cache that outlived that claim would
 * make the page's most prominent honesty feature its least accurate one.
 *
 * On errors
 * ---------
 * Reads that feed a *section* return an empty result and log, so one failing
 * panel does not take down the page — the empty states are designed and say
 * what happened. Reads that feed a *page* throw, because rendering a funding
 * profile as if the company had no rounds would be a lie rather than a gap.
 */

export type FundingRoundRow = {
  id: string;
  startup_name: string;
  startup_slug: string;
  headline: string;
  summary: string | null;
  amount: string | null;
  amount_numeric: number | null;
  currency: string | null;
  amount_inr: number | null;
  funding_stage: string;
  industry: string | null;
  sub_industry: string | null;
  location: string | null;
  city: string | null;
  investors: string[];
  lead_investor: string | null;
  announcement_date: string;
  source_name: string;
  source_url: string;
  source_published_at: string | null;
  logo_url: string | null;
  verified: boolean;
  extraction_method: string | null;
  is_featured: boolean;
};

/**
 * The RPC row, minus `total_count`.
 *
 * Written out rather than destructured with a discarded rest, because these
 * rows cross the server/client boundary into `FundingRoundList` — and a
 * pagination total riding along on every one of twenty rounds is twenty copies
 * of a number the list already has, serialized into the RSC payload.
 */
function toRoundRow(row: FundingRoundRow & { total_count: number }): FundingRoundRow {
  return {
    id: row.id,
    startup_name: row.startup_name,
    startup_slug: row.startup_slug,
    headline: row.headline,
    summary: row.summary,
    amount: row.amount,
    amount_numeric: row.amount_numeric,
    currency: row.currency,
    amount_inr: row.amount_inr,
    funding_stage: row.funding_stage,
    industry: row.industry,
    sub_industry: row.sub_industry,
    location: row.location,
    city: row.city,
    investors: row.investors ?? [],
    lead_investor: row.lead_investor,
    announcement_date: row.announcement_date,
    source_name: row.source_name,
    source_url: row.source_url,
    source_published_at: row.source_published_at,
    logo_url: row.logo_url,
    verified: row.verified,
    extraction_method: row.extraction_method,
    is_featured: row.is_featured,
  };
}

export type FundingFeed = {
  rounds: FundingRoundRow[];
  totalCount: number;
  hasMore: boolean;
  /** Newest `source_published_at` in the whole published set — the "last updated" claim. */
  lastUpdatedAt: string | null;
};

/**
 * One page of the feed.
 *
 * The RPC returns `total_count` on every row (a cross join against the count),
 * so pagination costs one round trip rather than a query plus a `count`
 * request. It is stripped here — a total is a property of the result, not of
 * each item in it.
 */
export async function getFundingFeed(filters: FundingFilters): Promise<FundingFeed> {
  const key = `${FUNDING_CACHE_PREFIX}feed:${fundingFilterKey(filters)}:${filters.page}`;

  return cacheRemember(key, FUNDING_CACHE_TTL, async () => {
    const supabase = createPublicClient();
    const { data, error } = await supabase.rpc(
      "funding_search",
      toFundingQuery(filters, FUNDING_PAGE_SIZE),
    );

    if (error) {
      console.error(
        JSON.stringify({
          event: "funding_feed_query_failed",
          code: error.code ?? null,
          message: error.message,
          at: new Date().toISOString(),
        }),
      );
      return { rounds: [], totalCount: 0, hasMore: false, lastUpdatedAt: null };
    }

    const rows = (data ?? []) as (FundingRoundRow & { total_count: number })[];
    const totalCount = Number(rows[0]?.total_count ?? 0);

    return {
      rounds: rows.map(toRoundRow),
      totalCount,
      hasMore: filters.page * FUNDING_PAGE_SIZE < totalCount,
      lastUpdatedAt: rows[0]?.source_published_at ?? null,
    };
  });
}

export type FundingSnapshot = {
  announcedToday: number;
  roundsThisWeek: number;
  roundsThisMonth: number;
  totalThisMonthInr: number;
  disclosedThisMonth: number;
  topIndustry: string | null;
  topIndustryCount: number;
  topStage: string | null;
  topStageCount: number;
  totalRounds: number;
  lastPublishedAt: string | null;
};

/**
 * The five figures across the top of /funding.
 *
 * `disclosedThisMonth` travels with the total on purpose — see the note on
 * `funding_snapshot` in 20260909010000. A total with no denominator invites the
 * reader to assume every round is in it.
 */
export async function getFundingSnapshot(): Promise<FundingSnapshot | null> {
  return cacheRemember(`${FUNDING_CACHE_PREFIX}snapshot`, FUNDING_CACHE_TTL, async () => {
    const supabase = createPublicClient();
    const { data, error } = await supabase.rpc("funding_snapshot");

    if (error) {
      console.error(`[funding] snapshot unavailable: ${error.message}`);
      return null;
    }

    const row = (data ?? [])[0];
    if (!row) return null;

    return {
      announcedToday: Number(row.announced_today ?? 0),
      roundsThisWeek: Number(row.rounds_this_week ?? 0),
      roundsThisMonth: Number(row.rounds_this_month ?? 0),
      totalThisMonthInr: Number(row.total_this_month_inr ?? 0),
      disclosedThisMonth: Number(row.disclosed_this_month ?? 0),
      topIndustry: row.top_industry ?? null,
      topIndustryCount: Number(row.top_industry_count ?? 0),
      topStage: row.top_stage ?? null,
      topStageCount: Number(row.top_stage_count ?? 0),
      totalRounds: Number(row.total_rounds ?? 0),
      lastPublishedAt: row.last_published_at ?? null,
    };
  });
}

export type TrendPoint = { name: string; round_count: number; total_inr: number };
export type MonthPoint = {
  month: string;
  round_count: number;
  disclosed_count: number;
  total_inr: number;
};
export type InvestorPoint = {
  name: string;
  slug: string;
  deal_count: number;
  lead_count: number;
};

export type FundingTrends = {
  byMonth: MonthPoint[];
  bySector: TrendPoint[];
  byStage: TrendPoint[];
  topInvestors: InvestorPoint[];
  topCities: TrendPoint[];
  totalRoundCount: number;
  disclosedRoundCount: number;
};

/** All five charts, one call. Returns empty series rather than null on failure. */
export async function getFundingTrends(months = 12): Promise<FundingTrends> {
  const empty: FundingTrends = {
    byMonth: [],
    bySector: [],
    byStage: [],
    topInvestors: [],
    topCities: [],
    totalRoundCount: 0,
    disclosedRoundCount: 0,
  };

  return cacheRemember(`${FUNDING_CACHE_PREFIX}trends:${months}`, FUNDING_CACHE_TTL, async () => {
    const supabase = createPublicClient();
    const { data, error } = await supabase.rpc("funding_trends", { months, top_n: 8 });

    if (error) {
      console.error(`[funding] trends unavailable: ${error.message}`);
      return empty;
    }

    const payload = (data ?? {}) as Record<string, unknown>;
    return {
      byMonth: (payload.by_month as MonthPoint[]) ?? [],
      bySector: (payload.by_sector as TrendPoint[]) ?? [],
      byStage: (payload.by_stage as TrendPoint[]) ?? [],
      topInvestors: (payload.top_investors as InvestorPoint[]) ?? [],
      topCities: (payload.top_cities as TrendPoint[]) ?? [],
      totalRoundCount: Number(payload.total_round_count ?? 0),
      disclosedRoundCount: Number(payload.disclosed_round_count ?? 0),
    };
  });
}

export type FundingInvestorRow = {
  id: string;
  name: string;
  slug: string;
  investor_type: string | null;
  deal_count: number;
  lead_count: number;
  last_deal_at: string | null;
  stages: string[];
  industries: string[];
  recent_investments: {
    startup_name: string;
    startup_slug: string;
    funding_stage: string;
    announcement_date: string;
    amount: string | null;
    currency: string | null;
  }[];
};

export async function getFundingInvestors(
  query: string | null,
  page = 1,
): Promise<{ investors: FundingInvestorRow[]; totalCount: number; hasMore: boolean }> {
  const key = `${FUNDING_CACHE_PREFIX}investors:${query ?? ""}:${page}`;

  return cacheRemember(key, FUNDING_CACHE_TTL, async () => {
    const supabase = createPublicClient();
    const { data, error } = await supabase.rpc("funding_investor_directory", {
      search_query: query,
      page_limit: FUNDING_INVESTORS_PAGE_SIZE,
      page_offset: (page - 1) * FUNDING_INVESTORS_PAGE_SIZE,
    });

    if (error) {
      console.error(`[funding] investor directory unavailable: ${error.message}`);
      return { investors: [], totalCount: 0, hasMore: false };
    }

    const rows = (data ?? []) as (FundingInvestorRow & { total_count: number })[];
    const totalCount = Number(rows[0]?.total_count ?? 0);

    return {
      investors: rows.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        investor_type: row.investor_type,
        deal_count: Number(row.deal_count ?? 0),
        lead_count: Number(row.lead_count ?? 0),
        last_deal_at: row.last_deal_at,
        stages: row.stages ?? [],
        industries: row.industries ?? [],
        // `jsonb_agg` returns SQL NULL, not '[]', when the lateral join finds
        // nothing — so this is a real case, not defensive padding.
        recent_investments: Array.isArray(row.recent_investments) ? row.recent_investments : [],
      })),
      totalCount,
      hasMore: page * FUNDING_INVESTORS_PAGE_SIZE < totalCount,
    };
  });
}

export type FundingStartupProfile = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  website: string | null;
  logo_url: string | null;
  industry: string | null;
  location: string | null;
  city: string | null;
  published_round_count: number;
  total_disclosed_inr: number;
  first_round_at: string | null;
  last_round_at: string | null;
  rounds: FundingRoundRow[];
};

/**
 * A company's funding history, for `/funding/[startup-slug]`.
 *
 * Two queries rather than an RPC: the company row is guarded by its own RLS
 * predicate (`published_round_count > 0`), so a slug with no published rounds
 * returns nothing here and the page 404s — which is the correct answer and one
 * this code does not have to implement.
 *
 * Throws on a query error. A funding profile that renders with an empty history
 * because the second query failed would be a page asserting a company has never
 * raised.
 */
export async function getStartupFundingProfile(
  slug: string,
): Promise<FundingStartupProfile | null> {
  const supabase = createPublicClient();

  const { data: startup, error: startupError } = await supabase
    .from("funding_startups")
    .select(
      "id, name, slug, description, website, logo_url, industry, location, city, published_round_count, total_disclosed_inr, first_round_at, last_round_at",
    )
    .eq("slug", slug)
    .maybeSingle();

  if (startupError) {
    throw new Error(`Failed to load funding profile: ${startupError.message}`);
  }
  if (!startup) return null;

  const { data: rounds, error: roundsError } = await supabase
    .from("funding_rounds")
    .select(
      "id, startup_name, startup_slug, headline, summary, amount, amount_numeric, currency, amount_inr, funding_stage, industry, sub_industry, location, city, investors, lead_investor, announcement_date, source_name, source_url, source_published_at, logo_url, verified, extraction_method, is_featured",
    )
    .eq("startup_id", startup.id)
    .order("announcement_date", { ascending: false })
    .limit(60);

  if (roundsError) {
    throw new Error(`Failed to load funding history: ${roundsError.message}`);
  }

  return { ...startup, rounds: (rounds ?? []) as FundingRoundRow[] };
}

/**
 * Slugs of every company with a published round, for the sitemap.
 *
 * Only companies that have one: the RLS predicate already enforces that, so
 * this cannot advertise a URL that answers 404 — the mismatch crawlers report
 * as an error.
 */
export async function getFundedStartupSlugs(): Promise<{ slug: string; updated: string | null }[]> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("funding_startups")
    .select("slug, last_round_at")
    .order("last_round_at", { ascending: false, nullsFirst: false })
    .limit(2000);

  if (error) {
    console.error(`[funding] sitemap slugs unavailable: ${error.message}`);
    return [];
  }
  return (data ?? []).map((row) => ({ slug: row.slug, updated: row.last_round_at }));
}

/**
 * The newest publication timestamp in the dataset.
 *
 * This is what the page's "Last updated N minutes ago" is computed from, and it
 * is deliberately the *article's* time rather than ours: an ingestion run that
 * finds nothing new has not updated anything, and saying otherwise would be the
 * fake-liveness the brief rules out.
 */
export async function getFundingLastUpdated(): Promise<string | null> {
  return cacheRemember(`${FUNDING_CACHE_PREFIX}last-updated`, FUNDING_CACHE_TTL, async () => {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("funding_rounds")
      .select("source_published_at, published_at")
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    return data.source_published_at ?? data.published_at ?? null;
  });
}
