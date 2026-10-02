/**
 * The quality score, as six named components and a weighted mean.
 *
 * Nothing here is a model's opinion. Each component is a count of things the
 * agent verified, so the number an admin sees can be traced to its causes, and
 * the weights are configuration (`daily_agent_configs.score_weights`).
 * Popularity is deliberately not an input: a product nobody has heard of yet is
 * the point of a discovery list.
 *
 * Pure, so `tests/` can pin it.
 */

import type { DuplicateCheck } from "./domain.ts";
import type { Facts, ScoreWeights, Scores } from "./types.ts";

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** How much of a listing the agent could fill with verified facts. */
export function completenessScore(facts: Facts): number {
  const checks = [
    Boolean(facts.productName),
    Boolean(facts.siteDescription && facts.siteDescription.length >= 40),
    Boolean(facts.aboutText),
    Boolean(facts.logoUrl),
    Boolean(facts.screenshotUrl),
    facts.pricingType !== null,
    Boolean(facts.companyName),
    Boolean(facts.stateCode || facts.city),
    Object.keys(facts.socialLinks).length > 0,
    Boolean(facts.category),
  ];
  return clamp((checks.filter(Boolean).length / checks.length) * 100);
}

/** Whether the site works and presents itself properly. */
export function websiteScore(
  facts: Facts,
  site: { reachable: boolean; hasDescription: boolean; hasOgImage: boolean },
): number {
  if (!site.reachable) return 0;
  let score = 35;
  if (facts.https) score += 20;
  if (site.hasDescription) score += 15;
  if (site.hasOgImage) score += 10;
  if (facts.logoUrl) score += 10;
  if (facts.responseMs !== null && facts.responseMs < 3000) score += 10;
  return clamp(score);
}

/** Distance from what BharatHunt already lists. */
export function uniquenessScore(duplicate: DuplicateCheck): number {
  if (duplicate.kind === "duplicate") return 0;
  if (duplicate.kind === "similar") return clamp(100 - duplicate.similarity * 60);
  return 100;
}

/** Can a visitor actually use it today? */
export function launchReadinessScore(facts: Facts): number {
  let score = 0;
  if (!facts.waitlistOnly) score += 40;
  score += Math.min(30, facts.productSignals * 6);
  if (facts.pricingType !== null) score += 15;
  if (Object.keys(facts.platformLinks).length > 0) score += 15;
  else if (facts.pagesRead.length > 1) score += 10;
  return clamp(score);
}

/** A product (app, SaaS, tool) rather than an agency, blog or storefront. */
export function relevanceScore(facts: Facts): number {
  const product = Math.min(10, facts.productSignals);
  const service = Math.min(10, facts.serviceSignals);
  let score = 50 + product * 5 - service * 8;
  if (facts.category && facts.category !== "Other") score += 10;
  return clamp(score);
}

export function weightedOverall(scores: Omit<Scores, "overallScore">, weights: ScoreWeights): number {
  const pairs: Array<[number, number]> = [
    [scores.indiaScore, weights.india],
    [scores.completenessScore, weights.completeness],
    [scores.websiteScore, weights.website],
    [scores.uniquenessScore, weights.uniqueness],
    [scores.launchReadinessScore, weights.launchReadiness],
    [scores.bharatHuntRelevanceScore, weights.relevance],
  ];
  const total = pairs.reduce((sum, [, weight]) => sum + weight, 0);
  if (total <= 0) return 0;
  return clamp(pairs.reduce((sum, [score, weight]) => sum + score * weight, 0) / total);
}

export function computeScores(input: {
  facts: Facts;
  indiaConfidence: number;
  duplicate: DuplicateCheck;
  site: { reachable: boolean; hasDescription: boolean; hasOgImage: boolean };
  weights: ScoreWeights;
}): Scores {
  const parts = {
    indiaScore: clamp(input.indiaConfidence),
    completenessScore: completenessScore(input.facts),
    websiteScore: websiteScore(input.facts, input.site),
    uniquenessScore: uniquenessScore(input.duplicate),
    launchReadinessScore: launchReadinessScore(input.facts),
    bharatHuntRelevanceScore: relevanceScore(input.facts),
  };
  return { ...parts, overallScore: weightedOverall(parts, input.weights) };
}
