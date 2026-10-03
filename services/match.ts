import { cacheRemember } from "@/lib/cache";
import { INTELLIGENCE_CACHE_PREFIX } from "@/lib/intelligence/cache-keys";
import type { ProductKnowledge } from "@/lib/intelligence/knowledge";
import {
  parseMatchQuery,
  rankMatches,
  type Budget,
  type MatchRequest,
  type MatchResult,
  type ParsedQuery,
} from "@/lib/intelligence/match";
import { normalizeSearchText } from "@/lib/search";
import { isMissingTableError } from "@/lib/supabase/errors";
import { createPublicClient } from "@/lib/supabase/server";
import { INTEL_PRODUCT_COLUMNS, type IntelProduct } from "@/services/intelligence";
import { PRODUCT_CATEGORIES } from "@/lib/constants";

/**
 * ProductRecommendationService — the retrieval half of Product Match. The
 * ranking itself is pure (lib/intelligence/match.ts).
 *
 *   1. candidates whose precomputed concepts overlap the request (GIN index),
 *   2. plus the lexical search's top rows for the request's own words,
 *   3. each carrying the knowledge the indexer already derived — nothing is
 *      re-derived per request,
 *   4. ranked in memory (≤ ~120 rows), cached per normalised request.
 *
 * Two indexed reads on a cache miss, none on a hit. No model call, ever; the
 * page works the same whether or not anything external is reachable.
 *
 * A future product agent calls `findMatches` directly: "Find me 5 Indian AI
 * tools for my startup" is a MatchRequest with audience "founder".
 */

const MATCH_TTL = 600;
const CANDIDATE_LIMIT = 80;

export type MatchProduct = IntelProduct & { knowledge: ProductKnowledge };

export type MatchResponse = {
  parsed: ParsedQuery;
  results: MatchResult<MatchProduct>[];
};

export function normalizeMatchRequest(input: {
  q?: string | null;
  budget?: string | null;
  for?: string | null;
  category?: string | null;
}): MatchRequest {
  const budget: Budget = input.budget === "free" || input.budget === "free-plan" ? input.budget : "any";
  const audience =
    input.for && /^[a-z-]{2,24}$/.test(input.for) ? input.for : null;
  const category =
    input.category === "ai" || (input.category && (PRODUCT_CATEGORIES as readonly string[]).includes(input.category))
      ? input.category
      : null;
  return { query: (input.q ?? "").trim().slice(0, 300), budget, audience, category };
}

type IntelRow = { knowledge: unknown; product: unknown };

function toCandidates(rows: IntelRow[] | null): MatchProduct[] {
  return (rows ?? [])
    .filter((row) => row.product && row.knowledge)
    .map((row) => {
      const product = { ...(row.product as IntelProduct & { status?: string }) };
      delete product.status;
      return { ...product, knowledge: row.knowledge as ProductKnowledge };
    });
}

export async function findMatches(request: MatchRequest): Promise<MatchResponse> {
  const parsed = parseMatchQuery(request.query);
  if (!request.query || (!parsed.text && parsed.concepts.length === 0)) return { parsed, results: [] };

  const key = `${INTELLIGENCE_CACHE_PREFIX}match:${JSON.stringify([
    normalizeSearchText(request.query),
    request.query.toLowerCase().replace(/\s+/g, " "),
    request.budget,
    request.audience,
    request.category,
  ])}`;

  const results = await cacheRemember(key, MATCH_TTL, async () => {
    const supabase = createPublicClient();
    const select = `knowledge, product:products!inner(${INTEL_PRODUCT_COLUMNS}, status)`;
    const conceptKeys = [...parsed.concepts, ...(parsed.wantsAi && parsed.concepts.length === 0 ? ["ai"] : [])];

    const [byConcept, lexical] = await Promise.all([
      conceptKeys.length > 0
        ? supabase
            .from("product_intelligence")
            .select(select)
            .overlaps("concepts", conceptKeys)
            .eq("product.status", "published")
            .limit(CANDIDATE_LIMIT)
        : Promise.resolve({ data: [] as IntelRow[], error: null }),
      parsed.text
        ? supabase.rpc("search_products", { search_query: parsed.text, sort_mode: "relevance", page_limit: 30 })
        : Promise.resolve({ data: [] as { id: string }[], error: null }),
    ]);

    if (byConcept.error) {
      if (!isMissingTableError(byConcept.error)) {
        console.error(`[match] concept retrieval failed: ${byConcept.error.message}`);
      }
      return [] as MatchResult<MatchProduct>[];
    }

    const candidates = new Map(toCandidates(byConcept.data as IntelRow[]).map((row) => [row.id, row]));
    const lexicalIds = ((lexical.data ?? []) as { id: string }[])
      .map((row) => row.id)
      .filter((id) => !candidates.has(id));

    if (lexicalIds.length > 0) {
      const { data } = await supabase
        .from("product_intelligence")
        .select(select)
        .in("product_id", lexicalIds)
        .eq("product.status", "published");
      for (const row of toCandidates(data as IntelRow[])) candidates.set(row.id, row);
    }

    return rankMatches(request, [...candidates.values()], { limit: 12 }).results;
  });

  return { parsed, results };
}
