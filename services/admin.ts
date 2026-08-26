import "server-only";

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

/**
 * Every product (all statuses, all creators) for the admin dashboard. Uses the
 * service-role client, so callers MUST verify `getIsAdmin()` first.
 */
export async function getAllProductsAdmin(): Promise<AdminProductRow[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("products")
    .select(
      "id, slug, name, status, category, pricing_type, upvote_count, comment_count, created_at, creator:profiles!products_creator_id_fkey(display_name, username)",
    )
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    throw new Error(`Failed to load products for admin: ${error.message}`);
  }
  return (data ?? []) as AdminProductRow[];
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
