/**
 * Turning timestamps and scores into the words on the page (sections 30 and 3).
 *
 * Pure, and framework-agnostic, so a server component and a client component
 * produce identical output from identical inputs. That is not a stylistic
 * preference here: "3 minutes ago" rendered on the server and re-rendered in the
 * browser is the classic hydration mismatch, and the way this file avoids it is
 * by taking `now` as an argument. The server passes its clock and the string it
 * produced; the client renders that string first and only recomputes after
 * mount, deliberately, in `components/ai/updated-ago.tsx`.
 *
 * The honesty rules live here too. `freshness()` will not describe a stale
 * pipeline as up to date, and `trendBadge()` returns null for a null score
 * rather than inventing a zero.
 */

import { formatDate } from "../format-date.ts";
import { FRESHNESS_STALE_MINUTES } from "./constants.ts";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * "Just now", "4 minutes ago", "3 hours ago", "Yesterday", "5 Sep 2026".
 *
 * The ladder the brief asks for, with two decisions worth stating:
 *
 *  - Anything under a minute is "Just now" rather than "12 seconds ago". A feed
 *    poll runs on a schedule, so second-level precision would be false
 *    precision about when the *world* learned something.
 *  - Past a week it becomes an absolute date. "Nine days ago" is harder to place
 *    than "31 Aug 2026", and by then the story is history rather than news.
 *
 * A future timestamp reads as "Just now" instead of "in 3 hours": the ingestion
 * already refuses future dates (`parsePublishedAt`), so one reaching here is a
 * clock disagreement, and clock disagreements should not produce science
 * fiction on a news page.
 */
export function relativeTime(
  value: string | Date | null | undefined,
  now: Date = new Date(),
): string | null {
  const date = toDate(value);
  if (!date) return null;

  const elapsed = now.getTime() - date.getTime();
  if (elapsed < MINUTE) return "Just now";

  if (elapsed < HOUR) {
    const minutes = Math.floor(elapsed / MINUTE);
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }

  if (elapsed < DAY) {
    const hours = Math.floor(elapsed / HOUR);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  const days = Math.floor(elapsed / DAY);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;

  return formatDate(date);
}

/**
 * The compact form for a card's meta row: "4m", "3h", "2d", then a date.
 *
 * A separate function rather than a flag, because the two are used in different
 * places for different reasons and a shared implementation with a mode
 * parameter would end up serving neither well.
 */
export function shortRelativeTime(
  value: string | Date | null | undefined,
  now: Date = new Date(),
): string | null {
  const date = toDate(value);
  if (!date) return null;

  const elapsed = now.getTime() - date.getTime();
  if (elapsed < MINUTE) return "now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h`;

  const days = Math.floor(elapsed / DAY);
  if (days < 7) return `${days}d`;
  return formatDate(date);
}

export type TrendBadge = {
  /** The rounded score, 0-100. */
  score: number;
  /** "Trending 94" — the label, without the arrow the UI adds. */
  label: string;
  /**
   * Only "rising" when we have two observations to compare. A story we have
   * seen once is not known to be rising, and section 15 exists precisely so the
   * page can tell the difference.
   */
  rising: boolean;
  /** Points gained since the comparison snapshot, when there is one. */
  delta: number | null;
};

/**
 * The badge for a story, or null when there is no score.
 *
 * Null is a real and frequent answer — a story with no usable publication time
 * is unrankable by design (see `computeTrendScore`) — and every caller must
 * render nothing rather than a placeholder. There is no "0" badge and no "—".
 */
export function trendBadge(
  score: number | null | undefined,
  previousScore?: number | null,
): TrendBadge | null {
  if (score === null || score === undefined || Number.isNaN(Number(score))) return null;

  const current = Math.round(Number(score));
  const previous =
    previousScore === null || previousScore === undefined ? null : Math.round(Number(previousScore));
  const delta = previous === null ? null : current - previous;

  return {
    score: current,
    label: `Trending ${current}`,
    rising: delta !== null && delta >= 3,
    delta,
  };
}

export type Freshness = {
  /** "Updated 4 minutes ago", or null when nothing has ever run. */
  label: string | null;
  /**
   * True when the last successful ingestion is older than
   * FRESHNESS_STALE_MINUTES. The page then says so instead of quietly ageing —
   * an aggregator that looks current while its pipeline is down is worse than
   * one that admits it.
   */
  stale: boolean;
  /** Minutes since the last successful run, for the admin screen. */
  ageMinutes: number | null;
};

export function freshness(
  lastSuccessAt: string | Date | null | undefined,
  now: Date = new Date(),
): Freshness {
  const date = toDate(lastSuccessAt);
  if (!date) return { label: null, stale: true, ageMinutes: null };

  const ageMinutes = Math.max(0, Math.floor((now.getTime() - date.getTime()) / MINUTE));
  const relative = relativeTime(date, now);

  return {
    label: relative ? `Updated ${relative.toLowerCase()}` : null,
    stale: ageMinutes > FRESHNESS_STALE_MINUTES,
    ageMinutes,
  };
}

/**
 * "Covered by 4 sources" / "Reported by TechCrunch".
 *
 * The one-source case names the publication instead of counting to one, because
 * "Covered by 1 source" is a sentence nobody writes.
 */
export function coverageLabel(sourceCount: number, topSource?: string | null): string | null {
  if (!Number.isFinite(sourceCount) || sourceCount <= 0) return null;
  if (sourceCount === 1) return topSource ? `Reported by ${topSource}` : "Reported by 1 source";
  return `Covered by ${sourceCount} sources`;
}

/**
 * A percentage change, or null.
 *
 * Mirrors the SQL side (`ai_trending_topics`), which already returns null when
 * the prior window was too small to divide by. This is the render-side guard:
 * a null must never become "0%" or "—%", it must become no percentage at all.
 */
export function changeLabel(changePct: number | null | undefined): string | null {
  if (changePct === null || changePct === undefined || !Number.isFinite(Number(changePct))) {
    return null;
  }
  const value = Math.round(Number(changePct));
  if (value === 0) return "No change";
  return `${value > 0 ? "↑" : "↓"} ${Math.abs(value)}%`;
}
