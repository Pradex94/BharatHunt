"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";

import { getIsAdmin } from "@/lib/admin";
import { cacheInvalidatePrefix } from "@/lib/cache";
import { INTELLIGENCE_CACHE_PREFIX } from "@/lib/intelligence/cache-keys";
import { reindexProductIntelligence } from "@/lib/intelligence/reindex";
import { refreshDiscoverySignals } from "@/lib/intelligence/trending";
import { checkRateLimitByUser } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/service";
import { PRODUCT_CATEGORIES, type ProductCategory } from "@/lib/constants";
import { PRODUCTS_CACHE_PREFIX } from "@/services/products";
import { scheduleIntelligenceRefresh } from "@/lib/intelligence/schedule";

/**
 * Admin controls on /admin/intelligence. Gated by `getIsAdmin()` (the real
 * authorisation, as everywhere in /admin) and rate limited, because each
 * rebuild rewrites every derived row.
 */

export type IntelligenceAdminResult = { ok: true; message: string } | { ok: false; error: string };

async function guard(
  scope: "intelligenceAdmin" | "categoryApply" = "intelligenceAdmin",
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Please log in." };
  if (!(await getIsAdmin())) {
    console.warn(JSON.stringify({ event: "intelligence_admin_denied", userId, at: new Date().toISOString() }));
    return { ok: false, error: "Admins only." };
  }
  const limit = await checkRateLimitByUser(scope, userId);
  if (!limit.ok) return { ok: false, error: limit.message };
  return { ok: true, userId };
}

/** Rebuild knowledge + similarity for every product, even if nothing changed. */
export async function rebuildIntelligence(): Promise<IntelligenceAdminResult> {
  const access = await guard();
  if (!access.ok) return access;

  const result = await reindexProductIntelligence({ force: true });
  console.log(JSON.stringify({ event: "intelligence_rebuild", by: access.userId, ...result, at: new Date().toISOString() }));
  revalidatePath("/admin/intelligence");
  if (!result.ok) return { ok: false, error: result.error };
  return {
    ok: true,
    message: `Indexed ${result.products} products and wrote ${result.similarityRows} similarity rows in ${result.ms} ms.`,
  };
}

/** Roll up recent events and recompute Trending / Rising / Most saved now. */
export async function recalculateTrending(): Promise<IntelligenceAdminResult> {
  const access = await guard();
  if (!access.ok) return access;
  const result = await refreshDiscoverySignals();
  revalidatePath("/admin/intelligence");
  if (!result.ok) return { ok: false, error: result.error };
  return {
    ok: true,
    message: `Scored ${result.scored} products from ${result.rolledUp} recent daily rows; pruned ${result.purgedEvents} old events.`,
  };
}

/** Drop cached similar/related/compare reads; the next request re-reads the tables. */
export async function clearIntelligenceCache(): Promise<IntelligenceAdminResult> {
  const access = await guard();
  if (!access.ok) return access;
  await cacheInvalidatePrefix(INTELLIGENCE_CACHE_PREFIX);
  return { ok: true, message: "Intelligence cache cleared." };
}

/**
 * Move one product to the category its listing describes — the "apply" on a
 * Category review suggestion. Only an admin, only to a stored category, and
 * only by explicit click: the review list never recategorises on its own.
 */
export async function applyCategorySuggestion(productId: string, category: string): Promise<IntelligenceAdminResult> {
  const access = await guard("categoryApply");
  if (!access.ok) return access;
  if (!(PRODUCT_CATEGORIES as readonly string[]).includes(category)) {
    return { ok: false, error: "Not a BharatHunt category." };
  }

  const db = createServiceClient();
  const { data, error } = await db
    .from("products")
    .update({ category: category as ProductCategory })
    .eq("id", productId)
    .eq("status", "published")
    .select("slug, name, category")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "That product is not published." };

  console.log(JSON.stringify({ event: "category_applied", by: access.userId, productId, category, at: new Date().toISOString() }));
  await Promise.all([cacheInvalidatePrefix(PRODUCTS_CACHE_PREFIX), cacheInvalidatePrefix(INTELLIGENCE_CACHE_PREFIX)]);
  scheduleIntelligenceRefresh("category-applied");
  revalidatePath(`/products/${data.slug}`);
  revalidatePath("/admin/intelligence");
  revalidatePath("/marketplace");
  return { ok: true, message: `${data.name} is now in ${category}.` };
}
