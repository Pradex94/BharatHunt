/**
 * Eligibility, selection and the auto-publish gate.
 *
 * Three questions, kept apart because they have different owners:
 *   - `decideEligibility`: may this candidate be offered at all, and does it
 *     need a human first? (Rules about the product.)
 *   - `selectTop`: which of the eligible ones make today's list? (Rules about
 *     the list.)
 *   - `mayAutoPublish`: may the agent put it live with nobody looking? (Rules
 *     about trust — deliberately stricter than eligibility.)
 *
 * Accuracy over quantity: nothing here relaxes a rule to reach the target. A
 * day with three eligible products selects three.
 *
 * Pure, so `tests/` can pin it.
 */

import type { SafetyAssessment } from "./safety.ts";
import type { CandidateStatus, Facts } from "./types.ts";

/** Below this, the India evidence is too thin even for a human to bother with. */
export const REVIEWABLE_INDIA_FLOOR = 35;
/** How far under the quality bar a candidate may be and still go to a human. */
export const REVIEWABLE_QUALITY_MARGIN = 10;

export type EligibilityInput = {
  reachable: boolean;
  robotsAllowed: boolean;
  parked: boolean;
  indiaConfidence: number;
  foreignHeadquarters: boolean;
  overallScore: number;
  facts: Facts;
  safety: SafetyAssessment;
  similarName: boolean;
  websiteInferred: boolean;
  thinDescription: boolean;
  minIndiaConfidence: number;
  minQualityScore: number;
};

export type Eligibility = { status: CandidateStatus; reason: string | null; issues: string[] };

export function decideEligibility(input: EligibilityInput): Eligibility {
  if (!input.robotsAllowed) {
    return { status: "skipped", reason: "robots.txt does not allow us to read this site", issues: [] };
  }
  if (!input.reachable) return { status: "ineligible", reason: "Website is unreachable or broken", issues: [] };
  if (input.parked) return { status: "ineligible", reason: "Domain is parked or for sale", issues: [] };
  if (input.safety.hard.length) {
    return {
      status: "ineligible",
      reason: `Safety: ${input.safety.hard.join(", ")} content in the site's own title or description`,
      issues: [],
    };
  }
  if (input.indiaConfidence < REVIEWABLE_INDIA_FLOOR) {
    return {
      status: "ineligible",
      reason: `India connection not established (confidence ${input.indiaConfidence})`,
      issues: [],
    };
  }
  if (input.overallScore < input.minQualityScore - REVIEWABLE_QUALITY_MARGIN) {
    return {
      status: "ineligible",
      reason: `Quality score ${input.overallScore} is well below the minimum ${input.minQualityScore}`,
      issues: [],
    };
  }

  const issues: string[] = [];
  if (input.indiaConfidence < input.minIndiaConfidence) issues.push("low_india_confidence");
  if (input.foreignHeadquarters) issues.push("foreign_headquarters");
  if (input.websiteInferred) issues.push("website_inferred");
  if (input.facts.pricingType === null) issues.push("pricing_unknown");
  if (input.facts.waitlistOnly) issues.push("waitlist_only");
  if (input.similarName) issues.push("similar_name");
  if (input.thinDescription) issues.push("thin_description");
  if (!input.facts.logoUrl) issues.push("no_logo");
  if (input.facts.serviceSignals > input.facts.productSignals) issues.push("service_business");
  if (input.safety.soft.includes("misleading_claims")) issues.push("misleading_claims");
  if (input.safety.soft.some((flag) => flag !== "misleading_claims")) issues.push("safety_body_text");

  // Cosmetic gaps an admin fixes in the editor; they don't make a product
  // questionable, so they don't block "eligible" on their own.
  const cosmetic = new Set(["pricing_unknown", "no_logo", "thin_description"]);
  const questionable = issues.filter((issue) => !cosmetic.has(issue));
  const belowBar = input.overallScore < input.minQualityScore;

  if (questionable.length || belowBar) {
    return {
      status: "needs_review",
      reason: belowBar ? `Quality score ${input.overallScore} is under the minimum ${input.minQualityScore}` : null,
      issues,
    };
  }
  return { status: "eligible", reason: null, issues };
}

export type SelectableCandidate = {
  id: string;
  overallScore: number;
  indiaConfidence: number;
  category: string;
  discoveredAt: string;
};

/**
 * The day's picks: best overall score first, at most `perCategory` from one
 * category while there are alternatives — a list of five fintech apps is a
 * worse discovery list than the scores alone would suggest. If the cap leaves
 * slots empty, they are filled from the remainder in score order rather than
 * left empty: diversity is a preference, the target is not a reason to skip a
 * verified product.
 */
export function selectTop(candidates: SelectableCandidate[], target: number, perCategory = 2): string[] {
  const ranked = [...candidates].sort(
    (a, b) =>
      b.overallScore - a.overallScore ||
      b.indiaConfidence - a.indiaConfidence ||
      a.discoveredAt.localeCompare(b.discoveredAt) ||
      a.id.localeCompare(b.id),
  );
  const picked: SelectableCandidate[] = [];
  const perCat = new Map<string, number>();
  for (const candidate of ranked) {
    if (picked.length >= target) break;
    const count = perCat.get(candidate.category) ?? 0;
    if (count >= perCategory) continue;
    picked.push(candidate);
    perCat.set(candidate.category, count + 1);
  }
  for (const candidate of ranked) {
    if (picked.length >= target) break;
    if (!picked.includes(candidate)) picked.push(candidate);
  }
  return picked.map((candidate) => candidate.id);
}

/**
 * Whether the agent may publish this with nobody looking. Every condition
 * must hold; anything unknown is a no.
 */
export function mayAutoPublish(candidate: {
  status: CandidateStatus;
  indiaConfidence: number | null;
  overallScore: number | null;
  issues: string[];
  pricingKnown: boolean;
  websiteInferred: boolean;
  minIndiaConfidence: number;
  minQualityScore: number;
}): boolean {
  return (
    candidate.status === "selected" &&
    (candidate.indiaConfidence ?? 0) >= candidate.minIndiaConfidence &&
    (candidate.overallScore ?? 0) >= candidate.minQualityScore &&
    candidate.issues.length === 0 &&
    candidate.pricingKnown &&
    !candidate.websiteInferred
  );
}

/** The dashboard's headline when the day came up short. Null when it didn't. */
export function shortfallMessage(selected: number, target: number): string | null {
  if (selected >= target) return null;
  if (selected === 0) return "No verified products found today.";
  return `Only ${selected} verified product${selected === 1 ? "" : "s"} found today.`;
}
