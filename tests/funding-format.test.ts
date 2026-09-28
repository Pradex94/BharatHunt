import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  confidenceBand,
  convertedInrEstimate,
  displayAmount,
  formatDay,
  formatIstDateTime,
  initialsOf,
  formatInr,
  formatInrCompact,
  formatMonthKey,
  hostOf,
  relativeTime,
  sourceFaviconUrl,
  toInr,
  UNDISCLOSED_LABEL,
} from "../lib/funding/format.ts";

/**
 * The display rules are the trust rules: what a card is allowed to say about a
 * figure. The assertions that matter most here are the negative ones — that an
 * unreported amount never becomes a zero, and that nothing on a card is a
 * converted number.
 */

describe("formatInr — Indian units", () => {
  it("renders crore and lakh", () => {
    assert.equal(formatInr(220_000_000), "₹22 Cr");
    assert.equal(formatInr(97_000_000), "₹9.7 Cr");
    assert.equal(formatInr(5_000_000), "₹50 L");
  });

  it("drops a trailing zero but keeps a meaningful decimal", () => {
    // Rounding ₹8.5 Cr to ₹9 Cr would be changing a reported figure.
    assert.equal(formatInr(250_000_000), "₹25 Cr");
    assert.equal(formatInr(85_000_000), "₹8.5 Cr");
  });

  it("returns null rather than a zero for a missing amount", () => {
    assert.equal(formatInr(null), null);
    assert.equal(formatInr(undefined), null);
    assert.equal(formatInr(Number.NaN), null);
  });
});

describe("displayAmount — what a card shows", () => {
  it("prefers the figure exactly as the source wrote it", () => {
    assert.equal(
      displayAmount({ amount: "Rs 22 Cr", amount_numeric: 220_000_000, currency: "INR" }),
      "Rs 22 Cr",
    );
  });

  it("formats the parsed number when there is no reported string", () => {
    assert.equal(displayAmount({ amount: null, amount_numeric: 220_000_000, currency: "INR" }), "₹22 Cr");
  });

  it("keeps a foreign currency in its own units — it never converts", () => {
    // The rupee equivalent exists on the row for charts. It must never reach a
    // card, because the card's contract is "what the source reported".
    assert.equal(displayAmount({ amount: null, amount_numeric: 4_500_000, currency: "USD" }), "$4.5M");
  });

  it("returns null for an undisclosed amount, never zero", () => {
    assert.equal(displayAmount({ amount: null, amount_numeric: null, currency: null }), null);
    assert.equal(UNDISCLOSED_LABEL, "Undisclosed");
  });
});

describe("toInr — conversion for aggregation only", () => {
  it("is the identity for rupees", () => {
    assert.deepEqual(toInr(220_000_000, "INR"), { inr: 220_000_000, rate: 1 });
  });

  it("returns the rate it used, so the row can record it", () => {
    const converted = toInr(1_000_000, "USD");
    assert.ok(converted);
    assert.equal(converted.inr, 1_000_000 * converted.rate);
  });

  it("returns null for a currency it has no rate for", () => {
    // A guessed rate would misstate a total in a way nobody could see. Leaving
    // the round out of the total understates it in a way the page discloses.
    assert.equal(toInr(1_000_000, "BRL"), null);
  });

  it("returns null for a missing amount", () => {
    assert.equal(toInr(null, "USD"), null);
    assert.equal(toInr(undefined, "INR"), null);
  });
});

describe("relativeTime", () => {
  const now = new Date("2026-09-09T12:00:00Z");

  it("renders the brief's own example", () => {
    assert.equal(relativeTime("2026-09-09T10:00:00Z", now), "2 hours ago");
  });

  it("handles minutes, days and the singular", () => {
    assert.equal(relativeTime("2026-09-09T11:30:00Z", now), "30 minutes ago");
    assert.equal(relativeTime("2026-09-09T11:00:00Z", now), "1 hour ago");
    assert.equal(relativeTime("2026-09-08T12:00:00Z", now), "1 day ago");
  });

  it("switches to an absolute date past a week", () => {
    // "43 days ago" is a number the reader has to convert back into a date.
    assert.equal(relativeTime("2026-07-28T12:00:00Z", now), "on 28 Jul 2026");
  });

  it("says 'just now' for a source clock running ahead of ours", () => {
    assert.equal(relativeTime("2026-09-09T12:03:00Z", now), "just now");
  });

  it("returns null for missing or unparseable input", () => {
    assert.equal(relativeTime(null, now), null);
    assert.equal(relativeTime("not a date", now), null);
  });
});

describe("formatDay and formatMonthKey — runtime-independent", () => {
  it("renders the same string on any machine", () => {
    // Hard-coded, not "whatever this runtime produces" — the server and the
    // browser are different runtimes and a naive format differs between them.
    assert.equal(formatDay("2026-08-22T10:00:00Z"), "22 Aug 2026");
  });

  it("resolves the day in IST", () => {
    // 20:00 UTC is 01:30 the next morning in Kolkata.
    assert.equal(formatDay("2026-08-22T20:00:00Z"), "23 Aug 2026");
  });

  it("renders a month bucket", () => {
    assert.equal(formatMonthKey("2026-08"), "Aug 2026");
  });

  it("returns null rather than 'Invalid Date'", () => {
    assert.equal(formatDay(null), null);
    assert.equal(formatDay("nonsense"), null);
  });
});

describe("formatInrCompact — chart labels", () => {
  it("uses thousands of crore rather than a unit nobody reads", () => {
    assert.equal(formatInrCompact(12_400_000_000), "₹1.2K Cr");
    assert.equal(formatInrCompact(220_000_000), "₹22 Cr");
  });

  it("renders an em dash for nothing, not a zero", () => {
    assert.equal(formatInrCompact(0), "—");
    assert.equal(formatInrCompact(null), "—");
  });
});

describe("sourceFaviconUrl and hostOf", () => {
  it("derives a favicon endpoint from the article host", () => {
    assert.equal(
      sourceFaviconUrl("https://entrackr.com/news/abc"),
      "https://www.google.com/s2/favicons?sz=64&domain=entrackr.com",
    );
  });

  it("returns null for unusable input so the caller can skip the image", () => {
    assert.equal(sourceFaviconUrl("not a url"), null);
    assert.equal(sourceFaviconUrl(null), null);
  });

  it("strips www from a display host", () => {
    assert.equal(hostOf("https://www.inc42.com/buzz/x"), "inc42.com");
    assert.equal(hostOf("nope"), null);
  });
});

describe("convertedInrEstimate — a labelled conversion, never a replacement", () => {
  it("shows the stored rupee figure for a foreign-currency round", () => {
    assert.equal(convertedInrEstimate({ currency: "USD", amount_inr: 880_000_000 }), "₹88 Cr");
  });

  it("returns nothing for a rupee round — there is nothing to convert", () => {
    assert.equal(convertedInrEstimate({ currency: "INR", amount_inr: 250_000_000 }), null);
    assert.equal(convertedInrEstimate({ currency: null, amount_inr: 250_000_000 }), null);
  });

  it("returns nothing when no rupee figure was stored", () => {
    assert.equal(convertedInrEstimate({ currency: "USD", amount_inr: null }), null);
  });
});

describe("confidenceBand — a word, not a false-precision percentage", () => {
  it("bands the score", () => {
    assert.equal(confidenceBand(0.92), "high");
    assert.equal(confidenceBand(0.6), "medium");
    assert.equal(confidenceBand(0.3), "low");
  });

  it("accepts Postgres numerics, which arrive as strings", () => {
    assert.equal(confidenceBand("0.850"), "high");
  });

  it("returns null for missing or out-of-range scores", () => {
    assert.equal(confidenceBand(null), null);
    assert.equal(confidenceBand(undefined), null);
    assert.equal(confidenceBand(1.4), null);
    assert.equal(confidenceBand("nope"), null);
  });
});

describe("formatIstDateTime", () => {
  it("renders in India time whatever the server's zone", () => {
    // 19:12 UTC is 00:42 the next day in IST.
    const label = formatIstDateTime("2026-09-28T19:12:00Z");
    assert.ok(label?.startsWith("29 Sept 2026") || label?.startsWith("29 Sep 2026"), label ?? "");
    assert.ok(label?.endsWith("IST"));
  });

  it("returns null for unusable input", () => {
    assert.equal(formatIstDateTime(null), null);
    assert.equal(formatIstDateTime("garbage"), null);
  });
});

describe("initialsOf", () => {
  it("takes up to two initials", () => {
    assert.equal(initialsOf("Byte Ask"), "BA");
    assert.equal(initialsOf("zepto"), "Z");
    assert.equal(initialsOf("  "), "?");
  });
});
