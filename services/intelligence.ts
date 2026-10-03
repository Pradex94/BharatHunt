import { cacheRemember } from "@/lib/cache";
import { createClient, createPublicClient } from "@/lib/supabase/server";
import { isMissingColumnError, isMissingTableError } from "@/lib/supabase/errors";
import { conceptWeight, matchConcepts } from "@/lib/intelligence/concepts";
import { deriveKnowledge, isJobConcept, type ProductKnowledge } from "@/lib/intelligence/knowledge";
import { INTELLIGENCE_CACHE_PREFIX } from "@/lib/intelligence/cache-keys";
import type { ProductCardProduct } from "@/components/products/product-card";

/**
 * Read-side services for Product Intelligence — server-only, like
 * services/products.ts. Every function here reads data the background indexer
 * already wrote (lib/intelligence/reindex.ts) or plain product columns; none
 * of them computes similarity or calls anything external on a request.
 *
 * These are the building blocks a future product agent calls: "similar to X",
 * "related to this query", "these products, side by side", "my saved list".
 *
 * Fallbacks are part of the contract. Before the migration is applied, or
 * while a new product waits for its first index, `getSimilarProducts` returns
 * `null` and the product page falls back to same-category products; concept
 * search returns `[]` and the marketplace shows lexical results only.
 */

const INTEL_TTL = 600;

/**
 * Card columns plus everything verified differences and the compare table
 * read. Literal so the Supabase client can type it.
 */
export const INTEL_PRODUCT_COLUMNS =
  "id, slug, name, tagline, description, category, pricing_type, avg_rating, upvote_count, comment_count, view_count, bookmark_count, hero_image_url, tags, website_url, github_url, launch_state, launch_state_source, source, platform_links, published_at, creator:profiles!products_creator_id_fkey(display_name, username)";

export type IntelProduct = ProductCardProduct & {
  description: string | null;
  view_count: number | null;
  bookmark_count: number | null;
  launch_state: string | null;
  launch_state_source: string | null;
  source: string | null;
  platform_links: Record<string, string> | null;
  published_at: string | null;
};

export type IntelProductWithKnowledge = IntelProduct & { knowledge: ProductKnowledge };

export function withKnowledge(product: IntelProduct): IntelProductWithKnowledge {
  return { ...product, knowledge: deriveKnowledge(product) };
}

export type SimilarProduct = {
  product: IntelProductWithKnowledge;
  score: number;
  sharedConcepts: string[];
};

/**
 * The precomputed similar products for one product, best first.
 *
 * `null` means "no precomputed data" (table missing, or this product not yet
 * indexed) — the caller falls back. `[]` means the indexer ran and found no
 * product similar enough, which is an answer, and an honest empty state.
 */
export async function getSimilarProducts(
  productId: string,
  limit = 12,
): Promise<SimilarProduct[] | null> {
  return cacheRemember(`${INTELLIGENCE_CACHE_PREFIX}similar:${productId}:${limit}`, INTEL_TTL, async () => {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("product_similarities")
      .select(`score, shared_concepts, rank, product:products!product_similarities_similar_product_id_fkey(${INTEL_PRODUCT_COLUMNS})`)
      .eq("product_id", productId)
      .order("rank", { ascending: true })
      .limit(limit);

    if (error) {
      if (!isMissingTableError(error) && !isMissingColumnError(error)) {
        console.error(`[intelligence] similar products unavailable: ${error.message}`);
      }
      return null;
    }
    // No rows is ambiguous — "indexed, nothing similar" or "not indexed yet" —
    // and only then is the index asked which one. Most pages have rows, so
    // they pay one query, not two.
    if (!data || data.length === 0) {
      const { data: indexed } = await supabase
        .from("product_intelligence")
        .select("product_id")
        .eq("product_id", productId)
        .maybeSingle();
      if (!indexed) return null;
    }

    return (data ?? [])
      .filter((row) => row.product)
      .map((row) => ({
        product: withKnowledge(row.product as unknown as IntelProduct),
        score: Number(row.score),
        sharedConcepts: row.shared_concepts ?? [],
      }));
  });
}

/** Job concepts a free-text query names, e.g. "AI video" → ["video-generation", "ai"]. */
export function queryConcepts(query: string): string[] {
  const hits = matchConcepts(query);
  const keys = [...hits.keys()].filter((key) => isJobConcept(key));
  // "AI" alongside something specific adds nothing but noise to retrieval.
  return keys.length > 1 ? keys.filter((key) => key !== "ai") : keys;
}

/**
 * Products whose *concepts* answer a search, for the "Related" block under
 * marketplace results — the part of search that understands "AI video" means
 * editors, generators and avatar tools, not only listings containing the
 * phrase. Lexical matches are passed in `excludeIds` so nothing repeats.
 *
 * Ranked by how strongly each listing names the query's concepts. Upvotes
 * only break ties.
 */
export async function getConceptRelatedProducts(
  query: string,
  excludeIds: string[],
  limit = 6,
): Promise<{ products: ProductCardProduct[]; concepts: string[] }> {
  const concepts = queryConcepts(query);
  if (concepts.length === 0) return { products: [], concepts };

  const ranked = await cacheRemember(
    `${INTELLIGENCE_CACHE_PREFIX}related:${[...concepts].sort().join(",")}`,
    INTEL_TTL,
    async () => {
      const supabase = createPublicClient();
      const { data, error } = await supabase
        .from("product_intelligence")
        .select(`knowledge, product:products!inner(${INTEL_PRODUCT_COLUMNS}, status)`)
        .overlaps("concepts", concepts)
        .eq("product.status", "published")
        .limit(80);

      if (error) {
        if (!isMissingTableError(error)) {
          console.error(`[intelligence] concept search unavailable: ${error.message}`);
        }
        return [] as { product: ProductCardProduct; score: number }[];
      }

      return (data ?? [])
        .map((row) => {
          const knowledge = row.knowledge as unknown as ProductKnowledge;
          const score = concepts.reduce((sum, key) => {
            const hit = knowledge.concepts?.find((concept) => concept.key === key);
            return sum + (hit ? conceptWeight(key) * hit.strength : 0);
          }, 0);
          const product = row.product as unknown as ProductCardProduct & { status?: string };
          delete product.status;
          return { product: product as ProductCardProduct, score };
        })
        .filter((entry) => entry.score > 0)
        .sort(
          (a, b) =>
            b.score - a.score || (b.product.upvote_count ?? 0) - (a.product.upvote_count ?? 0),
        );
    },
  );

  const exclude = new Set(excludeIds);
  return {
    products: ranked
      .filter((entry) => !exclude.has(entry.product.id))
      .slice(0, limit)
      .map((entry) => entry.product),
    concepts,
  };
}

const SLUG_PATTERN = /^[a-z0-9-]{1,80}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Published products by slug, in the order asked for. Unknown slugs drop out. */
export async function getProductsBySlugs(slugs: string[]): Promise<IntelProductWithKnowledge[]> {
  const clean = [...new Set(slugs.map((slug) => slug.trim().toLowerCase()))]
    .filter((slug) => SLUG_PATTERN.test(slug))
    .slice(0, 4);
  if (clean.length === 0) return [];

  const rows = await cacheRemember(
    `${INTELLIGENCE_CACHE_PREFIX}by-slugs:${[...clean].sort().join(",")}`,
    120,
    async () => {
      const supabase = createPublicClient();
      const { data, error } = await supabase
        .from("products")
        .select(INTEL_PRODUCT_COLUMNS)
        .eq("status", "published")
        .in("slug", clean);
      if (error) throw new Error(`Failed to load products: ${error.message}`);
      return (data ?? []) as unknown as IntelProduct[];
    },
  );

  const bySlug = new Map(rows.map((row) => [row.slug, row]));
  return clean
    .map((slug) => bySlug.get(slug))
    .filter((row): row is IntelProduct => Boolean(row))
    .map(withKnowledge);
}

/** Published products by id, for the anonymous saved list. Order preserved. */
export async function getProductsByIds(ids: string[]): Promise<ProductCardProduct[]> {
  const clean = [...new Set(ids)].filter((id) => UUID_PATTERN.test(id)).slice(0, 100);
  if (clean.length === 0) return [];

  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("products")
    .select(INTEL_PRODUCT_COLUMNS)
    .eq("status", "published")
    .in("id", clean);
  if (error) return [];

  const byId = new Map((data ?? []).map((row) => [row.id, row as unknown as ProductCardProduct]));
  return clean.map((id) => byId.get(id)).filter((row): row is ProductCardProduct => Boolean(row));
}

/**
 * A signed-in user's saved products, newest save first. Through the
 * user-scoped client: `bookmarks` RLS shows each person only their own rows.
 * Deliberately uncached — per-person data.
 */
export async function getSavedProducts(userId: string): Promise<ProductCardProduct[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("bookmarks")
    .select(`created_at, product:products!inner(${INTEL_PRODUCT_COLUMNS}, status)`)
    .eq("user_id", userId)
    .eq("product.status", "published")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error(
      JSON.stringify({ event: "saved_products_query_failed", code: error.code ?? null, message: error.message }),
    );
    return [];
  }
  return (data ?? []).map((row) => {
    const product = row.product as unknown as ProductCardProduct & { status?: string };
    delete product.status;
    return product as ProductCardProduct;
  });
}

/**
 * The newest products the Daily 5 agent published — "Recently discovered on
 * BharatHunt" on /discover. Curated products are ordinary rows with
 * `source = 'daily_agent'`, so they take part in matching, similarity, search,
 * compare and lists like any other; this is only the showcase.
 */
export async function getRecentlyDiscovered(limit = 6): Promise<ProductCardProduct[]> {
  return cacheRemember(`${INTELLIGENCE_CACHE_PREFIX}recently-discovered:${limit}`, INTEL_TTL, async () => {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("products")
      .select(INTEL_PRODUCT_COLUMNS)
      .eq("status", "published")
      .eq("source", "daily_agent")
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(limit);
    if (error) return [];
    return (data ?? []) as unknown as ProductCardProduct[];
  });
}
