import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  activeFilterCount,
  EMPTY_INVESTOR_FILTERS,
  formatCheque,
  formatChequeRange,
  formatPaise,
  INVESTOR_FREE_PREVIEW_LIMIT,
  INVESTOR_SECTORS,
  INVESTOR_STAGES,
  isFullInvestor,
  type InvestorFull,
  type InvestorPreview,
} from "../lib/investors.ts";

/**
 * The pure half of the Investor Directory.
 *
 * Everything here is a value a customer reads off a card or a price they are
 * about to be charged, and a mistake in any of it is silent — a wrong cheque
 * range still looks like a cheque range. Same reasoning as tests/promotions.ts,
 * against the second product.
 */

describe("formatPaise", () => {
  it("renders the plan price", () => {
    assert.equal(formatPaise(49900), "₹499");
  });

  /*
   * Indian digit grouping, not thousands. This is a second implementation of
   * the rule (lib/promotions.ts has the first — see the note there on why they
   * are deliberately not shared), so it is asserted independently rather than
   * assumed to agree.
   */
  it("groups in the Indian style", () => {
    assert.equal(formatPaise(10000000), "₹1,00,000");
    assert.equal(formatPaise(100000000), "₹10,00,000");
  });

  it("renders a fractional rupee rather than rounding a real price away", () => {
    assert.equal(formatPaise(49999), "₹499.99");
    assert.equal(formatPaise(49950), "₹499.50");
  });

  it("handles zero and small values", () => {
    assert.equal(formatPaise(0), "₹0");
    assert.equal(formatPaise(100), "₹1");
  });
});

describe("formatCheque", () => {
  /*
   * The unit ladder is the point. A founder reads "₹25L", not "₹2,500,000" —
   * and getting the boundary wrong (say, 10,00,000 rendering as "₹0.1Cr")
   * produces a figure that is technically right and unreadable.
   */
  it("uses lakh below a crore", () => {
    assert.equal(formatCheque(100000), "₹1L");
    assert.equal(formatCheque(2500000), "₹25L");
    assert.equal(formatCheque(9900000), "₹99L");
  });

  it("switches to crore at exactly one crore", () => {
    assert.equal(formatCheque(10000000), "₹1Cr");
    assert.equal(formatCheque(120000000), "₹12Cr");
  });

  it("keeps one decimal only when it says something", () => {
    assert.equal(formatCheque(15000000), "₹1.5Cr");
    assert.equal(formatCheque(20000000), "₹2Cr");
    assert.equal(formatCheque(250000), "₹2.5L");
  });

  it("falls back to thousands and then to plain grouping", () => {
    assert.equal(formatCheque(50000), "₹50K");
    assert.equal(formatCheque(900), "₹900");
    assert.equal(formatCheque(0), "₹0");
  });
});

describe("formatChequeRange", () => {
  it("renders a range", () => {
    assert.equal(formatChequeRange(2500000, 25000000), "₹25L – ₹2.5Cr");
  });

  /*
   * Null, not a placeholder. A card that prints "Cheque size: —" for half the
   * directory looks like a broken import; the caller omits the row instead, and
   * can only do that if this says so.
   */
  it("returns null when neither bound is recorded", () => {
    assert.equal(formatChequeRange(null, null), null);
    assert.equal(formatChequeRange(undefined, undefined), null);
  });

  it("handles a single open bound", () => {
    assert.equal(formatChequeRange(2500000, null), "₹25L+");
    assert.equal(formatChequeRange(null, 25000000), "Up to ₹2.5Cr");
  });

  it("collapses an equal range to one figure", () => {
    assert.equal(formatChequeRange(5000000, 5000000), "₹50L");
  });

  /*
   * Zero is a real floor an admin may type, and `|| null` anywhere in this path
   * would turn it into "not recorded". The service layer coerces with `??` for
   * the same reason; this is the assertion that the formatter agrees.
   */
  it("treats a zero minimum as a recorded figure", () => {
    assert.equal(formatChequeRange(0, 2500000), "₹0 – ₹25L");
  });
});

describe("isFullInvestor", () => {
  const preview: InvestorPreview = {
    id: "a",
    name: "Example Fund",
    firmName: null,
    logoUrl: null,
    location: null,
    investorType: null,
    stages: [],
    sectors: [],
    portfolio: [],
    checkSizeMinInr: null,
    checkSizeMaxInr: null,
    thesis: null,
    isSample: true,
  };

  /*
   * This narrowing is what stops the detail panel rendering a contact block for
   * a free-preview row. It keys on the *presence* of the field rather than its
   * value, because a paid row with no email on file is still a paid row — and
   * treating it as a preview would hide the website and LinkedIn beside it.
   */
  it("rejects a preview row", () => {
    assert.equal(isFullInvestor(preview), false);
  });

  it("accepts a full row whose contact fields are empty", () => {
    const full: InvestorFull = {
      ...preview,
      website: null,
      email: null,
      linkedin: null,
      contactDetails: null,
    };
    assert.equal(isFullInvestor(full), true);
  });
});

describe("activeFilterCount", () => {
  it("ignores the search term", () => {
    // `q` has its own visible control; the badge counts what the drawer holds.
    assert.equal(activeFilterCount({ ...EMPTY_INVESTOR_FILTERS, q: "fintech" }), 0);
  });

  it("counts each set filter once", () => {
    assert.equal(
      activeFilterCount({ ...EMPTY_INVESTOR_FILTERS, stage: "Seed", sector: "SaaS" }),
      2,
    );
    assert.equal(
      activeFilterCount({
        q: "x",
        stage: "Seed",
        sector: "SaaS",
        location: "Karnataka",
        investorType: "VC",
      }),
      4,
    );
  });

  it("starts at zero", () => {
    assert.equal(activeFilterCount(EMPTY_INVESTOR_FILTERS), 0);
  });
});

describe("vocabulary", () => {
  /*
   * Stage order is load-bearing, not cosmetic: the filter rail renders this
   * array directly, and an alphabetical list would put "Series A" above "Seed",
   * which reads as a bug to the founders this is for.
   */
  it("lists stages in the order a company passes through them", () => {
    assert.deepEqual(INVESTOR_STAGES.slice(0, 3), ["Pre-Seed", "Seed", "Series A"]);
  });

  it("has no duplicate sectors", () => {
    assert.equal(new Set(INVESTOR_SECTORS).size, INVESTOR_SECTORS.length);
  });

  /*
   * The free tier is a number the *query* applies (`getFreeInvestors` passes it
   * to `.limit()`), so this pins the contract the page's copy is written
   * against — "3-4 profiles" is the product, and a stray edit to 40 here would
   * give the directory away.
   */
  it("keeps the free preview to a handful", () => {
    assert.ok(INVESTOR_FREE_PREVIEW_LIMIT >= 3 && INVESTOR_FREE_PREVIEW_LIMIT <= 4);
  });
});
