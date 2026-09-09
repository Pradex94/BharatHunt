/**
 * Turning `searchParams` into a query, and back into `searchParams`.
 *
 * The marketplace's rule applies here too (`hooks/use-update-search-params.ts`):
 * filter state lives in the URL, never in component state, so a filtered feed
 * is a link someone can send. This module is the single place that decides what
 * those URL tokens mean — the page reads them through it, the "load more"
 * action reads them through it, and the filter bar writes tokens it defines.
 *
 * Pure, and safe on the client: it imports the vocabulary and nothing else.
 *
 * Every parser is total. An unrecognised token is dropped rather than rejected,
 * because these strings arrive from address bars, stale bookmarks and crawlers
 * — a hand-edited `?stage=serious-a` should render the unfiltered feed, not an
 * error page.
 */

import {
  FUNDING_AMOUNT_FILTERS,
  FUNDING_DATE_FILTERS,
  FUNDING_GEO_FILTERS,
  FUNDING_SORTS,
  FUNDING_STAGE_FILTERS,
  FUNDING_INDUSTRIES,
  type FundingCity,
  type FundingSort,
  type FundingStage,
} from "./constants.ts";

export type FundingSearchParams = {
  q?: string;
  stage?: string;
  industry?: string;
  geo?: string;
  amount?: string;
  date?: string;
  investor?: string;
  sort?: string;
  page?: string;
};

/** The tokens, exactly as they appear in the URL. */
export type FundingFilters = {
  q: string | null;
  /** Multi-select; comma-separated in the URL. */
  stages: string[];
  industries: string[];
  geos: string[];
  amount: string;
  date: string;
  investor: string | null;
  sort: FundingSort;
  page: number;
};

/** What `funding_search` actually takes, resolved from the tokens above. */
export type FundingQuery = {
  search_query: string | null;
  stage_filter: FundingStage[] | null;
  industry_filter: string[] | null;
  city_filter: FundingCity[] | null;
  investor_filter: string | null;
  min_amount: number | null;
  since_date: string | null;
  sort_mode: FundingSort;
  page_limit: number;
  page_offset: number;
};

function list(raw: string | undefined, allowed: readonly string[]): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const token of raw.split(",")) {
    const clean = token.trim().toLowerCase();
    if (clean && allowed.includes(clean) && !seen.has(clean)) seen.add(clean);
    // A bound, not a business rule: the token list comes from a URL, and
    // without one a crafted link could ask for a thousand-branch OR.
    if (seen.size >= 12) break;
  }
  return [...seen];
}

const INDUSTRY_TOKENS = FUNDING_INDUSTRIES.map((industry) => industry.toLowerCase());

export function parseFundingFilters(params: FundingSearchParams): FundingFilters {
  const page = Number(params.page);

  return {
    // 120 characters is far more than any real query and far less than a
    // payload. The trigram index does not care, but the audit log does.
    q: params.q?.trim().slice(0, 120) || null,
    stages: list(params.stage, FUNDING_STAGE_FILTERS.map((entry) => entry.value)),
    industries: list(params.industry, INDUSTRY_TOKENS),
    geos: list(params.geo, FUNDING_GEO_FILTERS.map((entry) => entry.value)),
    amount: FUNDING_AMOUNT_FILTERS.some((entry) => entry.value === params.amount)
      ? (params.amount as string)
      : "any",
    date: FUNDING_DATE_FILTERS.some((entry) => entry.value === params.date)
      ? (params.date as string)
      : "all",
    investor: params.investor?.trim().slice(0, 80) || null,
    sort: (FUNDING_SORTS as readonly string[]).includes(params.sort ?? "")
      ? (params.sort as FundingSort)
      : "recent",
    page: Number.isInteger(page) && page > 1 ? Math.min(page, 500) : 1,
  };
}

/**
 * Resolve the tokens into the arguments `funding_search` expects.
 *
 * The two expansions worth noting are the ones a single flat list could not
 * express: `series-c-plus` becomes two stages, and `india` becomes every Indian
 * city bucket. Both live in `constants.ts` next to the labels they belong to.
 *
 * `now` is injectable so date-window resolution is testable without the clock
 * moving underneath the assertion.
 */
export function toFundingQuery(
  filters: FundingFilters,
  pageSize: number,
  now: Date = new Date(),
): FundingQuery {
  const stages = filters.stages.flatMap(
    (value) => FUNDING_STAGE_FILTERS.find((entry) => entry.value === value)?.stages ?? [],
  );

  const cities = filters.geos.flatMap(
    (value) => FUNDING_GEO_FILTERS.find((entry) => entry.value === value)?.cities ?? [],
  );

  const industries = filters.industries
    .map((token) => FUNDING_INDUSTRIES.find((industry) => industry.toLowerCase() === token))
    .filter((industry): industry is (typeof FUNDING_INDUSTRIES)[number] => Boolean(industry));

  const minAmount =
    FUNDING_AMOUNT_FILTERS.find((entry) => entry.value === filters.amount)?.minInr ?? null;

  const days = FUNDING_DATE_FILTERS.find((entry) => entry.value === filters.date)?.days ?? null;
  const since =
    days === null
      ? null
      : new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);

  return {
    search_query: filters.q,
    // Null rather than an empty array: the SQL treats null as "no constraint",
    // and `= any('{}')` would match nothing at all.
    stage_filter: stages.length > 0 ? [...new Set(stages)] : null,
    industry_filter: industries.length > 0 ? [...new Set(industries)] : null,
    city_filter: cities.length > 0 ? [...new Set(cities)] : null,
    investor_filter: filters.investor,
    min_amount: minAmount,
    since_date: since,
    sort_mode: filters.sort,
    page_limit: pageSize,
    page_offset: (filters.page - 1) * pageSize,
  };
}

/** True when anything is narrowing the feed — drives the "clear filters" affordance. */
export function hasActiveFilters(filters: FundingFilters): boolean {
  return (
    Boolean(filters.q) ||
    Boolean(filters.investor) ||
    filters.stages.length > 0 ||
    filters.industries.length > 0 ||
    filters.geos.length > 0 ||
    filters.amount !== "any" ||
    filters.date !== "all"
  );
}

/**
 * A stable string for the filter set, used as a cache key and as a React `key`
 * that forces the accumulating list to reset when the query changes.
 *
 * Sorted, so `?stage=seed,series-a` and `?stage=series-a,seed` are one cache
 * entry rather than two.
 */
export function fundingFilterKey(filters: FundingFilters): string {
  return [
    filters.q ?? "",
    [...filters.stages].sort().join("|"),
    [...filters.industries].sort().join("|"),
    [...filters.geos].sort().join("|"),
    filters.amount,
    filters.date,
    filters.investor ?? "",
    filters.sort,
  ].join(":");
}
