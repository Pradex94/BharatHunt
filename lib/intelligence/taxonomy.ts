/**
 * Taxonomy review: which stored category a listing's own words point at, and
 * how sure that reading is.
 *
 * This never recategorises anything. It produces suggestions for an admin to
 * accept or ignore on /admin/intelligence — the maker chose the category, and
 * a lexicon reading their tagline is a second opinion, not a correction.
 *
 * Built on the concepts the knowledge model already derives (and keeps
 * evidence for), so a suggestion can always say which words it came from.
 * AI is deliberately not a category signal: it is a capability that runs
 * across every category, which is why the marketplace has an AI filter.
 *
 * Pure; relative `.ts` imports only.
 */

import { conceptByKey, conceptLabel, type ConceptGroup } from "./concepts.ts";
import type { ProductKnowledge } from "./knowledge.ts";

/** Mirrors PRODUCT_CATEGORIES in lib/constants.ts (which cannot load in plain Node). */
export type StoredCategory =
  | "Developer Tools"
  | "Productivity"
  | "Finance"
  | "Food & Drink"
  | "Design Tools"
  | "Marketing"
  | "Health & Fitness"
  | "Education"
  | "Social"
  | "Other";

/** Concept-level overrides, checked before the group mapping. */
const CONCEPT_CATEGORY: Record<string, StoredCategory | null> = {
  design: "Design Tools",
  "image-editing": "Design Tools",
  "image-generation": "Design Tools",
  "video-editing": "Design Tools",
  "video-generation": "Design Tools",
  "media-production": "Design Tools",
  "website-builder": "Developer Tools",
  analytics: "Productivity",
  "saas-management": "Productivity",
  health: "Health & Fitness",
  fitness: "Health & Fitness",
  wellbeing: "Health & Fitness",
  food: "Food & Drink",
  social: "Social",
  community: "Social",
  events: "Social",
  // Real jobs with no stored category of their own: no suggestion either way.
  pets: null,
  fashion: null,
  entertainment: null,
  news: null,
  civic: null,
  travel: null,
  "real-estate": null,
  kids: null,
  ecommerce: null,
  marketplace: null,
  "local-business": null,
  legal: null,
  hiring: null,
  logistics: null,
};

const GROUP_CATEGORY: Partial<Record<ConceptGroup, StoredCategory>> = {
  developer: "Developer Tools",
  productivity: "Productivity",
  files: "Productivity",
  finance: "Finance",
  marketing: "Marketing",
  sales: "Marketing",
  content: "Marketing",
  career: "Education",
  education: "Education",
};

/**
 * Concepts the listing itself states. A concept read off the `category`
 * field is the current category talking about itself — circular evidence, so
 * it neither supports nor suggests anything.
 */
function listingConcepts(knowledge: Pick<ProductKnowledge, "concepts">) {
  return knowledge.concepts.filter((concept) => concept.field !== "category");
}

export function categoryForConcept(key: string): StoredCategory | null {
  if (key in CONCEPT_CATEGORY) return CONCEPT_CATEGORY[key];
  const concept = conceptByKey(key);
  return concept ? (GROUP_CATEGORY[concept.group] ?? null) : null;
}

export type Classification = {
  suggested: StoredCategory | null;
  /** 0–1: the suggested category's share of the evidence, scaled down when the evidence is thin. */
  confidence: number;
  /** The concepts behind the suggestion, strongest first. */
  evidence: string[];
};

/** The category the listing's concepts point at, weighted by how prominently each is said. */
export function classify(knowledge: Pick<ProductKnowledge, "concepts">): Classification {
  const scores = new Map<StoredCategory, { score: number; evidence: string[] }>();
  let total = 0;
  for (const concept of listingConcepts(knowledge)) {
    const category = categoryForConcept(concept.key);
    if (!category) continue;
    const entry = scores.get(category) ?? { score: 0, evidence: [] };
    entry.score += concept.strength;
    entry.evidence.push(conceptLabel(concept.key));
    scores.set(category, entry);
    total += concept.strength;
  }
  const ranked = [...scores.entries()].sort((a, b) => b[1].score - a[1].score);
  if (ranked.length === 0) return { suggested: null, confidence: 0, evidence: [] };
  const [category, { score, evidence }] = ranked[0];
  // One weak mention is not a classification: below ~1 (a tagline-strength
  // concept), confidence is scaled down proportionally.
  const magnitude = Math.min(1, score);
  return { suggested: category, confidence: Math.round((score / total) * magnitude * 100) / 100, evidence };
}

export type ReviewFlag = "uncategorised" | "possible-mismatch" | "too-little-detail";

export type ReviewItem = Classification & { flag: ReviewFlag; current: string };

/** Confidence a move out of "Other" needs before it is worth an admin's time. */
export const REVIEW_CONFIDENCE = 0.6;

/**
 * Whether a product's category deserves a look, and why:
 *   - uncategorised:     filed under "Other", but its listing clearly describes a stored category
 *   - possible-mismatch: its own category has no supporting evidence, and another has strong evidence
 *   - too-little-detail: nothing in the listing maps to any category — a thin listing, not a wrong one
 */
export function reviewCategory(current: string, knowledge: Pick<ProductKnowledge, "concepts">): ReviewItem | null {
  const result = classify(knowledge);
  if (!result.suggested) {
    return current === "Other" ? null : { ...result, flag: "too-little-detail", current };
  }
  if (result.suggested === current) return null;
  // Moving out of "Other" needs a clear destination.
  if (current === "Other") {
    return result.confidence >= REVIEW_CONFIDENCE ? { ...result, flag: "uncategorised", current } : null;
  }
  // A mismatch needs only clear evidence that nothing supports the current
  // category; the suggestion may itself be split (a creator tool is both
  // Marketing and Design), which the admin sees from the evidence list.
  const concepts = listingConcepts(knowledge);
  const supportsCurrent = concepts.some((concept) => categoryForConcept(concept.key) === current);
  const mapped = concepts.filter((concept) => categoryForConcept(concept.key)).reduce((sum, c) => sum + c.strength, 0);
  return supportsCurrent || mapped < 1 ? null : { ...result, flag: "possible-mismatch", current };
}
