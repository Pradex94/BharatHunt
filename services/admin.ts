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
