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
