import "server-only";

import { cache } from "react";

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
 * On duplicate reads in one render
 * --------------------------------
 * Several sections of /funding need the same payload (the KPI strip, the
 * charts and the city ranking all read `funding_trends`; the toolbar and the
 * feed both read the first page). Redis absorbs that when it is configured, but
 * it is optional here, so each read is also wrapped in React's per-request
 * `cache()` — one database call per render however the cache is set up.
 *
 * On errors
 * ---------
 * Reads that feed a *section* return an empty result flagged `failed` /
 * `unavailable` and log, so one failing panel does not take down the page and
 * the panel can say "unavailable" rather than "no data" — different facts. The
 * failure is thrown *inside* the cache loader and caught outside it, so an
 * error is never written to Redis and served as an empty result for the next
 * two minutes. Reads that feed a *page* throw, because rendering a funding
 * profile as if the company had no rounds would be a lie rather than a gap.
 */

export type FundingCoverage = {
  source_name: string;
  url: string;
  published_at: string | null;
};

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
  /** 0..1, how sure extraction was. Null when unscored. */
  confidence_score: number | null;
  /** Other outlets that reported the same round. Empty when there are none. */
  coverage: FundingCoverage[];
};

/** A row as the database returns it, before `toRoundRow` shapes it. */
type RawRoundRow = Omit<FundingRoundRow, "coverage" | "confidence_score"> & {
  // Postgres numerics arrive as strings, and the column is absent from
  // `funding_search` until 20260929000000 is applied.
  confidence_score?: number | string | null;
  total_count?: number;
};

/**
 * The RPC row, minus `total_count`, plus its coverage.
 *
 * Written out rather than destructured with a discarded rest, because these
 * rows cross the server/client boundary into `FundingRoundList` — and a
 * pagination total riding along on every one of twenty rounds is twenty copies
 * of a number the list already has, serialized into the RSC payload.
 */
function toRoundRow(row: RawRoundRow, coverage: FundingCoverage[] = []): FundingRoundRow {
  const confidence =
    row.confidence_score === null || row.confidence_score === undefined
      ? null
      : Number(row.confidence_score);

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
    confidence_score: Number.isFinite(confidence) ? confidence : null,
    coverage,
  };
}

type PublicClient = ReturnType<typeof createPublicClient>;

/**
 * Extra coverage for a set of rounds, keyed by round id.
 *
 * Ingestion already folds a second outlet's article about the same round into
 * the existing round (`funding_round_articles`) rather than publishing it
 * twice; this is what lets a card say "3 sources" instead of pretending one
 * outlet reported it.
 *
 * Fails soft to an empty map: coverage is an enrichment, and a round is fully
 * attributed by its primary source without it. That also covers a database
 * where `funding_round_coverage` (20260929000000) has not been applied yet.
 */
async function fetchCoverage(
  supabase: PublicClient,
  roundIds: string[],
): Promise<Map<string, FundingCoverage[]>> {
  const byRound = new Map<string, FundingCoverage[]>();
  if (roundIds.length === 0) return byRound;

  const { data, error } = await supabase.rpc("funding_round_coverage", {
    round_ids: roundIds.slice(0, 60),
  });
  if (error) {
    console.error(`[funding] coverage unavailable: ${error.message}`);
    return byRound;
  }

  for (const row of (data ?? []) as (FundingCoverage & { round_id: string })[]) {
    if (!row.url) continue;
    const list = byRound.get(row.round_id) ?? [];
    list.push({ source_name: row.source_name, url: row.url, published_at: row.published_at });
    byRound.set(row.round_id, list);
  }
  return byRound;
}

export type FundingFeed = {
  rounds: FundingRoundRow[];
  totalCount: number;
  hasMore: boolean;
  /** Newest `source_published_at` in this page — see `getFundingLastUpdated` for the dataset's. */
  lastUpdatedAt: string | null;
  /** The query failed — distinct from an empty result, and rendered differently. */
  failed: boolean;
};

/**
 * One page of the feed.
 *
 * The RPC returns `total_count` on every row (a cross join against the count),
 * so pagination costs one round trip rather than a query plus a `count`
 * request. It is stripped here — a total is a property of the result, not of
 * each item in it. Coverage for the page is a second, batched call.
 */
export function getFundingFeed(filters: FundingFilters): Promise<FundingFeed> {
  // `cache()` memoises on argument identity, and every caller builds a fresh
  // filters object — so the memo is keyed on a string instead.
  return feedBySerializedFilters(JSON.stringify(filters));
}

const feedBySerializedFilters = cache(async (serialized: string): Promise<FundingFeed> => {
  const filters = JSON.parse(serialized) as FundingFilters;
  const key = `${FUNDING_CACHE_PREFIX}feed:${fundingFilterKey(filters)}:${filters.page}`;

  try {
    return await cacheRemember(key, FUNDING_CACHE_TTL, async () => {
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
        throw error;
      }

      const rows = (data ?? []) as RawRoundRow[];
      const totalCount = Number(rows[0]?.total_count ?? 0);
      const coverage = await fetchCoverage(
        supabase,
        rows.map((row) => row.id),
      );

      return {
        rounds: rows.map((row) => toRoundRow(row, coverage.get(row.id))),
        totalCount,
        hasMore: filters.page * FUNDING_PAGE_SIZE < totalCount,
        lastUpdatedAt: rows[0]?.source_published_at ?? null,
        failed: false,
      };
    });
  } catch {
    return { rounds: [], totalCount: 0, hasMore: false, lastUpdatedAt: null, failed: true };
  }
});

/**
 * Recent published rounds in one industry, for a company page's "related
 * rounds" and "similar startups" blocks. One `funding_search` call, cached per
 * industry so every company in a sector shares it. Fails soft to an empty list
 * — it is supporting content, not the page.
 */
export const getRelatedFundingRounds = cache(
  async (industry: string | null, excludeSlug: string): Promise<FundingRoundRow[]> => {
    if (!industry) return [];

    let rows: FundingRoundRow[];
    try {
      rows = await cacheRemember(
        `${FUNDING_CACHE_PREFIX}related:${industry}`,
        FUNDING_CACHE_TTL,
        async () => {
          const supabase = createPublicClient();
          const { data, error } = await supabase.rpc("funding_search", {
            industry_filter: [industry],
            sort_mode: "recent",
            page_limit: 16,
            page_offset: 0,
          });
          if (error) throw error;
          return ((data ?? []) as RawRoundRow[]).map((row) => toRoundRow(row));
        },
      );
    } catch (error) {
      console.error(
        `[funding] related rounds unavailable: ${error instanceof Error ? error.message : "unknown"}`,
      );
      return [];
    }

    return rows.filter((round) => round.startup_slug !== excludeSlug);
  },
);

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
  /** The query failed, as opposed to returning an empty window. */
  unavailable: boolean;
};

/**
 * How many rows each ranked series returns. Twelve, which is every industry in
 * `FUNDING_INDUSTRIES` — so "AI rounds" in the KPI strip is read straight out
 * of the sector series instead of costing a query of its own.
 */
const TRENDS_TOP_N = 12;

/**
 * Every aggregate on /funding in one call: the KPI strip, the charts and the
 * city ranking. Returns empty series flagged `unavailable` on failure.
 */
export const getFundingTrends = cache(async (months: number = 12): Promise<FundingTrends> => {
  try {
    return await cacheRemember(
      `${FUNDING_CACHE_PREFIX}trends:${months}:${TRENDS_TOP_N}`,
      FUNDING_CACHE_TTL,
      async () => {
        const supabase = createPublicClient();
        const { data, error } = await supabase.rpc("funding_trends", {
          months,
          top_n: TRENDS_TOP_N,
        });

        if (error) {
          console.error(`[funding] trends unavailable: ${error.message}`);
          throw error;
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
          unavailable: false,
        };
      },
    );
  } catch {
    return {
      byMonth: [],
      bySector: [],
      byStage: [],
      topInvestors: [],
      topCities: [],
      totalRoundCount: 0,
      disclosedRoundCount: 0,
      unavailable: true,
    };
  }
});

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

export const getFundingInvestors = cache(
  async (
    query: string | null,
    page: number = 1,
  ): Promise<{ investors: FundingInvestorRow[]; totalCount: number; hasMore: boolean }> => {
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
  },
);

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
 * Wrapped in `cache()` because `generateMetadata` and the page both call it
 * with the same slug; without the wrapper that was the same pair of queries
 * twice per request.
 *
 * Throws on a query error. A funding profile that renders with an empty history
 * because the second query failed would be a page asserting a company has never
 * raised.
 */
export const getStartupFundingProfile = cache(
  async (slug: string): Promise<FundingStartupProfile | null> => {
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
        "id, startup_name, startup_slug, headline, summary, amount, amount_numeric, currency, amount_inr, funding_stage, industry, sub_industry, location, city, investors, lead_investor, announcement_date, source_name, source_url, source_published_at, logo_url, verified, extraction_method, is_featured, confidence_score",
      )
      .eq("startup_id", startup.id)
      .order("announcement_date", { ascending: false })
      .limit(60);

    if (roundsError) {
      throw new Error(`Failed to load funding history: ${roundsError.message}`);
    }

    const rows = (rounds ?? []) as RawRoundRow[];
    const coverage = await fetchCoverage(
      supabase,
      rows.map((row) => row.id),
    );

    return { ...startup, rounds: rows.map((row) => toRoundRow(row, coverage.get(row.id))) };
  },
);

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
 * This is the "latest round" half of the freshness line, and it is
 * deliberately the *article's* time rather than ours: an ingestion run that
 * finds nothing new has not updated anything. When we last *checked* is a
 * separate fact — `getFundingLastSync`.
 */
export const getFundingLastUpdated = cache(async (): Promise<string | null> => {
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
});

/**
 * When ingestion last completed a successful run — the "Last synced" claim.
 *
 * Null when unknown, including on a database without 20260929000000; the
 * freshness line then shows the newest-round time alone rather than guessing.
 */
export const getFundingLastSync = cache(async (): Promise<string | null> => {
  return cacheRemember(`${FUNDING_CACHE_PREFIX}last-sync`, FUNDING_CACHE_TTL, async () => {
    const supabase = createPublicClient();
    const { data, error } = await supabase.rpc("funding_last_sync");
    if (error) return null;
    return typeof data === "string" ? data : null;
  });
});
