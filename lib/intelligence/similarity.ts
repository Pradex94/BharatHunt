/**
 * Product-to-product similarity, computed in a background job and stored in
 * `product_similarities` — never on a page render.
 *
 * Two signals, blended:
 *
 *   - **Text** (50%): TF-IDF cosine over the listing's own words. Catches the
 *     specific vocabulary two products share ("ATS", "Veo", "DSA") that no
 *     lexicon will ever list.
 *   - **Concepts** (45%): weighted overlap of the concept sets from
 *     `knowledge.ts`, with partial credit for neighbouring concepts. This is
 *     what makes similarity cross-category — an AI writing tool filed under
 *     Productivity sits next to a LinkedIn post generator filed under
 *     Marketing because both name content creation.
 *   - **Same category** (5%): a tie-breaker, never enough on its own.
 *
 * What is *not* an input, on purpose: upvotes, views, saves, recency. A
 * product with ten votes must be able to appear beside one with a thousand
 * if it does the same job; popularity belongs to trending, not to "similar".
 *
 * Cost: all pairs, so O(n²) over sparse vectors — ~25k pairs at today's 159
 * products, a few milliseconds. At ~5k products swap the pair loop for an
 * inverted index over terms; the stored output does not change.
 */

import { conceptByKey, conceptsRelated, conceptWeight } from "./concepts.ts";
import { isJobConcept, type KnowledgeInput, type ProductKnowledge } from "./knowledge.ts";
import { tokenize } from "./text.ts";

export const SIMILARITY_METHOD = "tfidf-concepts-v1";

export const WEIGHTS = { text: 0.5, concepts: 0.45, category: 0.05 } as const;

/** Below this a pair is noise and is not stored. */
export const MIN_SIMILARITY = 0.15;

/**
 * A pair must overlap on at least one signal by this much. Without it, two
 * unrelated listings in the same category could clear MIN_SIMILARITY on the
 * category nudge plus a stray shared word — and a product with no real peers
 * is better served by an empty section than by filler.
 */
export const MIN_SIGNAL = 0.15;

/** Listings this thin ("wedfhjk") carry no signal and are neither matched nor shown. */
export const MIN_TOKENS = 4;

export type SimilarityItem = KnowledgeInput & { knowledge: ProductKnowledge };

export type SimilarEntry = {
  similarId: string;
  score: number;
  textScore: number;
  conceptScore: number;
  sameCategory: boolean;
  /** Concept keys both listings name, most telling first. */
  sharedConcepts: string[];
};

type Vector = Map<string, number>;

function documentTokens(item: KnowledgeInput): string[] {
  // The tagline is the maker's one-line pitch, so it counts twice.
  return [
    ...tokenize(item.name),
    ...tokenize(item.tagline),
    ...tokenize(item.tagline),
    ...tokenize((item.tags ?? []).join(" ")),
    ...tokenize(item.description),
  ];
}

function termCounts(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  return counts;
}

/** Smoothed inverse document frequency over a set of listings. */
export type Idf = { weight: (term: string) => number; documentShare: (term: string) => number };

export function buildIdf(items: KnowledgeInput[]): Idf {
  const documentFrequency = new Map<string, number>();
  for (const item of items) {
    for (const term of new Set(documentTokens(item))) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }
  const total = Math.max(items.length, 1);
  return {
    weight: (term) => Math.log((total + 1) / ((documentFrequency.get(term) ?? 0) + 1)) + 1,
    documentShare: (term) => (documentFrequency.get(term) ?? 0) / total,
  };
}

/**
 * An L2-normalised TF-IDF vector for any token list against `idf`.
 * `maxShare` drops terms that more than that share of documents use.
 */
export function vectorize(tokens: string[], idf: Idf, maxShare = 1): Vector {
  const vector: Vector = new Map();
  let norm = 0;
  for (const [term, count] of termCounts(tokens)) {
    if (idf.documentShare(term) > maxShare) continue;
    const weight = (1 + Math.log(count)) * idf.weight(term);
    vector.set(term, weight);
    norm += weight * weight;
  }
  norm = Math.sqrt(norm);
  if (norm > 0) for (const [term, weight] of vector) vector.set(term, weight / norm);
  return vector;
}

/**
 * L2-normalised TF-IDF vectors, keyed by product id, for product-to-product
 * similarity over the whole catalogue. Terms more than half the catalogue
 * uses are dropped — there, a word every listing has is no evidence of
 * anything. (Matching a request uses `vectorize` without that cutoff: its
 * candidate pool was retrieved *because* it shares the request's words.)
 */
export function buildTermVectors(items: KnowledgeInput[]): Map<string, Vector> {
  const idf = buildIdf(items);
  const maxShare = items.length > 2 ? 0.5 : 1;
  return new Map(items.map((item) => [item.id, vectorize(documentTokens(item), idf, maxShare)]));
}

/** The tokens a listing contributes to its vector (tagline counted twice). */
export function listingTokens(item: KnowledgeInput): string[] {
  return documentTokens(item);
}

export function cosine(a: Vector, b: Vector): number {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [term, weight] of small) {
    const other = large.get(term);
    if (other) dot += weight * other;
  }
  return dot;
}

function jobConcepts(knowledge: ProductKnowledge): Map<string, number> {
  return new Map(
    knowledge.concepts
      .filter((concept) => isJobConcept(concept.key) && conceptWeight(concept.key) > 0)
      .map((concept) => [concept.key, concept.strength]),
  );
}

/**
 * Weighted soft Jaccard over concept strengths. A concept on one side that is
 * a *neighbour* of an unmatched concept on the other earns a third of a match,
 * so "video editing" and "AI video generation" count as related work.
 */
export function conceptOverlap(
  a: ProductKnowledge,
  b: ProductKnowledge,
): { score: number; shared: string[] } {
  const left = jobConcepts(a);
  const right = jobConcepts(b);
  if (left.size === 0 || right.size === 0) return { score: 0, shared: [] };

  let intersection = 0;
  let union = 0;
  const shared: { key: string; value: number }[] = [];

  for (const key of new Set([...left.keys(), ...right.keys()])) {
    const weight = conceptWeight(key);
    const l = left.get(key) ?? 0;
    const r = right.get(key) ?? 0;
    union += weight * Math.max(l, r);
    if (l > 0 && r > 0) {
      intersection += weight * Math.min(l, r);
      shared.push({ key, value: weight * Math.min(l, r) });
    }
  }

  const leftOnly = [...left.keys()].filter((key) => !right.has(key));
  const rightOnly = [...right.keys()].filter((key) => !left.has(key));
  const usedRight = new Set<string>();
  for (const l of leftOnly) {
    const partner = rightOnly.find((r) => !usedRight.has(r) && conceptsRelated(l, r));
    if (!partner) continue;
    usedRight.add(partner);
    intersection +=
      (1 / 3) *
      Math.min(conceptWeight(l), conceptWeight(partner)) *
      Math.min(left.get(l)!, right.get(partner)!);
  }

  const score = union > 0 ? Math.min(1, intersection / union) : 0;
  const ordered = shared
    .sort((x, y) => y.value - x.value)
    .map((entry) => entry.key)
    // "AI" says little next to anything more specific, so it is named only
    // when it is all two listings have in common.
    .filter((key, _index, list) => key !== "ai" || list.length === 1);
  return { score, shared: ordered };
}

function normalizedName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function hasSignal(item: KnowledgeInput): boolean {
  return documentTokens(item).length >= MIN_TOKENS;
}

/**
 * The top `topK` similar products for every item, strongest first.
 *
 * Items without enough text are skipped on both sides. Two listings with the
 * same name are the same product listed twice — a data problem, not a
 * recommendation — so they are never offered as each other's alternative.
 */
export function computeSimilarities(
  items: SimilarityItem[],
  options: { topK?: number; minScore?: number } = {},
): Map<string, SimilarEntry[]> {
  const topK = options.topK ?? 12;
  const minScore = options.minScore ?? MIN_SIMILARITY;
  const usable = items.filter(hasSignal);
  const vectors = buildTermVectors(usable);
  const results = new Map<string, SimilarEntry[]>();
  for (const item of items) results.set(item.id, []);

  for (let i = 0; i < usable.length; i += 1) {
    for (let j = i + 1; j < usable.length; j += 1) {
      const a = usable[i];
      const b = usable[j];
      if (normalizedName(a.name) === normalizedName(b.name)) continue;

      const textScore = cosine(vectors.get(a.id)!, vectors.get(b.id)!);
      const { score: conceptScore, shared } = conceptOverlap(a.knowledge, b.knowledge);
      if (textScore < MIN_SIGNAL && conceptScore < MIN_SIGNAL) continue;
      const sameCategory = a.category === b.category && a.category !== "Other";
      const score =
        WEIGHTS.text * textScore +
        WEIGHTS.concepts * conceptScore +
        (sameCategory ? WEIGHTS.category : 0);

      if (score < minScore) continue;
      const round = (value: number) => Math.round(value * 1000) / 1000;
      const base = {
        score: round(score),
        textScore: round(textScore),
        conceptScore: round(conceptScore),
        sameCategory,
        sharedConcepts: shared.slice(0, 4),
      };
      results.get(a.id)!.push({ similarId: b.id, ...base });
      results.get(b.id)!.push({ similarId: a.id, ...base });
    }
  }

  for (const [id, entries] of results) {
    results.set(
      id,
      entries
        .sort((x, y) => y.score - x.score || x.similarId.localeCompare(y.similarId))
        .slice(0, topK),
    );
  }
  return results;
}

/** "video editing, social media" — for a one-line reason under a card. */
export function sharedConceptPhrase(keys: string[], max = 2): string | null {
  const labels = keys
    .slice(0, max)
    .map((key) => conceptByKey(key)?.label)
    .filter((label): label is string => Boolean(label));
  if (labels.length === 0) return null;
  // Commas, not "and": the labels carry their own ("resumes and CVs"), and
  // "resumes and CVs and job search and careers" stops reading as a list.
  return labels.join(", ");
}
