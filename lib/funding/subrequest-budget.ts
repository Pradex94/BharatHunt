/**
 * How many outbound calls one ingestion run may make.
 *
 * Why this exists
 * ---------------
 * The app runs on Cloudflare Workers, where every `fetch` a single invocation
 * makes is a *subrequest* and the platform caps them. On the Workers Free plan
 * that cap is **50 external subrequests per invocation, and it cannot be
 * raised** — `limits.subrequests` in wrangler.jsonc maxes out at 50 there
 * (paid plans default to 10,000). Every Supabase call is external, so it counts.
 *
 * Found the hard way: the first production run made ~8 calls per article across
 * 40 articles, hit the ceiling after five, and then every remaining write threw
 * `Too many subrequests by single Worker invocation`. The failures were caught
 * and counted, so the run reported HTTP 200 with `errors: 8` — and, worse, the
 * two writes that record what happened (source health and the run log) were
 * themselves past the ceiling, so the run left no trace of having gone wrong.
 *
 * Two rules follow, and this module exists to enforce them:
 *
 *   1. **Stop before the ceiling, not at it.** A run that stops with budget left
 *      is a run that can still write its own log row. `reserve` is that
 *      headroom, and it is subtracted from the usable budget up front so no
 *      caller has to remember it.
 *   2. **Refuse work you cannot finish.** Checking `canAfford` before starting
 *      an article is what keeps a half-written article from happening: the
 *      article is simply left for the next run, which is safe because ingestion
 *      is idempotent by database constraint.
 *
 * Nothing here talks to the network — it only counts — so it is unit-tested in
 * plain Node like the rest of `lib/funding`.
 */

/**
 * The Workers Free plan ceiling. Not a tuning knob: it is the platform's number,
 * and on Free it is also the maximum `limits.subrequests` accepts.
 */
export const FREE_PLAN_SUBREQUEST_LIMIT = 50;

/**
 * Held back so the end-of-source bookkeeping always fits: marking the source
 * healthy or failed, and writing the run log. Six rather than two because a
 * failed source reads its own failure count before writing it, and because
 * being wrong in this direction costs one article, while being wrong in the
 * other direction costs the record of the entire run.
 */
export const RESERVED_SUBREQUESTS = 6;

/**
 * The most calls one article can cost, used as the pre-flight estimate.
 *
 * Counted from the worst path in `ingestItem`: insert the article, look up the
 * round behind a same-hash twin, the two event-level lookups, find-or-create
 * the company, insert the round, link investors, attach coverage, set the
 * article status. Deliberately an over-estimate — an article we decline to
 * start is retried next run, an article we start and cannot finish is the bug
 * this whole module exists to prevent.
 */
export const MAX_SUBREQUESTS_PER_ARTICLE = 12;

export type SubrequestBudget = {
  /** Calls spent so far. */
  readonly used: number;
  /** Usable calls, already net of the reserve. */
  readonly usable: number;
  /** Record `count` calls (default 1). Never throws; the guard is `canAfford`. */
  spend(count?: number): void;
  /** Calls left before the reserve is touched. Never negative. */
  remaining(): number;
  /** True when `cost` more calls still fit inside the usable budget. */
  canAfford(cost: number): boolean;
};

/**
 * Read the ceiling from the environment, falling back to the Free-plan number.
 *
 * `FUNDING_SUBREQUEST_LIMIT` is the one line to change after upgrading to
 * Workers Paid — the platform default there is 10,000, which turns the guard
 * into a formality rather than a constraint. An unparseable or non-positive
 * value falls back rather than throwing: a typo in an environment variable
 * should not stop ingestion, and the fallback is the safe direction.
 */
export function subrequestLimitFromEnv(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return FREE_PLAN_SUBREQUEST_LIMIT;
  return parsed;
}

export function createSubrequestBudget(
  limit: number = FREE_PLAN_SUBREQUEST_LIMIT,
  reserve: number = RESERVED_SUBREQUESTS,
): SubrequestBudget {
  // A reserve at or above the limit would leave nothing usable and stall the
  // run silently, which is the failure mode this module is meant to remove.
  // Clamp instead: some work with no headroom beats no work at all.
  const usable = Math.max(1, limit - Math.max(0, reserve));
  let used = 0;

  return {
    get used() {
      return used;
    },
    usable,
    spend(count = 1) {
      used += Math.max(0, count);
    },
    remaining() {
      return Math.max(0, usable - used);
    },
    canAfford(cost: number) {
      return used + Math.max(0, cost) <= usable;
    },
  };
}
