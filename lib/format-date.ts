/**
 * Calendar dates that render identically on the server and in the browser.
 *
 * `toLocaleDateString()` with no locale uses whatever the *runtime* defaults
 * to, and the two runtimes disagree: Vercel's Node processes run in UTC with an
 * ICU default of en-US, while a maker in Pune renders en-IN in IST. The same
 * timestamp therefore becomes "8/22/2026" on the server and "23/8/2026" in the
 * browser -- a different format *and*, for anything logged in the 18:30-24:00
 * UTC window, a different day.
 *
 * In a client component that is a hydration mismatch: React finds text it did
 * not expect, throws away the server-rendered tree and logs error #418. In a
 * server component it is quieter but still wrong, showing US-formatted dates to
 * an Indian audience.
 *
 * Pinning both the locale and the time zone makes the output a pure function of
 * the timestamp, which is what both problems actually require. IST is the right
 * anchor here: the audience is Indian, so a launch stamped 01:00 IST should
 * read as that day, not as the previous one in UTC.
 */

/** The audience's clock. Every date on the site is rendered against it. */
const TIME_ZONE = "Asia/Kolkata";

const DATE_FORMAT = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: TIME_ZONE,
});

/**
 * `value` as a short date ("23 Aug 2026"), or null when there is nothing
 * sensible to show.
 *
 * Returns null rather than throwing or rendering "Invalid Date": callers put
 * this straight into JSX, and a missing or malformed timestamp should drop the
 * line, not break the page.
 */
export function formatDate(value: string | Date | null | undefined): string | null {
  if (value === null || value === undefined) return null;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return DATE_FORMAT.format(date);
}

/*
 * ── The IST calendar day ─────────────────────────────────────────────────
 *
 * "Today" is a claim the homepage makes, so it needs a definition that does not
 * depend on where the code runs. India has observed no DST since 1945, so IST
 * is a fixed +05:30 and the day boundary is pure arithmetic — no zone database
 * lookup, and identical on a Vercel function in UTC and a laptop in Pune.
 *
 * Shifting the instant forward by the offset and then reading it in UTC is the
 * whole trick: 2026-08-29T18:55Z becomes 2026-08-30T00:25Z, which is exactly
 * the IST wall-clock reading, and truncating that to midnight and shifting back
 * gives the UTC instant the IST day began at.
 */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** The IST calendar day `at` falls in, as `YYYY-MM-DD`. */
export function istDayKey(at: Date = new Date()): string {
  return new Date(at.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** The instant the IST day containing `at` began, as a UTC `Date`. */
export function istDayStart(at: Date = new Date()): Date {
  const shifted = new Date(at.getTime() + IST_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - IST_OFFSET_MS);
}

const DAY_FORMAT = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: TIME_ZONE,
});

/**
 * An IST day key as a badge reads it: "today", "yesterday", or "23 Aug".
 *
 * The relative words matter more than the date. A visitor who sees "Leading
 * today" is being told the board is live; one who sees "Leading 23 Aug" is
 * being told, honestly, that it is not. Returns null for a malformed key so the
 * caller can drop the claim rather than print "Invalid Date" — same contract as
 * `formatDate` above.
 */
export function formatLaunchDay(day: string, now: Date = new Date()): string | null {
  const date = new Date(`${day}T00:00:00+05:30`);
  if (Number.isNaN(date.getTime())) return null;

  if (day === istDayKey(now)) return "today";
  // One millisecond before today's IST midnight is, by construction, yesterday.
  if (day === istDayKey(new Date(istDayStart(now).getTime() - 1))) return "yesterday";

  return DAY_FORMAT.format(date);
}
