import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  calculateRaise,
  formatRunway,
  SUGGESTED_RUNWAY_MONTHS,
} from "../lib/funding/calculator.ts";

/**
 * The calculator's contract is that every output is the founder's own numbers
 * rearranged. These assertions check the arithmetic, and — more importantly —
 * that it never produces a figure from nothing.
 */

const BASE = {
  monthlyBurn: 1_000_000,
  currentCash: 6_000_000,
  targetRunwayMonths: 18,
  hiringBudget: 500_000,
  marketingBudget: 200_000,
  growthBudget: 300_000,
};

describe("calculateRaise", () => {
  it("adds the new spending to the burn", () => {
    const result = calculateRaise(BASE);
    assert.equal(result.projectedMonthlyBurn, 2_000_000);
  });

  it("sizes the requirement against the target runway", () => {
    const result = calculateRaise(BASE);
    assert.equal(result.grossRequirement, 2_000_000 * 18);
  });

  it("adds a 20% buffer for the round taking time to close", () => {
    const result = calculateRaise(BASE);
    assert.equal(result.buffer, Math.round(2_000_000 * 18 * 0.2));
  });

  it("subtracts cash already in the bank", () => {
    const result = calculateRaise(BASE);
    assert.equal(result.estimatedRaise, 36_000_000 + 7_200_000 - 6_000_000);
  });

  it("reports current runway as cash over burn", () => {
    assert.equal(calculateRaise(BASE).currentRunwayMonths, 6);
  });

  it("reports the runway the raise actually buys", () => {
    const result = calculateRaise(BASE);
    assert.equal(
      result.resultingRunwayMonths,
      (BASE.currentCash + result.estimatedRaise) / result.projectedMonthlyBurn,
    );
  });

  it("floors the raise at zero when existing cash already covers the plan", () => {
    const result = calculateRaise({ ...BASE, currentCash: 500_000_000 });
    assert.equal(result.estimatedRaise, 0);
    assert.ok(result.notes.some((note) => /already covers/i.test(note)));
  });

  it("produces nothing from nothing", () => {
    // The property that matters: empty inputs must not yield a plausible
    // number. A calculator that invents a figure is indistinguishable, on
    // screen, from one fed real data.
    const result = calculateRaise({
      monthlyBurn: 0,
      currentCash: 0,
      targetRunwayMonths: 0,
      hiringBudget: 0,
      marketingBudget: 0,
      growthBudget: 0,
    });
    assert.equal(result.estimatedRaise, 0);
    assert.equal(result.grossRequirement, 0);
    assert.ok(result.notes.length > 0);
  });

  it("treats negative and non-finite input as zero rather than propagating it", () => {
    const result = calculateRaise({
      ...BASE,
      monthlyBurn: -5_000_000,
      hiringBudget: Number.NaN,
      marketingBudget: Number.POSITIVE_INFINITY,
      growthBudget: 0,
    });
    assert.equal(result.projectedMonthlyBurn, 0);
    assert.equal(result.estimatedRaise, 0);
  });

  it("reports an unbounded runway when there is no burn", () => {
    const result = calculateRaise({ ...BASE, monthlyBurn: 0, hiringBudget: 0, marketingBudget: 0, growthBudget: 0 });
    assert.equal(result.currentRunwayMonths, Infinity);
  });
});

describe("calculateRaise — the notes", () => {
  it("warns when the target runway is too short to raise again from", () => {
    const result = calculateRaise({ ...BASE, targetRunwayMonths: 9 });
    assert.ok(result.notes.some((note) => note.includes(String(SUGGESTED_RUNWAY_MONTHS))));
  });

  it("warns when the target runway is implausibly long", () => {
    const result = calculateRaise({ ...BASE, targetRunwayMonths: 36 });
    assert.ok(result.notes.some((note) => /smaller/i.test(note)));
  });

  it("warns when there is little runway left to raise in", () => {
    const result = calculateRaise({ ...BASE, currentCash: 2_000_000 });
    assert.ok(result.notes.some((note) => /three to six months/i.test(note)));
  });

  it("warns when the new spending is a step change", () => {
    const result = calculateRaise({ ...BASE, hiringBudget: 5_000_000 });
    assert.ok(result.notes.some((note) => /three times/i.test(note)));
  });

  it("says nothing when the plan is unremarkable", () => {
    assert.deepEqual(calculateRaise(BASE).notes, []);
  });
});

describe("formatRunway", () => {
  it("renders one decimal place", () => {
    assert.equal(formatRunway(18), "18.0 months");
    assert.equal(formatRunway(6.25), "6.3 months");
  });

  it("renders an em dash for an unbounded runway", () => {
    assert.equal(formatRunway(Infinity), "—");
  });

  it("renders zero rather than a negative", () => {
    assert.equal(formatRunway(0), "0 months");
    assert.equal(formatRunway(-3), "0 months");
  });
});
