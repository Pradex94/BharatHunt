import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatDate } from "../lib/format-date.ts";

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
