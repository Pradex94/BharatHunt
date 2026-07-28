import { createClient } from "@/lib/supabase/server";
import type { ProductCardProduct } from "@/components/products/product-card";
import { PRODUCT_CATEGORIES, type ProductCategory, type ProductSort } from "@/lib/constants";

const PRODUCT_CARD_COLUMNS =
  "id, slug, name, tagline, category, pricing_type, avg_rating, upvote_count, comment_count, hero_image_url, creator:profiles!products_creator_id_fkey(display_name, username)";

export async function getFeaturedProducts(limit = 6): Promise<ProductCardProduct[]> {
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
  const supabase = createClient();
  const currentPage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
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
}

/** Total published-product count per category, for the marketplace sidebar. */
export async function getCategoryCounts(): Promise<Record<string, number>> {
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
}
