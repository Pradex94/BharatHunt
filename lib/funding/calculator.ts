/**
 * "How much should I raise?" — the arithmetic behind the tool on /funding.
 *
 * Pure and client-safe: the inputs are numbers a founder types and the outputs
 * update as they type, so this runs in the browser. `tests/funding-calculator.test.ts`
 * runs the same functions.
 *
 * This is an estimate, and the UI says so in those words. What it is *not* is a
 * model with a view: there is no revenue projection, no assumed growth rate, no
 * implied valuation and no dilution figure. Everything below is the founder's
 * own numbers rearranged — runway is cash over burn, a raise is what the plan
 * costs minus what is in the bank — because a number this tool invented would
 * be indistinguishable, on screen, from one the founder supplied.
 */

export type CalculatorInput = {
  /** Rupees a month going out today. */
  monthlyBurn: number;
  /** Rupees in the bank today. */
  currentCash: number;
  /** Months of runway the round is meant to buy. */
  targetRunwayMonths: number;
  /** Additional monthly spend the raise is meant to fund. */
  hiringBudget: number;
  marketingBudget: number;
  growthBudget: number;
};

export type CalculatorResult = {
  /** Months the current balance lasts at the current burn. Infinity if burn is 0. */
  currentRunwayMonths: number;
  /** Burn after the new spending starts. */
  projectedMonthlyBurn: number;
  /** What `targetRunwayMonths` at the projected burn costs, before any cash on hand. */
  grossRequirement: number;
  /** The safety margin added on top. */
  buffer: number;
  /** The headline: gross + buffer − cash on hand, floored at zero. */
  estimatedRaise: number;
  /** Runway the raise actually buys, given the cash already in the bank. */
  resultingRunwayMonths: number;
  /** Things worth saying out loud about these particular numbers. */
  notes: string[];
};

/**
 * The margin added to the requirement.
 *
 * Twenty per cent, and it is not a fudge factor — it is the standard answer to
 * a specific, near-universal problem: a round takes months to close, and burn
 * does not pause while it does. A plan funded to exactly its own cost puts the
 * founder back in the market on the day the money runs out, which is the moment
 * with the least leverage.
 */
const BUFFER_RATE = 0.2;

/**
 * The runway convention this tool nudges toward.
 *
 * Eighteen months is the usual shape of an early-stage round in India as
 * elsewhere: roughly twelve months to build the results the next round needs,
 * and six to raise it. Shorter targets are not refused — plenty of bridges and
 * extensions are deliberately shorter — but they get a note rather than silence.
 */
export const SUGGESTED_RUNWAY_MONTHS = 18;

/** Non-negative, finite, and bounded. Anything else is 0. */
function money(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  // ₹1,000 crore a month is not a burn rate, it is a typo or a stress test.
  return Math.min(Math.round(value), 10_000_000_000);
}

function months(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(Math.round(value), 120);
}

export function calculateRaise(input: CalculatorInput): CalculatorResult {
  const monthlyBurn = money(input.monthlyBurn);
  const currentCash = money(input.currentCash);
  const hiring = money(input.hiringBudget);
  const marketing = money(input.marketingBudget);
  const growth = money(input.growthBudget);
  const targetRunwayMonths = months(input.targetRunwayMonths);

  const projectedMonthlyBurn = monthlyBurn + hiring + marketing + growth;
  const grossRequirement = projectedMonthlyBurn * targetRunwayMonths;
  const buffer = Math.round(grossRequirement * BUFFER_RATE);

  const estimatedRaise = Math.max(0, grossRequirement + buffer - currentCash);

  const currentRunwayMonths = monthlyBurn > 0 ? currentCash / monthlyBurn : Infinity;
  const resultingRunwayMonths =
    projectedMonthlyBurn > 0 ? (currentCash + estimatedRaise) / projectedMonthlyBurn : Infinity;

  const notes: string[] = [];

  if (projectedMonthlyBurn === 0) {
    notes.push("Enter a monthly burn to see a figure. With no burn there is nothing to fund.");
  }
  if (targetRunwayMonths === 0) {
    notes.push("Set a target runway — that is the number the raise is sized against.");
  }
  if (targetRunwayMonths > 0 && targetRunwayMonths < 12) {
    notes.push(
      `A ${targetRunwayMonths}-month target leaves little room to raise again. ${SUGGESTED_RUNWAY_MONTHS} months is the usual shape: about a year to build, about six months to raise.`,
    );
  }
  if (targetRunwayMonths > 30) {
    notes.push(
      "Beyond about 30 months, most investors will ask why the round is not smaller and the milestones nearer.",
    );
  }
  if (estimatedRaise === 0 && grossRequirement > 0) {
    notes.push("Your existing cash already covers this plan, buffer included.");
  }
  if (monthlyBurn > 0 && currentRunwayMonths < 6 && estimatedRaise > 0) {
    notes.push(
      `At today's burn you have about ${currentRunwayMonths.toFixed(1)} months of runway. Rounds usually take three to six months to close.`,
    );
  }
  if (hiring + marketing + growth > monthlyBurn * 3 && monthlyBurn > 0) {
    notes.push(
      "The new spending is more than three times your current burn. That is a step change investors will expect a plan for.",
    );
  }

  return {
    currentRunwayMonths,
    projectedMonthlyBurn,
    grossRequirement,
    buffer,
    estimatedRaise,
    resultingRunwayMonths,
    notes,
  };
}

/** "18.0 months", or "—" for an unbounded runway. Shared by the tool's three readouts. */
export function formatRunway(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value <= 0) return "0 months";
  return `${value.toFixed(1)} months`;
}
