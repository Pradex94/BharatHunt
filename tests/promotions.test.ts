import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatDuration, formatInr, formatPaise, promotionWindow } from "../lib/promotions.ts";

/**
 * The pure half of the promotion system: the figure a customer is shown, and
 * the window they are buying. Both are things a mistake in would be silent —
 * a wrong rupee figure looks like a price, and a wrong end date looks like a
 * date — so they are checked here rather than eyeballed on a page.
 */

describe("formatInr", () => {
  it("groups the Indian way", () => {
    assert.equal(formatInr(950), "₹950");
    assert.equal(formatInr(2400), "₹2,400");
    assert.equal(formatInr(120000), "₹1,20,000");
    assert.equal(formatInr(10000000), "₹1,00,00,000");
  });

  it("handles small and negative values", () => {
    assert.equal(formatInr(0), "₹0");
    assert.equal(formatInr(7), "₹7");
    assert.equal(formatInr(-2400), "-₹2,400");
  });

  it("rounds rather than emitting a fraction", () => {
    assert.equal(formatInr(2400.6), "₹2,401");
  });
});

describe("formatPaise", () => {
  it("renders whole rupees without a decimal part", () => {
    assert.equal(formatPaise(49900), "₹499");
    assert.equal(formatPaise(499900), "₹4,999");
    assert.equal(formatPaise(99900), "₹999");
  });

  /*
   * Indian digit grouping, not thousands: 2,49,900 paise is ₹2,499 and a
   * hundred thousand rupees is ₹1,00,000, never ₹100,000. `formatInr` owns the
   * rule; this asserts the paise wrapper does not lose it.
   */
  it("groups in the Indian style", () => {
    assert.equal(formatPaise(10000000), "₹1,00,000");
    assert.equal(formatPaise(100000000), "₹10,00,000");
  });

  /*
   * The column holds paise, so a price of ₹499.50 is representable. Rounding it
   * away on a payment screen would show a figure that is not what the card is
   * about to be charged.
   */
  it("keeps fractional rupees when a price has them", () => {
    assert.equal(formatPaise(49950), "₹499.50");
    assert.equal(formatPaise(49901), "₹499.01");
  });

  it("handles zero", () => {
    assert.equal(formatPaise(0), "₹0");
  });
});

describe("formatDuration", () => {
  it("pluralises days", () => {
    assert.equal(formatDuration(1), "1 day");
    assert.equal(formatDuration(7), "7 days");
    assert.equal(formatDuration(30), "30 days");
  });
});

describe("promotionWindow", () => {
  it("ends exactly the bought number of days after it starts", () => {
    const start = new Date("2026-08-28T10:00:00.000Z");
    const { startsAt, endsAt } = promotionWindow(start, 7);

    assert.equal(startsAt, "2026-08-28T10:00:00.000Z");
    assert.equal(endsAt, "2026-09-04T10:00:00.000Z");
  });

  /*
   * Measured in absolute milliseconds rather than by incrementing a calendar
   * field. A customer buying seven days across an IST/UTC boundary or a month
   * end gets seven days, not "the 4th, whatever that turns out to be".
   */
  it("crosses month and year boundaries without drifting", () => {
    const { endsAt } = promotionWindow(new Date("2026-12-29T18:30:00.000Z"), 7);
    assert.equal(endsAt, "2027-01-05T18:30:00.000Z");

    const acrossFebruary = promotionWindow(new Date("2028-02-25T00:00:00.000Z"), 7);
    // 2028 is a leap year: the 29th exists, so seven days from the 25th is
    // 3 March, not 4 March.
    assert.equal(acrossFebruary.endsAt, "2028-03-03T00:00:00.000Z");
  });

  it("returns ISO strings, which is what the timestamptz columns take", () => {
    const { startsAt, endsAt } = promotionWindow(new Date(), 7);
    assert.match(startsAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.match(endsAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.ok(new Date(endsAt) > new Date(startsAt));
  });
});
