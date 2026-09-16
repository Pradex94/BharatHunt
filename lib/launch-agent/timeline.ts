/**
 * The suggested launch sequence.
 *
 * A recommendation, not a schedule anyone enforces: queue-based directories
 * first (their dates are assigned weeks out), weekly communities next, the big
 * launch in the middle, discussion communities last. Each platform's
 * `launch_rules.phase` places it; `launch_rules.weekdays` snaps it to a day the
 * platform actually launches on. The maker can move any date.
 *
 * Dates are plain `YYYY-MM-DD` in UTC — a calendar day, not an instant.
 */

import type { LaunchPlatform, PlatformRecommendation, TimelineEntry } from "./types.ts";

/** Day number (BharatHunt publish = day 1) where each phase begins. */
const PHASE_START_DAY: Record<number, number> = { 1: 3, 2: 5, 3: 7, 4: 10, 5: 14 };
const DEFAULT_PHASE = 2;
const SPACING_DAYS = 2;

export function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const base = new Date(`${date}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return toDateString(base);
}

export function isDateString(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && toDateString(parsed) === value;
}

function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** First date on or after `date` that falls on an allowed weekday. */
export function snapToWeekday(date: string, weekdays: number[] | undefined): string {
  if (!weekdays || weekdays.length === 0) return date;
  let candidate = date;
  for (let step = 0; step < 7; step += 1) {
    if (weekdays.includes(weekdayOf(candidate))) return candidate;
    candidate = addDays(candidate, 1);
  }
  return date;
}

export function daysBetweenDates(from: string, to: string): number {
  return Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000);
}

/**
 * Day 1 is the BharatHunt launch when that was recent; an older launch starts
 * its plan today, so the first suggestion is never already in the past.
 */
export function planStartDate(publishedAt: string | null, now: Date): string {
  const today = toDateString(now);
  if (!publishedAt) return today;
  const published = new Date(publishedAt);
  if (Number.isNaN(published.getTime())) return today;
  const start = toDateString(published);
  return daysBetweenDates(start, today) <= 2 ? start : today;
}

export function buildLaunchTimeline(
  recommendations: PlatformRecommendation[],
  platforms: LaunchPlatform[],
  options: { publishedAt: string | null; now?: Date },
): { start: string; entries: TimelineEntry[] } {
  const now = options.now ?? new Date();
  const start = planStartDate(options.publishedAt, now);
  const today = toDateString(now);
  const bySlug = new Map(platforms.map((platform) => [platform.slug, platform]));

  const chosen = recommendations
    .filter((rec) => rec.recommended && bySlug.has(rec.slug))
    .map((rec) => ({ rec, platform: bySlug.get(rec.slug)! }))
    .sort(
      (a, b) =>
        (a.platform.launchRules.phase ?? DEFAULT_PHASE) - (b.platform.launchRules.phase ?? DEFAULT_PHASE) ||
        b.rec.fitScore - a.rec.fitScore,
    );

  const usedDates = new Set<string>();
  const phaseCursor = new Map<number, number>();
  const entries: TimelineEntry[] = [];

  for (const { rec, platform } of chosen) {
    const phase = platform.launchRules.phase ?? DEFAULT_PHASE;
    const offset = phaseCursor.get(phase) ?? 0;
    phaseCursor.set(phase, offset + 1);

    let date = addDays(start, (PHASE_START_DAY[phase] ?? 5) - 1 + offset * SPACING_DAYS);
    if (date < today) date = today;
    date = snapToWeekday(date, platform.launchRules.weekdays);
    // One big launch per day, where the platform's weekday rule allows moving it.
    for (let guard = 0; usedDates.has(date) && guard < 14; guard += 1) {
      date = snapToWeekday(addDays(date, 1), platform.launchRules.weekdays);
    }
    usedDates.add(date);

    entries.push({
      slug: rec.slug,
      platform: rec.platform,
      date,
      day: daysBetweenDates(start, date) + 1,
      label:
        platform.contentStyle === "show_hn"
          ? "Show HN"
          : phase === 1
            ? "Submit early (queue)"
            : platform.category === "community"
              ? "Community launch"
              : "Launch",
    });
  }

  entries.sort((a, b) => a.date.localeCompare(b.date) || a.platform.localeCompare(b.platform));
  return { start, entries };
}
