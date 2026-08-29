import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatDate, formatLaunchDay, istDayKey, istDayStart } from "../lib/format-date.ts";

/**
 * The point of these assertions is that they are *absolute*, not relative to
 * the machine running them.
 *
 * A naive `toLocaleDateString()` passes any test written as "matches what this
 * runtime produces" -- which is precisely the bug it causes, since the server
 * and the browser are different runtimes. The expected strings below are
 * therefore hard-coded. On a developer's IST laptop a naive implementation
 * yields "23/8/2026"; on a UTC/en-US CI runner or a Vercel function it yields
 * "8/22/2026". Neither is "23 Aug 2026", so a regression fails here wherever
 * the suite happens to run.
 */

describe("formatDate — identical on every runtime", () => {
  it("renders the audience's format, not the runtime's default", () => {
    assert.equal(formatDate("2026-08-22T10:00:00Z"), "22 Aug 2026");
  });

  it("resolves the day in IST, not UTC", () => {
    // 20:00 UTC is 01:30 the next morning in Kolkata. A launch stamped then
    // belongs to the 23rd for an Indian reader, and rendering it as the 22nd on
    // the server and the 23rd in the browser is what breaks hydration.
    assert.equal(formatDate("2026-08-22T20:00:00Z"), "23 Aug 2026");
  });

  it("carries the IST offset across a year boundary", () => {
    assert.equal(formatDate("2025-12-31T19:00:00Z"), "1 Jan 2026");
  });

  it("accepts a Date as readily as an ISO string", () => {
    assert.equal(formatDate(new Date("2026-01-05T00:00:00Z")), "5 Jan 2026");
  });

  it("is a pure function of the timestamp", () => {
    // Two formats for one instant. Anything runtime-dependent would let these
    // drift apart under a different default locale or zone.
    const iso = "2026-03-14T06:45:00Z";
    assert.equal(formatDate(iso), formatDate(new Date(iso)));
  });
});

describe("formatDate — nothing to show", () => {
  it("returns null for null and undefined", () => {
    assert.equal(formatDate(null), null);
    assert.equal(formatDate(undefined), null);
  });

  it("returns null rather than rendering 'Invalid Date'", () => {
    // These land straight in JSX; a malformed timestamp should drop the line,
    // not print a browser's error string into the page.
    assert.equal(formatDate("not a date"), null);
    assert.equal(formatDate(""), null);
    assert.equal(formatDate(new Date("nonsense")), null);
  });
});

/**
 * The homepage hero claims a launch is "leading today", so what counts as today
 * has to be the audience's day, resolved identically on a Vercel function in
 * UTC and on a maker's IST laptop. The window between 18:30 and 24:00 UTC is
 * where a UTC-based implementation and this one disagree, and it is not a rare
 * corner: it is the Indian evening, when launches actually happen.
 */
describe("istDayKey / istDayStart — the IST calendar day", () => {
  it("puts the Indian evening on the Indian day", () => {
    // 18:55 UTC on the 29th is 00:25 on the 30th in Kolkata. This is the real
    // timestamp that first surfaced the bug.
    assert.equal(istDayKey(new Date("2026-08-29T18:55:58Z")), "2026-08-30");
  });

  it("keeps the Indian morning on the same day", () => {
    assert.equal(istDayKey(new Date("2026-08-29T10:52:03Z")), "2026-08-29");
  });

  it("starts the day at 18:30 UTC the evening before", () => {
    assert.equal(
      istDayStart(new Date("2026-08-30T05:00:00Z")).toISOString(),
      "2026-08-29T18:30:00.000Z",
    );
  });

  it("is idempotent — the start of a day is inside that day", () => {
    const start = istDayStart(new Date("2026-08-30T05:00:00Z"));
    assert.equal(istDayKey(start), "2026-08-30");
    assert.equal(istDayStart(start).getTime(), start.getTime());
  });

  it("holds across a year boundary", () => {
    assert.equal(istDayKey(new Date("2025-12-31T19:00:00Z")), "2026-01-01");
  });

  it("agrees with formatDate on which day a timestamp belongs to", () => {
    // Both read the same clock; a drift between them would show the badge one
    // day and the launch date another on the same card.
    const at = new Date("2026-08-29T18:55:58Z");
    assert.equal(formatDate(at), "30 Aug 2026");
    assert.equal(istDayKey(at), "2026-08-30");
  });
});

describe("formatLaunchDay — what the hero badge says", () => {
  const now = new Date("2026-08-30T09:00:00Z"); // 14:30 IST, 30 Aug

  it("names today as today", () => {
    assert.equal(formatLaunchDay("2026-08-30", now), "today");
  });

  it("names the day before as yesterday", () => {
    assert.equal(formatLaunchDay("2026-08-29", now), "yesterday");
  });

  it("dates anything older, so the badge stops claiming to be current", () => {
    // The bug this replaces: an 11-day-old launch sat under "Leading today".
    assert.equal(formatLaunchDay("2026-08-19", now), "19 Aug");
  });

  it("resolves 'today' against the IST day, not the UTC one", () => {
    // 20:00 UTC on the 30th is already 01:30 on the 31st in Kolkata, so a
    // launch stamped for the 31st is today's, not tomorrow's.
    const lateEvening = new Date("2026-08-30T20:00:00Z");
    assert.equal(formatLaunchDay("2026-08-31", lateEvening), "today");
    assert.equal(formatLaunchDay("2026-08-30", lateEvening), "yesterday");
  });

  it("returns null rather than rendering 'Invalid Date'", () => {
    assert.equal(formatLaunchDay("not a day", now), null);
    assert.equal(formatLaunchDay("", now), null);
  });
});
