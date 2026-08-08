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
const PRODUCT_PAGE_COLUMNS =
  "id, slug, creator_id, name, tagline, description, hero_image_url, screenshot_urls, website_url, github_url, video_url, category, pricing_type, tags, view_count, upvote_count, comment_count, cta_text, cta_url, platform_links, tech_stack, coupon_code, offer_description, offer_expires_at, roadmap_url, changelog_url, available_for_hire, hire_pitch, launch_state, creator:profiles!products_creator_id_fkey(display_name, username)";

/**
 * Split a select list on its top-level commas only — the embedded creator join
 * contains a comma of its own, and splitting inside it would corrupt the query.
 */
function splitColumns(columns: string): string[] {
  return columns.split(/,\s*(?![^()]*\))/);
}

/** `columns` minus `drop`, so the narrower variants are derived, never retyped. */
function withoutColumns(columns: string, drop: string[]): string {
  return splitColumns(columns)
    .filter((column) => !drop.includes(column))
    .join(", ");
}

const LAUNCH_FIELD_COLUMNS = [
  "cta_text",
  "cta_url",
  "platform_links",
  "tech_stack",
  "coupon_code",
  "offer_description",
  "offer_expires_at",
  "roadmap_url",
  "changelog_url",
  "available_for_hire",
  "hire_pitch",
];
const LAUNCH_LOCATION_COLUMNS = ["launch_state"];

/**
 * Progressively narrower selects, tried in order. The launch fields and the
 * launch location ship in separate migrations, so either can be missing
 * independently and a single all-or-nothing fallback would drop columns that
 * the database actually has.
 */
const PRODUCT_PAGE_FALLBACK_COLUMNS = [
  withoutColumns(PRODUCT_PAGE_COLUMNS, LAUNCH_LOCATION_COLUMNS),
  withoutColumns(PRODUCT_PAGE_COLUMNS, LAUNCH_FIELD_COLUMNS),
  withoutColumns(PRODUCT_PAGE_COLUMNS, [...LAUNCH_FIELD_COLUMNS, ...LAUNCH_LOCATION_COLUMNS]),
];

/**
 * Single published product by slug. Wrapped in React `cache()` so the product
 * page and its `generateMetadata` share one DB round-trip per request instead
 * of querying twice. Returns `null` when the slug isn't a published product.
 *
 * Falls back to narrower column sets if a migration hasn't been applied yet
 * (Postgres `undefined_column`), so a deploy that lands before its migration
 * degrades gracefully (extra sections hidden) instead of 500-ing every product
 * page.
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
  if (!isMissingColumnError(error)) {
    throw new Error(`Failed to load product: ${error.message}`);
  }

  for (const columns of PRODUCT_PAGE_FALLBACK_COLUMNS) {
    const fallback = await supabase
      .from("products")
      .select(columns as typeof PRODUCT_PAGE_COLUMNS)
      .eq("slug", slug)
      .eq("status", "published")
      .maybeSingle();

    if (!fallback.error) {
      // Typed as the full row even though fewer columns came back; every
      // optional field is read defensively at the call site.
      return fallback.data as unknown as typeof data;
    }
    if (!isMissingColumnError(fallback.error)) {
      throw new Error(`Failed to load product: ${fallback.error.message}`);
    }
  }

  throw new Error(`Failed to load product: ${error.message}`);
});

export type PublishedProduct = NonNullable<Awaited<ReturnType<typeof getPublishedProductBySlug>>>;

/**
 * Every published product's slug + last-modified timestamp, for the sitemap.
 * Fails soft (empty list) so a transient DB error never 500s the sitemap route.
 */
export async function getAllPublishedProductSlugs(): Promise<
  {
    slug: string;
    lastModified: string;
    tagline: string;
    description: string | null;
    hero_image_url: string | null;
    screenshot_urls: string[] | null;
  }[]
> {
  return cacheRemember(`${PRODUCTS_CACHE_PREFIX}slugs`, AGGREGATE_TTL, async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("products")
      // Extra columns so the sitemap can apply the same indexability rule the
      // product page uses for its robots directive.
      .select(
        "slug, updated_at, published_at, created_at, tagline, description, hero_image_url, screenshot_urls",
      )
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
      tagline: row.tagline,
      description: row.description,
      hero_image_url: row.hero_image_url,
      screenshot_urls: row.screenshot_urls,
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

/**
 * Competing products: other published listings in the same category, most
 * upvoted first, with the product itself excluded.
 *
 * Derived rather than maker-declared on purpose — nobody has to curate a list,
 * so every product gets alternatives from the day it launches, and a newcomer
 * appears on its rivals' pages automatically. Shares a category with the
 * breadcrumb trail, so the internal linking stays consistent.
 *
 * Fails soft: alternatives are a supporting section, never a reason to 500 a
 * product page.
 */
export async function getCompetingProducts(
  category: string,
  excludeId: string,
  limit = 4,
): Promise<ProductCardProduct[]> {
  return cacheRemember(
    `${PRODUCTS_CACHE_PREFIX}competitors:${category}:${excludeId}:${limit}`,
    AGGREGATE_TTL,
    async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("products")
        .select(PRODUCT_CARD_COLUMNS)
        .eq("status", "published")
        .eq("category", category)
        .neq("id", excludeId)
        .order("upvote_count", { ascending: false, nullsFirst: false })
        .limit(limit);

      if (error) return [];
      return (data ?? []) as ProductCardProduct[];
    },
  );
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

const PRICING_TYPE_VALUES = ["free", "freemium", "paid"];

/**
 * Runs a search through `public.search_products` (see
 * supabase/migrations/20260809120000_product_search.sql).
 *
 * The old path built a PostgREST filter string by interpolating the raw query
 * into `name.ilike.%q%,tagline.ilike.%q%`, which is why it needed to strip
 * `%`, `_`, `,` and parentheses first — characters that are meaningful in that
 * grammar. Passing the query as an RPC argument removes the string-building
 * entirely, so a search term is now data rather than something spliced into a
 * filter expression, and no sanitising is needed to keep it safe.
 *
 * The function is SECURITY INVOKER, so row-level security still applies and it
 * cannot reach anything the caller could not already read.
 */
async function searchProductsRanked({
  q,
  category,
  pricing,
  sort,
  from,
  limit,
}: {
  q: string;
  category?: string;
  pricing?: string[];
  sort: ProductSort;
  from: number;
  limit: number;
}): Promise<GetProductsResult> {
  const supabase = createClient();
  const validPricing = (pricing ?? []).filter((value) => PRICING_TYPE_VALUES.includes(value));

  const { data, error } = await supabase.rpc("search_products", {
    search_query: q,
    category_filter:
      category && (PRODUCT_CATEGORIES as readonly string[]).includes(category) ? category : null,
    pricing_filter: validPricing.length > 0 ? validPricing : null,
    sort_mode: sort,
    page_limit: limit,
    page_offset: from,
  });

  if (error) {
    throw new Error(`Failed to search products: ${error.message}`);
  }

  const rows = data ?? [];

  return {
    // The RPC returns the creator flattened (an RPC can't produce PostgREST's
    // nested join shape), so rebuild the object the cards expect.
    products: rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      tagline: row.tagline,
      category: row.category,
      pricing_type: row.pricing_type,
      avg_rating: row.avg_rating,
      upvote_count: row.upvote_count,
      comment_count: row.comment_count,
      hero_image_url: row.hero_image_url,
      tags: row.tags,
      website_url: row.website_url,
      github_url: row.github_url,
      creator: row.creator_display_name
        ? { display_name: row.creator_display_name, username: row.creator_username ?? "" }
        : null,
    })),
    // Every row carries the same window-function count; zero rows means zero.
    totalCount: rows.length > 0 ? Number(rows[0].total_count) : 0,
    page: Math.floor(from / limit) + 1,
    pageSize: limit,
  };
}

/**
 * The closest product name to a query that found nothing — the "Did you mean?"
 * candidate. Returns null unless something is genuinely close, so a hopeless
 * search stays honest instead of pointing at a random product.
 */
export async function suggestProductName(q: string): Promise<string | null> {
  if (!q.trim()) return null;

  const supabase = createClient();
  const { data, error } = await supabase.rpc("suggest_product_name", { search_query: q });

  // A suggestion is a nicety; never fail a page over it.
  return error ? null : (data ?? null);
}

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

    // A search is a different question from a browse: it has to rank by how
    // well each row answers the query, which PostgREST filters can't express.
    // Browsing without a query keeps the original path untouched.
    const term = q?.trim();
    if (term) {
      return searchProductsRanked({
        q: term,
        category,
        pricing,
        sort,
        from,
        limit: PRODUCTS_PAGE_SIZE,
      });
    }

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

    // Fail soft: this feeds the sitemap and the marketplace sidebar, neither of
    // which should break the page (or the build) over a transient query error.
    if (error) {
      return {};
    }

    const counts: Record<string, number> = {};
    for (const row of data ?? []) {
      counts[row.category] = (counts[row.category] ?? 0) + 1;
    }
    return counts;
  });
}

/**
 * How many published products were launched from each state, keyed by ISO
 * 3166-2:IN code. Feeds the India map on the landing page.
 *
 * Fails soft — an empty map just renders the outline with no markers, which is
 * also what happens before the launch-location migration is applied.
 */
export async function getLaunchStateCounts(): Promise<Record<string, number>> {
  return cacheRemember(`${PRODUCTS_CACHE_PREFIX}launch-state-counts`, AGGREGATE_TTL, async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("products")
      .select("launch_state")
      .eq("status", "published")
      .not("launch_state", "is", null);

    if (error) {
      return {};
    }

    const counts: Record<string, number> = {};
    for (const row of data ?? []) {
      if (row.launch_state) counts[row.launch_state] = (counts[row.launch_state] ?? 0) + 1;
    }
    return counts;
  });
}
