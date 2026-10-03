import { cacheRemember } from "@/lib/cache";
import { INTELLIGENCE_CACHE_PREFIX } from "@/lib/intelligence/cache-keys";
import { qualifyPairs, type ComparePair, type SimilarityEdge } from "@/lib/intelligence/compare-pairs";
import { isIndexableProduct } from "@/lib/seo";
import { createPublicClient } from "@/lib/supabase/server";

/**
 * ComparisonService, SEO side: the curated set of indexable "A vs B" pages,
 * derived from the precomputed similarity table in one read and cached for an
 * hour. The sitemap, the /compare hub, the pair pages and the product pages'
 * "Popular comparisons" all read this one list, so they can never disagree
 * about which pair pages exist.
 */

const SIDE = "id, slug, name, tagline, description, hero_image_url, screenshot_urls, status";

type SideRow = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string | null;
  hero_image_url: string | null;
  screenshot_urls: string[] | null;
  status: string;
};

function side(row: SideRow) {
  return { id: row.id, slug: row.slug, name: row.name, indexable: row.status === "published" && isIndexableProduct(row) };
}

export async function getComparePairs(): Promise<ComparePair[]> {
  return cacheRemember(`${INTELLIGENCE_CACHE_PREFIX}compare-pairs`, 3600, async () => {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("product_similarities")
      .select(
        `rank, score, shared_concepts,
         from:products!product_similarities_product_id_fkey(${SIDE}),
         to:products!product_similarities_similar_product_id_fkey(${SIDE})`,
      )
      .lte("rank", 3)
      .gte("score", 0.25)
      .limit(2000);
    if (error) return [];

    const edges: SimilarityEdge[] = (data ?? [])
      .filter((row) => row.from && row.to)
      .map((row) => ({
        from: side(row.from as unknown as SideRow),
        to: side(row.to as unknown as SideRow),
        rank: row.rank,
        score: Number(row.score),
        sharedConcepts: row.shared_concepts ?? [],
      }));
    return qualifyPairs(edges);
  });
}

/** Qualifying comparisons that include one product, best first. */
export async function getComparePairsFor(productId: string, limit = 4): Promise<ComparePair[]> {
  const pairs = await getComparePairs();
  return pairs.filter((pair) => pair.a.id === productId || pair.b.id === productId).slice(0, limit);
}

export async function findComparePair(slug: string): Promise<ComparePair | null> {
  const pairs = await getComparePairs();
  return pairs.find((pair) => pair.slug === slug) ?? null;
}
