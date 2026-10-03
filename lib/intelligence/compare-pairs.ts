/**
 * Which "A vs B" comparison pages deserve to exist as indexable URLs.
 *
 * Every pair of products *can* be compared on /compare?products=a,b — that is
 * the working tool, noindex, unbounded. An indexable /compare/a-vs-b page is a
 * claim that people would search for this comparison and that the page has
 * something to say, so the bar is deliberate:
 *
 *   - the two are genuinely alike: one is in the other's top 3 similar
 *     products and the similarity is at least MIN_PAIR_SCORE;
 *   - they do the same job: they share a concept more specific than "AI";
 *   - both listings are substantial enough to be indexed themselves
 *     (`isIndexableProduct`) — a comparison of two thin listings is thin.
 *
 * At most MAX_PAIR_PAGES survive, best first. The rule is computed from data,
 * so pages appear and disappear with the catalogue — no doorway farm.
 *
 * Pure, so the rule is tested rather than trusted.
 */

export const PAIR_SEPARATOR = "-vs-";
export const MIN_PAIR_SCORE = 0.25;
export const MAX_PAIR_RANK = 3;
export const MAX_PAIR_PAGES = 300;

/** Slugs in alphabetical order, so a-vs-b and b-vs-a are one URL. */
export function pairSlug(a: string, b: string): string {
  return [a, b].sort().join(PAIR_SEPARATOR);
}

export function pairPath(a: string, b: string): string {
  return `/compare/${pairSlug(a, b)}`;
}

/**
 * Every way a pair slug could split into two product slugs. Product slugs can
 * themselves contain "-vs-", so a slug may be ambiguous; the caller keeps the
 * split whose two halves are real products.
 */
export function pairSplits(slug: string): [string, string][] {
  const splits: [string, string][] = [];
  let index = slug.indexOf(PAIR_SEPARATOR);
  while (index > 0) {
    const a = slug.slice(0, index);
    const b = slug.slice(index + PAIR_SEPARATOR.length);
    if (a && b && /^[a-z0-9-]+$/.test(a) && /^[a-z0-9-]+$/.test(b)) splits.push([a, b]);
    index = slug.indexOf(PAIR_SEPARATOR, index + 1);
  }
  return splits;
}

export type PairSide = { id: string; slug: string; name: string; indexable: boolean };

export type SimilarityEdge = {
  from: PairSide;
  to: PairSide;
  rank: number;
  score: number;
  sharedConcepts: string[];
};

export type ComparePair = {
  slug: string;
  path: string;
  a: PairSide;
  b: PairSide;
  score: number;
  sharedConcepts: string[];
};

/** The qualifying pairs among similarity edges, de-duplicated, best first. */
export function qualifyPairs(edges: SimilarityEdge[], limit = MAX_PAIR_PAGES): ComparePair[] {
  const pairs = new Map<string, ComparePair>();
  for (const edge of edges) {
    if (edge.rank > MAX_PAIR_RANK || edge.score < MIN_PAIR_SCORE) continue;
    if (!edge.from.indexable || !edge.to.indexable) continue;
    if (!edge.sharedConcepts.some((key) => key !== "ai")) continue;
    if (edge.from.slug === edge.to.slug) continue;

    const slug = pairSlug(edge.from.slug, edge.to.slug);
    const existing = pairs.get(slug);
    if (existing && existing.score >= edge.score) continue;
    const [a, b] = edge.from.slug < edge.to.slug ? [edge.from, edge.to] : [edge.to, edge.from];
    pairs.set(slug, { slug, path: `/compare/${slug}`, a, b, score: edge.score, sharedConcepts: edge.sharedConcepts });
  }
  return [...pairs.values()]
    .sort((x, y) => y.score - x.score || x.slug.localeCompare(y.slug))
    .slice(0, limit);
}
