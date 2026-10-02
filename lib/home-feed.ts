/**
 * How the homepage turns one pool of recent launches into its three feeds.
 *
 * Pure and dependency-free (relative imports only), so `npm test` can pin the
 * rules without a database. The page fetches the pool once
 * (`getRecentLaunchPool`) and every section below is a view of it — three
 * sections, one query.
 *
 * The rules are about honesty more than layout. Every heading on the homepage
 * that names a time window ("Today's top launches") has to be true of the rows
 * under it, so the board carries the window it was actually built from and the
 * page prints that, rather than a fixed label over whatever survived.
 */

import { istDayKey, istDayStart } from "./format-date.ts";

/** The fields these rules read. Real rows carry more; they pass straight through. */
export type PoolProduct = {
  id: string;
  upvote_count: number | null;
  trend_score?: number | string | null;
  /** Absent on all-time leaderboard rows, which never need a date. */
  published_at?: string | null;
  /** 'maker' or 'daily_agent'. Absent means maker (rows from before the column). */
  source?: string | null;
};

/**
 * Curated Daily 5 picks are real products and appear in "Recently launched",
 * but they do not compete in the rankings: a product BharatHunt listed itself
 * must never push a maker's own launch off Today's Hunt or the daily board.
 */
export function isMakerLaunch(product: PoolProduct): boolean {
  return (product.source ?? "maker") === "maker";
}

/** A board must have at least this many launches before it earns its own heading. */
export const MIN_BOARD_SIZE = 3;

export const BOARD_SIZE = 5;

export type BoardScope =
  /** Launches from the current IST day. */
  | { kind: "today"; day: string }
  /** Launches from the most recent IST day that had any — not today. */
  | { kind: "day"; day: string }
  /** The last seven IST days. */
  | { kind: "week" }
  /** No window — the all-time upvote board, used when recent days are thin. */
  | { kind: "all-time" };

export type LaunchBoard<T> = { scope: BoardScope; products: (T & { rank: number })[] };

function num(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function publishedMs(product: PoolProduct): number {
  const ms = product.published_at ? Date.parse(product.published_at) : NaN;
  return Number.isFinite(ms) ? ms : 0;
}

/** Most upvotes first; the newer launch wins a tie, matching `getLeadingLaunch`. */
function byUpvotes(a: PoolProduct, b: PoolProduct): number {
  return num(b.upvote_count) - num(a.upvote_count) || publishedMs(b) - publishedMs(a);
}

/**
 * "Today's Hunt": the freshest launches, ordered by what people did with them
 * in the last 24 hours.
 *
 * `trend_score` is the database's 24-hour activity score. When nothing has
 * moved it is zero across the board and this degrades to newest-first, which
 * is still an honest reading of "fresh".
 */
export function pickTodaysHunt<T extends PoolProduct>(pool: T[], limit = 6): T[] {
  return pool
    .filter(isMakerLaunch)
    .sort(
      (a, b) =>
        num(b.trend_score) - num(a.trend_score) ||
        num(b.upvote_count) - num(a.upvote_count) ||
        publishedMs(b) - publishedMs(a),
    )
    .slice(0, limit);
}

/**
 * The daily launch board, widened only as far as it has to be.
 *
 * A young site often has one or two launches in a day, and a "Top 5" of two
 * cards is a worse homepage than a real five — but relabelling a week as
 * "today" would be a lie. So: the latest launch day if it has enough launches,
 * then the last seven days, then the all-time board. The scope travels with
 * the result and the heading is written from it.
 */
export function buildLaunchBoard<T extends PoolProduct, U extends PoolProduct = T>(
  pool: T[],
  allTime: U[],
  now: Date = new Date(),
  size = BOARD_SIZE,
): LaunchBoard<T | U> {
  const rank = <V extends PoolProduct>(products: V[]) =>
    [...products]
      .sort(byUpvotes)
      .slice(0, size)
      .map((product, index) => ({ ...product, rank: index + 1 }));

  const dated = pool.filter((product) => product.published_at && isMakerLaunch(product));
  const latest = dated.reduce<T | null>(
    (newest, product) => (!newest || publishedMs(product) > publishedMs(newest) ? product : newest),
    null,
  );

  if (latest) {
    const day = istDayKey(new Date(publishedMs(latest)));
    const onDay = dated.filter((product) => istDayKey(new Date(publishedMs(product))) === day);
    if (onDay.length >= MIN_BOARD_SIZE) {
      return {
        scope: day === istDayKey(now) ? { kind: "today", day } : { kind: "day", day },
        products: rank(onDay),
      };
    }

    const weekStart = istDayStart(now).getTime() - 6 * 86_400_000;
    const inWeek = dated.filter((product) => publishedMs(product) >= weekStart);
    if (inWeek.length >= MIN_BOARD_SIZE) {
      return { scope: { kind: "week" }, products: rank(inWeek) };
    }
  }

  return { scope: { kind: "all-time" }, products: rank(allTime.filter(isMakerLaunch)) };
}

/** Newest first, minus anything already shown higher up the page. */
export function pickRecentLaunches<T extends PoolProduct & { id: string }>(
  pool: T[],
  exclude: Iterable<string>,
  limit = 6,
): T[] {
  const skip = new Set(exclude);
  return [...pool]
    .filter((product) => !skip.has(product.id))
    .sort((a, b) => publishedMs(b) - publishedMs(a))
    .slice(0, limit);
}
