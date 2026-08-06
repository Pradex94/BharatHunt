import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { isMissingColumnError } from "@/lib/supabase/errors";
import { cacheRemember } from "@/lib/cache";
import type { ProductCardProduct } from "@/components/products/product-card";
import { PRODUCT_CATEGORIES, type ProductCategory, type ProductSort } from "@/lib/constants";

// ── Cache keys / TTLs ────────────────────────────────────────────────────
// Every product cache key shares this prefix, so a single product write can
// invalidate all of them via cacheInvalidatePrefix (see lib/actions/products.ts).
export const PRODUCTS_CACHE_PREFIX = "bh:products:";
const LIST_TTL = 60; // filtered lists change often (counts, ordering)
const AGGREGATE_TTL = 300; // featured / counts / stats / slugs

// Literal strings (not built dynamically) so the Supabase client can infer the
// row type from the selected columns.
const PRODUCT_PAGE_BASE_COLUMNS =
  "id, slug, creator_id, name, tagline, description, hero_image_url, screenshot_urls, website_url, github_url, video_url, category, pricing_type, tags, view_count, upvote_count, comment_count, creator:profiles!products_creator_id_fkey(display_name, username)";

const PRODUCT_PAGE_COLUMNS =
  "id, slug, creator_id, name, tagline, description, hero_image_url, screenshot_urls, website_url, github_url, video_url, category, pricing_type, tags, view_count, upvote_count, comment_count, cta_text, cta_url, platform_links, tech_stack, coupon_code, offer_description, offer_expires_at, roadmap_url, changelog_url, available_for_hire, hire_pitch, creator:profiles!products_creator_id_fkey(display_name, username)";

/**
 * Single published product by slug. Wrapped in React `cache()` so the product
 * page and its `generateMetadata` share one DB round-trip per request instead
 * of querying twice. Returns `null` when the slug isn't a published product.
 *
 * Falls back to base columns if the Phase 2 launch columns aren't migrated yet
 * (Postgres `undefined_column`), so a deploy that lands before
 * `db/product-launch-fields.sql` is run degrades gracefully (extra sections
 * hidden) instead of 500-ing every product page.
 */
export const getPublishedProductBySlug = cache(async (slug: string) => {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_PAGE_COLUMNS)
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (!error) {
    return data;
  }

  if (isMissingColumnError(error)) {
    const fallback = await supabase
      .from("products")
      .select(PRODUCT_PAGE_BASE_COLUMNS)
      .eq("slug", slug)
      .eq("status", "published")
      .maybeSingle();
    if (fallback.error) {
      throw new Error(`Failed to load product: ${fallback.error.message}`);
    }
    return fallback.data as unknown as typeof data;
  }

  throw new Error(`Failed to load product: ${error.message}`);
});

export type PublishedProduct = NonNullable<Awaited<ReturnType<typeof getPublishedProductBySlug>>>;

/**
 * Every published product's slug + last-modified timestamp, for the sitemap.
 * Fails soft (empty list) so a transient DB error never 500s the sitemap route.
 */
export async function getAllPublishedProductSlugs(): Promise<
  { slug: string; lastModified: string }[]
> {
  return cacheRemember(`${PRODUCTS_CACHE_PREFIX}slugs`, AGGREGATE_TTL, async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("products")
      .select("slug, updated_at, published_at, created_at")
      .eq("status", "published")
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(5000);

    if (error) {
      return [];
    }

    return (data ?? []).map((row) => ({
      slug: row.slug,
      lastModified:
        row.updated_at ?? row.published_at ?? row.created_at ?? new Date().toISOString(),
    }));
  });
}

const PRODUCT_CARD_COLUMNS =
  "id, slug, name, tagline, category, pricing_type, avg_rating, upvote_count, comment_count, hero_image_url, tags, website_url, github_url, creator:profiles!products_creator_id_fkey(display_name, username)";

export async function getFeaturedProducts(limit = 6): Promise<ProductCardProduct[]> {
  return cacheRemember(`${PRODUCTS_CACHE_PREFIX}featured:${limit}`, AGGREGATE_TTL, async () => {
    const supabase = createClient();

    const { data, error } = await supabase
      .from("products")
      .select(PRODUCT_CARD_COLUMNS)
      .eq("status", "published")
      .order("trend_score", { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to load featured products: ${error.message}`);
    }

    return (data ?? []) as ProductCardProduct[];
  });
}

/** A landing-page card: the usual product columns plus views for the hero. */
export type LandingProduct = ProductCardProduct & { view_count: number | null };

const LANDING_PRODUCT_COLUMNS =
  "id, slug, name, tagline, category, pricing_type, avg_rating, upvote_count, comment_count, view_count, hero_image_url, tags, website_url, github_url, creator:profiles!products_creator_id_fkey(display_name, username)";

/**
 * Published products ranked by upvotes — the landing page's leaderboard, and
 * the source of the hero's featured launch.
 *
 * Fails soft (empty list) rather than throwing: the home page is the front
 * door, and it should still render its copy and CTAs if this query breaks.
 */
export async function getTopUpvotedProducts(limit = 6): Promise<LandingProduct[]> {
  return cacheRemember(`${PRODUCTS_CACHE_PREFIX}top-upvoted:${limit}`, AGGREGATE_TTL, async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("products")
      .select(LANDING_PRODUCT_COLUMNS)
      .eq("status", "published")
      .order("upvote_count", { ascending: false, nullsFirst: false })
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(limit);

    if (error) return [];
    return (data ?? []) as LandingProduct[];
  });
}

export async function getUpvotedProductIds(
  userId: string | null,
  productIds: string[],
): Promise<Set<string>> {
  if (!userId || productIds.length === 0) {
    return new Set();
  }

  const supabase = createClient();
  const { data } = await supabase
    .from("upvotes")
    .select("product_id")
    .eq("user_id", userId)
    .in("product_id", productIds);

  return new Set((data ?? []).map((upvote) => upvote.product_id));
}

export const PRODUCTS_PAGE_SIZE = 12;

export type GetProductsParams = {
  category?: string;
  sort?: ProductSort;
  q?: string;
  page?: number;
  pricing?: string[];
};

export type GetProductsResult = {
  products: ProductCardProduct[];
  totalCount: number;
  page: number;
  pageSize: number;
};

/**
 * Strips characters that are meaningful in PostgREST's `or=`/`ilike` filter
 * grammar (`,`, `(`, `)`) and SQL LIKE wildcards (`%`, `_`) out of raw user
 * search input before it's interpolated into a filter string, so a search
 * term can't break out of the intended `ilike` conditions.
 */
function sanitizeSearchTerm(input: string): string {
  return input.replace(/[%_,()]/g, " ").trim();
}

const PRICING_TYPE_VALUES = ["free", "freemium", "paid"];

export async function getProducts({
  category,
  sort = "newest",
  q,
  page = 1,
  pricing,
}: GetProductsParams): Promise<GetProductsResult> {
  const currentPage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const cacheKey = `${PRODUCTS_CACHE_PREFIX}list:${JSON.stringify({
    category: category ?? "",
    sort,
    q: q ?? "",
    page: currentPage,
    pricing: [...(pricing ?? [])].sort(),
  })}`;

  return cacheRemember(cacheKey, LIST_TTL, async () => {
    const supabase = createClient();
    const from = (currentPage - 1) * PRODUCTS_PAGE_SIZE;
    const to = from + PRODUCTS_PAGE_SIZE - 1;

    let query = supabase
      .from("products")
      .select(PRODUCT_CARD_COLUMNS, { count: "exact" })
      .eq("status", "published");

    if (category && (PRODUCT_CATEGORIES as readonly string[]).includes(category)) {
      query = query.eq("category", category as ProductCategory);
    }

    const validPricing = (pricing ?? []).filter((value) => PRICING_TYPE_VALUES.includes(value));
    if (validPricing.length > 0) {
      query = query.in("pricing_type", validPricing);
    }

    const term = q ? sanitizeSearchTerm(q) : "";
    if (term) {
      query = query.or(`name.ilike.%${term}%,tagline.ilike.%${term}%`);
    }

    switch (sort) {
      case "trending":
        query = query.order("trend_score", { ascending: false, nullsFirst: false });
        break;
      case "price-low":
        query = query.order("pricing_amount", { ascending: true, nullsFirst: false });
        break;
      case "price-high":
        query = query.order("pricing_amount", { ascending: false, nullsFirst: false });
        break;
      case "top-rated":
        query = query.order("avg_rating", { ascending: false, nullsFirst: false });
        break;
      case "newest":
      default:
        query = query.order("published_at", { ascending: false, nullsFirst: false });
        break;
    }

    const { data, error, count } = await query.range(from, to);

    if (error) {
      throw new Error(`Failed to load products: ${error.message}`);
    }

    return {
      products: (data ?? []) as ProductCardProduct[],
      totalCount: count ?? 0,
      page: currentPage,
      pageSize: PRODUCTS_PAGE_SIZE,
    };
  });
}

/**
 * A small set of published products for a single category, used on the
 * category detail page's preview grid. Falls back to an empty list rather
 * than throwing, so a quiet category never breaks the page.
 */
export async function getProductsByCategory(
  category: ProductCategory,
  limit = 9,
): Promise<ProductCardProduct[]> {
  return cacheRemember(
    `${PRODUCTS_CACHE_PREFIX}by-category:${category}:${limit}`,
    AGGREGATE_TTL,
    async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("products")
        .select(PRODUCT_CARD_COLUMNS)
        .eq("status", "published")
        .eq("category", category)
        .order("trend_score", { ascending: false, nullsFirst: false })
        .limit(limit);

      if (error) {
        throw new Error(`Failed to load ${category} products: ${error.message}`);
      }
      return (data ?? []) as ProductCardProduct[];
    },
  );
}

/**
 * Real, honest platform totals for the /advertise page — never fabricated.
 * Derived entirely from published products (publicly readable), so no reliance
 * on `profiles`/`upvotes` RLS: makers = distinct creators, upvotes = summed
 * denormalized counts.
 */
export async function getPlatformStats(): Promise<{
  products: number;
  makers: number;
  upvotes: number;
}> {
  return cacheRemember(`${PRODUCTS_CACHE_PREFIX}platform-stats`, AGGREGATE_TTL, async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("products")
      .select("creator_id, upvote_count")
      .eq("status", "published");

    if (error) {
      return { products: 0, makers: 0, upvotes: 0 };
    }

    const rows = data ?? [];
    const makers = new Set(rows.map((row) => row.creator_id)).size;
    const upvotes = rows.reduce((sum, row) => sum + (row.upvote_count ?? 0), 0);
    return { products: rows.length, makers, upvotes };
  });
}

/** One row of the maker dashboard — what someone needs to judge and manage a launch. */
export type MakerProduct = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  hero_image_url: string | null;
  category: string;
  pricing_type: string;
  status: string;
  upvote_count: number | null;
  comment_count: number | null;
  view_count: number | null;
  created_at: string | null;
  published_at: string | null;
};

const MAKER_PRODUCT_COLUMNS =
  "id, slug, name, tagline, hero_image_url, category, pricing_type, status, upvote_count, comment_count, view_count, created_at, published_at";

/**
 * Every product a maker owns, newest first — drafts and archived rows included,
 * which the products RLS policy already exposes to their creator
 * (`status = 'published' OR creator = caller`), so the plain user client is
 * enough and RLS stays the backstop. Callers pass the *authenticated* user id.
 *
 * Deliberately uncached: this is per-person data behind a login, and a stale
 * dashboard right after publishing or deleting is worse than one extra query.
 */
export async function getProductsByCreator(userId: string): Promise<MakerProduct[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("products")
    .select(MAKER_PRODUCT_COLUMNS)
    .eq("creator_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load your products: ${error.message}`);
  }
  return (data ?? []) as MakerProduct[];
}

/** How many products a given maker has launched — used to enforce the per-user limit. */
export async function getUserProductCount(userId: string): Promise<number> {
  const supabase = createClient();
  const { count, error } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("creator_id", userId);

  if (error) return 0;
  return count ?? 0;
}

/** Total published-product count per category, for the marketplace sidebar. */
export async function getCategoryCounts(): Promise<Record<string, number>> {
  return cacheRemember(`${PRODUCTS_CACHE_PREFIX}category-counts`, AGGREGATE_TTL, async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("products")
      .select("category")
      .eq("status", "published");

    if (error) {
      throw new Error(`Failed to load category counts: ${error.message}`);
    }

    const counts: Record<string, number> = {};
    for (const row of data ?? []) {
      counts[row.category] = (counts[row.category] ?? 0) + 1;
    }
    return counts;
  });
}
