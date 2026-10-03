/**
 * Splits a product's precomputed similar products into the two sections the
 * product page shows, and writes the one-line reason under each.
 *
 *   - **Alternatives**: products doing the same job — they share a specific
 *     concept (not just "AI"). Each carries up to two *verified* differences.
 *   - **Similar products**: the rest, which overlap in vocabulary or in a
 *     neighbouring concept — often across categories.
 *
 * Pure, so the rules are tested rather than eyeballed.
 */

import { verifiedDifferences, type Difference } from "./differences.ts";
import type { KnowledgeInput, ProductKnowledge } from "./knowledge.ts";
import { sharedConceptPhrase } from "./similarity.ts";

type Side = KnowledgeInput & { knowledge: ProductKnowledge };

export type RelatedCandidate<P extends Side> = { product: P; sharedConcepts: string[] };

export type RelatedEntry<P extends Side> = {
  product: P;
  reason: string | null;
  differences: Difference[];
};

export function splitRelated<P extends Side>(
  base: Side,
  candidates: RelatedCandidate<P>[],
  options: { alternatives?: number; similar?: number } = {},
): { alternatives: RelatedEntry<P>[]; similar: RelatedEntry<P>[] } {
  const maxAlternatives = options.alternatives ?? 4;
  const maxSimilar = options.similar ?? 4;
  const alternatives: RelatedEntry<P>[] = [];
  const similar: RelatedEntry<P>[] = [];

  for (const { product, sharedConcepts } of candidates) {
    const specific = sharedConcepts.filter((key) => key !== "ai");
    const phrase = sharedConceptPhrase(specific.length > 0 ? specific : sharedConcepts);
    const reason = phrase ? `Both listings cover ${phrase}` : "Similar wording in both listings";

    if (specific.length > 0 && alternatives.length < maxAlternatives) {
      alternatives.push({ product, reason, differences: verifiedDifferences(base, product) });
    } else if (similar.length < maxSimilar) {
      similar.push({ product, reason, differences: [] });
    }
    if (alternatives.length >= maxAlternatives && similar.length >= maxSimilar) break;
  }

  return { alternatives, similar };
}
