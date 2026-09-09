/**
 * The Funding Intelligence vocabulary.
 *
 * Framework-agnostic and safe to import from a client component — same contract
 * as `lib/constants.ts`, and for the same reason: the filter bar is interactive,
 * so it needs the stage/industry/geography lists in the browser, and it must not
 * drag a Supabase client along with them.
 *
 * `FUNDING_STAGES` is duplicated by the CHECK constraint on
 * `funding_rounds.funding_stage` (20260909000000). That duplication is
 * deliberate: the database is what makes a bad stage impossible, and this array
 * is what makes it typed. Change one, change the other.
 */

// ── Stages ───────────────────────────────────────────────────────────────

/** Every stage a round may carry. Order is the funding ladder, not alphabetical. */
export const FUNDING_STAGES = [
  "Bootstrapped",
  "Pre-seed",
  "Angel",
  "Seed",
  "Series A",
  "Series B",
  "Series C",
  "Series D+",
  "Debt",
  "Grant",
  "Venture Debt",
  "Acquisition",
  "Undisclosed",
] as const;

export type FundingStage = (typeof FUNDING_STAGES)[number];

/**
 * The seven buttons in the filter bar, which are not the thirteen stages.
 *
 * A filter bar is a set of choices someone actually wants to make, and nobody
 * browsing funding news wants "Series C" and "Series D+" as separate buttons —
 * so `Series C+` selects both. `value` is the URL token; `stages` is what the
 * query filters on. Anything not listed here (Bootstrapped, Angel, Acquisition,
 * Undisclosed) is still stored, still searchable and still rendered on a card;
 * it just does not earn a button.
 */
export const FUNDING_STAGE_FILTERS: { value: string; label: string; stages: FundingStage[] }[] = [
  { value: "pre-seed", label: "Pre-seed", stages: ["Pre-seed"] },
  { value: "seed", label: "Seed", stages: ["Seed"] },
  { value: "series-a", label: "Series A", stages: ["Series A"] },
  { value: "series-b", label: "Series B", stages: ["Series B"] },
  { value: "series-c-plus", label: "Series C+", stages: ["Series C", "Series D+"] },
  { value: "debt", label: "Debt", stages: ["Debt", "Venture Debt"] },
  { value: "grant", label: "Grant", stages: ["Grant"] },
];

/**
 * Badge colour per stage, in the tokens the design system already defines.
 *
 * Orange-only is the brand rule (design.md), so this is a value ramp rather
 * than a hue ramp: later stages get more orange, non-equity instruments get
 * neutral, and "Undisclosed" is deliberately the quietest thing on the card.
 */
export const FUNDING_STAGE_BADGE: Record<FundingStage, string> = {
  Bootstrapped: "bg-secondary-bg text-body",
  "Pre-seed": "bg-primary/8 text-primary",
  Angel: "bg-primary/8 text-primary",
  Seed: "bg-primary/12 text-primary",
  "Series A": "bg-primary/15 text-primary",
  "Series B": "bg-primary/20 text-primary",
  "Series C": "bg-primary/25 text-primary",
  "Series D+": "bg-primary text-white",
  Debt: "bg-amber-100 text-amber-800",
  "Venture Debt": "bg-amber-100 text-amber-800",
  Grant: "bg-secondary-bg text-body",
  Acquisition: "bg-surface-dark text-white",
  Undisclosed: "bg-secondary-bg text-muted",
};

// ── Industries ───────────────────────────────────────────────────────────

export const FUNDING_INDUSTRIES = [
  "Fintech",
  "SaaS",
  "AI",
  "Healthtech",
  "Edtech",
  "D2C",
  "Ecommerce",
  "Mobility",
  "Climate",
  "Deeptech",
  "Consumer",
  "Other",
] as const;

export type FundingIndustry = (typeof FUNDING_INDUSTRIES)[number];

// ── Geography ────────────────────────────────────────────────────────────

/**
 * The bucket a round's `city` column holds. Free-text `location` keeps whatever
 * the article said ("Gurugram-based"); this is the groupable version of it, and
 * a group-by needs a closed set.
 */
export const FUNDING_CITIES = [
  "Bengaluru",
  "Delhi NCR",
  "Mumbai",
  "Hyderabad",
  "Chennai",
  "Pune",
  "Other India",
  "Global",
] as const;

export type FundingCity = (typeof FUNDING_CITIES)[number];

/**
 * The geography filter, which is not the same list.
 *
 * "India" is a roll-up rather than a bucket — a round is in Bengaluru *and* in
 * India — so it expands to every Indian city rather than matching a literal
 * value. This is why the filter and the column are modelled separately: a
 * single list would force "India" to be a place a company can be instead of a
 * place a company is in.
 */
export const FUNDING_GEO_FILTERS: { value: string; label: string; cities: FundingCity[] }[] = [
  {
    value: "india",
    label: "India",
    cities: [
      "Bengaluru",
      "Delhi NCR",
      "Mumbai",
      "Hyderabad",
      "Chennai",
      "Pune",
      "Other India",
    ],
  },
  { value: "bengaluru", label: "Bengaluru", cities: ["Bengaluru"] },
  { value: "delhi-ncr", label: "Delhi NCR", cities: ["Delhi NCR"] },
  { value: "mumbai", label: "Mumbai", cities: ["Mumbai"] },
  { value: "hyderabad", label: "Hyderabad", cities: ["Hyderabad"] },
  { value: "chennai", label: "Chennai", cities: ["Chennai"] },
  { value: "pune", label: "Pune", cities: ["Pune"] },
  { value: "other", label: "Other", cities: ["Other India"] },
  { value: "global", label: "Global", cities: ["Global"] },
];

// ── Time ─────────────────────────────────────────────────────────────────

/** `days: null` means no lower bound. */
export const FUNDING_DATE_FILTERS: { value: string; label: string; days: number | null }[] = [
  { value: "today", label: "Today", days: 0 },
  { value: "7d", label: "Last 7 days", days: 7 },
  { value: "30d", label: "Last 30 days", days: 30 },
  { value: "3m", label: "Last 3 months", days: 90 },
  { value: "all", label: "All", days: null },
];

// ── Sorting and paging ───────────────────────────────────────────────────

export const FUNDING_SORTS = ["recent", "amount", "oldest"] as const;
export type FundingSort = (typeof FUNDING_SORTS)[number];

export const FUNDING_SORT_LABELS: Record<FundingSort, string> = {
  recent: "Latest",
  amount: "Largest",
  oldest: "Oldest",
};

/**
 * Rounds per page. Matches the `least(..., 60)` ceiling the `funding_search`
 * function enforces, which is the real bound — this is just the number the page
 * asks for.
 */
export const FUNDING_PAGE_SIZE = 20;

/** Investors per page on /funding/investors. */
export const FUNDING_INVESTORS_PAGE_SIZE = 24;

// ── Money ────────────────────────────────────────────────────────────────

/**
 * Rates used to put a non-INR round on the same axis as an INR one.
 *
 * These are approximations, and the schema treats them as such: the rate that
 * was applied is stamped onto the row (`funding_rounds.fx_rate_to_inr`) at
 * extraction time, so revising this table changes what *future* rounds convert
 * at and leaves history alone. A card never shows a converted figure — it shows
 * what the source reported — and any chart that adds currencies together says
 * so underneath.
 *
 * A currency absent from this table converts to nothing: `amount_inr` stays
 * null and the round is excluded from totals rather than being guessed at.
 *
 * USD is overridable because it is almost every non-INR round and the one worth
 * keeping current; the rest move slowly enough not to matter at chart
 * resolution. Set `FUNDING_USD_INR_RATE` to update it without a code change.
 */
export const FUNDING_FX_TO_INR: Record<string, number> = {
  INR: 1,
  USD: Number(process.env.FUNDING_USD_INR_RATE) || 88,
  EUR: 96,
  GBP: 112,
  SGD: 65,
  AED: 24,
  JPY: 0.58,
  AUD: 58,
  CAD: 63,
};

/** Currencies the schema's CHECK constraint accepts. */
export const FUNDING_CURRENCIES = Object.keys(FUNDING_FX_TO_INR);

/**
 * Amount-floor options, in rupees. Deliberately coarse: this is "show me the
 * big ones", not a numeric range input, and every value here is a figure an
 * Indian founder already thinks in.
 */
export const FUNDING_AMOUNT_FILTERS: { value: string; label: string; minInr: number | null }[] = [
  { value: "any", label: "Any amount", minInr: null },
  { value: "1cr", label: "₹1 Cr+", minInr: 10_000_000 },
  { value: "10cr", label: "₹10 Cr+", minInr: 100_000_000 },
  { value: "50cr", label: "₹50 Cr+", minInr: 500_000_000 },
  { value: "100cr", label: "₹100 Cr+", minInr: 1_000_000_000 },
];

// ── Freshness ────────────────────────────────────────────────────────────

/**
 * How long a cached funding read may be stale, in seconds.
 *
 * Short, because the page's own promise is a timestamp: it says "Last updated
 * N minutes ago" using the newest `published_at` in the data, so a cache that
 * outlived the claim would make the page's most prominent honesty feature into
 * its least accurate one.
 */
export const FUNDING_CACHE_TTL = 120;

/** Cache-key prefix, so one publish can drop every funding read at once. */
export const FUNDING_CACHE_PREFIX = "bh:funding:";

/**
 * How often the client re-asks the server whether there is anything new.
 *
 * Five minutes, and it is a `router.refresh()` rather than a subscription.
 * Supabase Realtime is not enabled on this project — nothing in the codebase
 * opens a channel — and turning it on to push rows that arrive when an
 * ingestion run happens to land would be infrastructure for an event that fires
 * a few times an hour. The wording on the page matches what this actually is:
 * "Last updated N minutes ago", never "live".
 */
export const FUNDING_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
