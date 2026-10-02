/**
 * One candidate, from fetched pages to a verdict: facts, India evidence,
 * scores, eligibility and the drafted listing.
 *
 * Everything the network produced arrives as plain data, so the whole decision
 * — the part that has to be right — is a pure function the tests can drive
 * with fixture HTML. lib/daily-agent/run.ts does the fetching around it.
 */

import { buildContent } from "./content.ts";
import type { DuplicateCheck } from "./domain.ts";
import { extractSite, looksParked, type FetchedPage } from "./extract.ts";
import { assessIndia } from "./india.ts";
import { assessSafety } from "./safety.ts";
import { computeScores } from "./score.ts";
import { decideEligibility, type Eligibility } from "./select.ts";
import type { DraftContent, Facts, IndiaSignal, ScoreWeights, Scores } from "./types.ts";

export type EvaluationInput = {
  name: string;
  host: string;
  pages: FetchedPage[];
  discoverySignals: IndiaSignal[];
  duplicate: DuplicateCheck;
  websiteInferred: boolean;
  sourceName: string;
  discoveredOn: string;
  categories: readonly string[];
  weights: ScoreWeights;
  minIndiaConfidence: number;
  minQualityScore: number;
};

export type Evaluation = {
  facts: Facts;
  indiaConfidence: number;
  signals: IndiaSignal[];
  scores: Scores;
  eligibility: Eligibility;
  content: DraftContent;
};

export function evaluateCandidate(input: EvaluationInput): Evaluation {
  const site = extractSite(input.pages);
  const india = assessIndia(site.pages, input.host, input.discoverySignals);
  const facts: Facts = { ...site.facts, stateCode: india.stateCode, city: india.city };
  const scores = computeScores({
    facts,
    indiaConfidence: india.confidence,
    duplicate: input.duplicate,
    site: { reachable: true, hasDescription: site.hasDescription, hasOgImage: site.hasOgImage },
    weights: input.weights,
  });
  const safety = assessSafety(site.headline, site.pages.map((page) => page.text).join("\n"));
  const eligibility = decideEligibility({
    reachable: true,
    robotsAllowed: true,
    parked: looksParked(input.pages[0]?.html ?? ""),
    indiaConfidence: india.confidence,
    foreignHeadquarters: india.foreignHeadquarters,
    overallScore: scores.overallScore,
    facts,
    safety,
    similarName: input.duplicate.kind === "similar",
    websiteInferred: input.websiteInferred,
    thinDescription: !site.hasDescription && !facts.aboutText,
    minIndiaConfidence: input.minIndiaConfidence,
    minQualityScore: input.minQualityScore,
  });
  const content = buildContent({
    name: facts.productName ?? input.name,
    facts,
    signals: india.signals,
    indiaConfidence: india.confidence,
    minIndiaConfidence: input.minIndiaConfidence,
    sourceName: input.sourceName,
    discoveredOn: input.discoveredOn,
    categories: input.categories,
  });
  return { facts, indiaConfidence: india.confidence, signals: india.signals, scores, eligibility, content };
}
