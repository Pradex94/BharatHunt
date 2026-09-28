import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { groupFundingEvents, isSameFundingEvent } from "../lib/funding/grouping.ts";
import { formatReportedAmount } from "../lib/funding/format.ts";
import type { FundingRoundRow } from "../services/funding.ts";

function round(overrides: Partial<FundingRoundRow>): FundingRoundRow {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    startup_name: "Dextr AI",
    startup_slug: "dextr-ai",
    headline: "Dextr AI raises $6.7 Mn",
    summary: null,
    amount: "$6.7 Mn",
    amount_numeric: 6_700_000,
    currency: "USD",
    amount_inr: 589_600_000,
    funding_stage: "Seed",
    industry: "AI",
    sub_industry: null,
    location: null,
    city: null,
    investors: [],
    lead_investor: null,
    announcement_date: "2026-09-25",
    source_name: "BW Disrupt",
    source_url: `https://example.com/${overrides.id ?? Math.random()}`,
    source_published_at: "2026-09-25T06:00:00Z",
    logo_url: null,
    verified: true,
    extraction_method: "rules",
    is_featured: false,
    confidence_score: null,
    coverage: [],
    ...overrides,
  };
}

/**
 * The fixtures are the duplicates actually seen in the published feed on
 * 2026-09-29: Dextr AI three times (once under the misread name "for
 * hospitality") and ONYA twice with different stages.
 */
describe("groupFundingEvents", () => {
  it("merges a misread company name into the round its headline names", () => {
    const rows = [
      round({ id: "a", funding_stage: "Undisclosed", industry: "Healthtech", headline: "Hospitality AI startup Dextr AI raises $6.7 million", source_name: "Indian Startup News" }),
      round({ id: "b", headline: "Dextr AI Raises $6.7 Mn In Seed Funding" }),
      round({
        id: "c",
        startup_name: "for hospitality",
        startup_slug: "for-hospitality",
        headline: "Elevation Capital leads $6.7 Mn seed round in Dextr AI",
        lead_investor: "Elevation Capital",
        investors: ["Elevation Capital", "Foundation Capital"],
        source_name: "Entrackr",
      }),
    ];

    const grouped = groupFundingEvents(rows);
    assert.equal(grouped.length, 1);
    const [event] = grouped;
    assert.equal(event.startup_slug, "dextr-ai", "the majority, correctly-named record fronts it");
    assert.equal(event.funding_stage, "Seed");
    assert.equal(event.lead_investor, "Elevation Capital", "facts are filled in from the other records");
    assert.deepEqual(event.investors, ["Elevation Capital", "Foundation Capital"]);
    assert.equal(event.coverage.length, 2, "every other outlet stays attributed");
  });

  it("merges the same company reported with and without a stage", () => {
    const rows = [
      round({ id: "a", startup_name: "ONYA", startup_slug: "onya", funding_stage: "Undisclosed", amount: "Rs 12.5 Crore", amount_numeric: 125_000_000, currency: "INR", amount_inr: 125_000_000, announcement_date: "2026-09-25" }),
      round({ id: "b", startup_name: "ONYA", startup_slug: "onya", funding_stage: "Seed", amount: "Rs 12.5 crore", amount_numeric: 125_000_000, currency: "INR", amount_inr: 125_000_000, announcement_date: "2026-09-24", lead_investor: "Divisa Family Office" }),
    ];
    const grouped = groupFundingEvents(rows);
    assert.equal(grouped.length, 1);
    assert.equal(grouped[0].funding_stage, "Seed");
    assert.equal(grouped[0].coverage.length, 1);
  });

  it("keeps two rounds of one company apart when the amounts disagree", () => {
    const a = round({ id: "a", amount_inr: 100_000_000 });
    const b = round({ id: "b", amount_inr: 400_000_000, announcement_date: "2026-09-28" });
    assert.equal(isSameFundingEvent(a, b), false);
  });

  it("keeps rounds apart outside the date window", () => {
    const a = round({ id: "a", announcement_date: "2026-06-01" });
    const b = round({ id: "b", announcement_date: "2026-09-01" });
    assert.equal(groupFundingEvents([a, b]).length, 2);
  });

  it("does not merge different companies with the same amount", () => {
    const a = round({ id: "a" });
    const b = round({ id: "b", startup_name: "Rivet", startup_slug: "rivet", headline: "Rivet raises $6.7 Mn" });
    assert.equal(groupFundingEvents([a, b]).length, 2);
  });

  it("is only as verified as its least-checked record", () => {
    const grouped = groupFundingEvents([
      round({ id: "a" }),
      round({ id: "b", verified: false }),
    ]);
    assert.equal(grouped[0].verified, false);
  });

  it("preserves list order", () => {
    const rows = [
      round({ id: "x", startup_name: "Zed", startup_slug: "zed", headline: "Zed raises" , amount_inr: 1 }),
      round({ id: "a" }),
      round({ id: "b" }),
    ];
    assert.deepEqual(groupFundingEvents(rows).map((r) => r.startup_slug), ["zed", "dextr-ai"]);
  });
});

describe("formatReportedAmount — one house style, same figure", () => {
  it("normalises rupee wording", () => {
    assert.equal(formatReportedAmount({ amount: "Rs 12.5 Crore", amount_numeric: 125_000_000, currency: "INR" }), "₹12.5 Cr");
    assert.equal(formatReportedAmount({ amount: "₹4 Crore", amount_numeric: 40_000_000, currency: "INR" }), "₹4 Cr");
    assert.equal(formatReportedAmount({ amount_numeric: 14_550_000_000, currency: "INR" }), "₹1,455 Cr");
    assert.equal(formatReportedAmount({ amount_numeric: 5_000_000, currency: "INR" }), "₹50 L");
  });

  it("keeps foreign rounds in their own currency, in Mn/Bn", () => {
    assert.equal(formatReportedAmount({ amount: "$1 million", amount_numeric: 1_000_000, currency: "USD" }), "$1 Mn");
    assert.equal(formatReportedAmount({ amount_numeric: 77_000_000, currency: "USD" }), "$77 Mn");
    assert.equal(formatReportedAmount({ amount_numeric: 1_200_000_000, currency: "USD" }), "$1.2 Bn");
  });

  it("falls back to the verbatim string, and never invents a zero", () => {
    assert.equal(formatReportedAmount({ amount: "Rs 3 cr", amount_numeric: null }), "Rs 3 cr");
    assert.equal(formatReportedAmount({ amount: null, amount_numeric: null }), null);
    assert.equal(formatReportedAmount({ amount_numeric: 0, currency: "INR" }), null);
  });
});
