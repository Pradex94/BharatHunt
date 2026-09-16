import "server-only";

import {
  ADMIN_PRODUCT_STATUSES,
  sanitizeAdminSearch,
  type AdminProductStatus,
} from "@/lib/admin-filters";
import { createServiceClient } from "@/lib/supabase/service";

export type AdminProductRow = {
  id: string;
  slug: string;
  name: string;
  status: string;
  category: string;
  pricing_type: string;
  upvote_count: number | null;
  comment_count: number | null;
  created_at: string | null;
  creator: { display_name: string; username: string } | null;
};

export type AdminProductQuery = {
  status?: AdminProductStatus | null;
  q?: string;
  limit?: number;
};

/**
 * Products for the admin table (all statuses, all creators), narrowed by the
 * filters the page puts in the URL. Uses the service-role client, so callers
 * MUST verify `getIsAdmin()` first.
 *
 * The filtering is done by Postgres rather than by the page, so a search
 * reaches every product rather than only the most recent page of them — the
 * row cap exists to keep one response sane, and a term that matches something
 * older than the cap is exactly when an admin is searching in the first place.
 */
export async function getAllProductsAdmin(
  query: AdminProductQuery = {},
): Promise<AdminProductRow[]> {
  const supabase = createServiceClient();
  let request = supabase
    .from("products")
    .select(
      "id, slug, name, status, category, pricing_type, upvote_count, comment_count, created_at, creator:profiles!products_creator_id_fkey(display_name, username)",
    );

  if (query.status) {
    request = request.eq("status", query.status);
  }

  const term = sanitizeAdminSearch(query.q);
  if (term) {
    request = request.or(`name.ilike.%${term}%,slug.ilike.%${term}%,tagline.ilike.%${term}%`);
  }

  const { data, error } = await request
    .order("created_at", { ascending: false })
    .limit(query.limit ?? 200);

  if (error) {
    throw new Error(`Failed to load products for admin: ${error.message}`);
  }
  return (data ?? []) as AdminProductRow[];
}

export type AdminProductCounts = Record<AdminProductStatus, number> & { total: number };

/**
 * How many products sit at each status, counted by the database.
 *
 * Head counts rather than a tally of the rows the table happens to be showing:
 * that table is filtered and capped, so counting it would report the filter
 * back to itself — "2 in review" whenever the admin was looking at two of them.
 *
 * A failure reports zero rather than throwing. These are a signpost above a
 * page whose real work — the queue and the table — does not depend on them.
 */
export async function getAdminProductCounts(): Promise<AdminProductCounts> {
  const supabase = createServiceClient();

  const counts = await Promise.all(
    ADMIN_PRODUCT_STATUSES.map(async (status) => {
      const { count, error } = await supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("status", status);
      if (error) {
        console.error(`[admin] could not count "${status}" products: ${error.message}`);
        return 0;
      }
      return count ?? 0;
    }),
  );

  const byStatus = Object.fromEntries(
    ADMIN_PRODUCT_STATUSES.map((status, index) => [status, counts[index]]),
  ) as Record<AdminProductStatus, number>;

  return { ...byStatus, total: counts.reduce((sum, value) => sum + value, 0) };
}

export type PendingProductRow = AdminProductRow & {
  tagline: string;
  website_url: string | null;
  launch_state: string | null;
};

/**
 * The review queue: products a maker has submitted and nobody has decided on.
 *
 * Oldest first, which is the only fair order for a queue — the newest-first
 * ordering the table below uses would leave a submission at the bottom growing
 * staler every time another one arrives. Service-role, so callers MUST verify
 * `getIsAdmin()` first.
 */
export async function getPendingProductsAdmin(): Promise<PendingProductRow[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("products")
    .select(
      "id, slug, name, tagline, status, category, pricing_type, website_url, launch_state, upvote_count, comment_count, created_at, creator:profiles!products_creator_id_fkey(display_name, username)",
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) {
    /*
     * A deploy that lands before its migration has no 'pending' status yet, and
     * an empty queue is the truthful answer for that state. Everything else
     * about /admin still renders, which matters: the queue is the newest
     * section on a page that already had a job to do.
     */
    console.error(`[admin] pending queue unavailable: ${error.message}`);
    return [];
  }
  return (data ?? []) as PendingProductRow[];
}

export type SeoAuditProduct = {
  slug: string;
  name: string;
  tagline: string;
  description: string | null;
  hero_image_url: string | null;
  screenshot_urls: string[] | null;
};

/**
 * Every published product, in the shape `isIndexableProduct` needs.
 *
 * One read for the whole audit — the page derives every count from this array
 * rather than asking the database a question per check. Service-role, so callers
 * MUST verify `getIsAdmin()` first.
 */
export async function getSeoAuditProducts(): Promise<SeoAuditProduct[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("products")
    .select("slug, name, tagline, description, hero_image_url, screenshot_urls")
    .eq("status", "published")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load products for the SEO audit: ${error.message}`);
  }
  return (data ?? []) as SeoAuditProduct[];
}
