"use server";

import { auth } from "@clerk/nextjs/server";

import { ensureProfile } from "@/lib/ensure-profile";
import { checkRateLimitByIp, checkRateLimitByIpAndUser } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { getProductsByIds } from "@/services/intelligence";
import type { ProductCardProduct } from "@/components/products/product-card";

/**
 * Saves ("♡ Save") for signed-in users, stored in `public.bookmarks`.
 *
 * Signed-out visitors save to localStorage instead (components/discovery/
 * discovery-provider.tsx) and those saves are imported here the first time
 * they sign in. `products.bookmark_count` is kept by a database trigger
 * (20261003000000), so nothing here touches the counter — an imported batch
 * and a double click both stay accurate.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** How many local saves one sign-in may import. More than anyone collects by hand. */
const MAX_IMPORT = 100;

export type SaveResult = { saved: boolean; error?: string };

export async function setSaved(productId: string, saved: boolean): Promise<SaveResult> {
  const { userId } = await auth();
  if (!userId) return { saved: !saved, error: "Sign in to save products to your account." };
  if (!UUID_PATTERN.test(productId)) return { saved: !saved, error: "Unknown product." };

  const limit = await checkRateLimitByIpAndUser("save", userId);
  if (!limit.ok) return { saved: !saved, error: limit.message };

  const supabase = createClient();

  if (!saved) {
    const { error } = await supabase
      .from("bookmarks")
      .delete()
      .eq("product_id", productId)
      .eq("user_id", userId);
    return error ? { saved: true, error: "Could not remove the save." } : { saved: false };
  }

  try {
    // profiles.id FK guard — the Clerk webhook may not have created this row.
    await ensureProfile();
  } catch {
    return { saved: false, error: "Could not prepare your profile." };
  }

  // ON CONFLICT DO NOTHING: saving something already saved is a no-op, not an
  // error, so a second tab or a retried request cannot fail.
  const { error } = await supabase
    .from("bookmarks")
    .upsert({ product_id: productId, user_id: userId }, { onConflict: "product_id,user_id", ignoreDuplicates: true });
  return error ? { saved: false, error: "Could not save this product." } : { saved: true };
}

/** The signed-in user's saved product ids — the provider's source of truth. */
export async function listSavedIds(): Promise<string[]> {
  const { userId } = await auth();
  if (!userId) return [];

  const supabase = createClient();
  const { data, error } = await supabase
    .from("bookmarks")
    .select("product_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(500);
  return error ? [] : (data ?? []).map((row) => row.product_id);
}

/**
 * Moves saves made while signed out into the account. Returns the merged list.
 * Unknown or unpublished ids fail the foreign key or are simply never shown;
 * nothing here trusts the client beyond "these look like ids".
 */
export async function importLocalSaves(productIds: string[]): Promise<string[]> {
  const { userId } = await auth();
  if (!userId) return [];

  const ids = [...new Set(productIds)].filter((id) => UUID_PATTERN.test(id)).slice(0, MAX_IMPORT);
  if (ids.length > 0) {
    const limit = await checkRateLimitByIpAndUser("save", userId);
    if (limit.ok) {
      try {
        await ensureProfile();
        const supabase = createClient();
        // Only published products: a stale local id for a deleted listing
        // would fail the whole batch on the foreign key.
        const live = await getProductsByIds(ids);
        if (live.length > 0) {
          await supabase.from("bookmarks").upsert(
            live.map((product) => ({ product_id: product.id, user_id: userId })),
            { onConflict: "product_id,user_id", ignoreDuplicates: true },
          );
        }
      } catch (error) {
        console.error("[saves] import failed:", error instanceof Error ? error.message : error);
      }
    }
  }

  return listSavedIds();
}

/** Cards for a signed-out visitor's local saves. Public data; rate limited per IP. */
export async function lookupProductsByIds(productIds: string[]): Promise<ProductCardProduct[]> {
  const limit = await checkRateLimitByIp("productLookup");
  if (!limit.ok) return [];
  return getProductsByIds(productIds);
}
