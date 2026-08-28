import "server-only";

/**
 * Reads for the promotion system. The write half lives in
 * lib/actions/promotions.ts, matching how services/products.ts and
 * lib/actions/products.ts already divide.
 *
 * Deliberately uncached, all of it. `services/products.ts` wraps its aggregates
 * in `cacheRemember` because they are identical for every visitor and stale by
 * ten minutes is harmless. None of that holds here: a package price is the
 * figure a card is about to be charged, and a promotion's status is what a
 * customer is staring at after paying. A stale read on either is a support
 * ticket at best.
 */

import { createClient, createPublicClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type {
  PromotableProduct,
  PromotionPackage,
  PromotionPlacement,
  PromotionStatus,
} from "@/lib/promotions";

/**
 * The catalogue, cheapest first.
 *
 * Read through the anon client: `promotion_packages` has a public SELECT policy
 * on `is_active`, the rows are identical for every visitor, and going through
 * the Clerk-token client would make the page dynamic for no gain (see the note
 * on `createPublicClient`).
 */
export async function getPromotionPackages(): Promise<PromotionPackage[]> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("promotion_packages")
    .select("id, name, description, placement, duration_days, amount_paise, currency")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error(
      JSON.stringify({
        event: "promotion_packages_query_failed",
        code: error.code ?? null,
        message: error.message,
        at: new Date().toISOString(),
      }),
    );
    // An empty catalogue renders "promotions are unavailable" rather than a
    // crash. There is no fallback price to substitute here and inventing one
    // would be the worst possible failure mode.
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    placement: row.placement as PromotionPlacement,
    durationDays: row.duration_days,
    amountPaise: Number(row.amount_paise),
    currency: row.currency,
  }));
}

/**
 * The maker's published products, flagged with whether a slot is already
 * running.
 *
 * Only `published` products are offered. A pending or draft launch has nothing
 * to promote -- it is invisible to every public query by construction -- so
 * selling a placement for one would be taking money for a slot that renders
 * nothing. This is the integration point with the existing review workflow: the
 * product passed review, therefore it can be promoted.
 *
 * Runs under the caller's own Clerk token; the products RLS policy already
 * scopes the row set, and `promotions_select_own` scopes the second read.
 */
export async function getPromotableProducts(userId: string): Promise<PromotableProduct[]> {
  const supabase = createClient();

  const [products, active] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, slug, category")
      .eq("creator_id", userId)
      .eq("status", "published")
      .order("created_at", { ascending: false }),
    supabase
      .from("promotions")
      .select("product_id")
      .eq("user_id", userId)
      .eq("status", "active")
      .gt("ends_at", new Date().toISOString()),
  ]);

  if (products.error) {
    console.error(
      JSON.stringify({
        event: "promotable_products_query_failed",
        code: products.error.code ?? null,
        message: products.error.message,
        at: new Date().toISOString(),
      }),
    );
    return [];
  }

  const promoted = new Set((active.data ?? []).map((row) => row.product_id));

  return (products.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    category: row.category,
    hasActivePromotion: promoted.has(row.id),
  }));
}

/**
 * One row of a maker's promotion history.
 *
 * Distinct from `PromotionSummary` in lib/promotions.ts, which is the payload
 * shown once *after* a payment clears. This is the ledger line; that is the
 * receipt.
 */
export type PromotionHistoryRow = {
  id: string;
  productName: string;
  productSlug: string;
  packageName: string;
  status: PromotionStatus;
  amountPaise: number;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  /** Razorpay payment id of the successful charge, for the customer's records. */
  paymentReference: string | null;
};

/**
 * A maker's promotion history, newest first. Powers the "your promotions" list
 * on the checkout page so a customer who has just paid can see the record
 * rather than take a success screen's word for it.
 *
 * `pending_payment` rows are included: a promotion whose payment failed is
 * exactly what someone comes back to look at.
 *
 * Four small queries instead of one embedded select. PostgREST embedding would
 * express this in a single round trip, but the shape it returns depends on
 * which side of the foreign key is being followed -- an object one way, an
 * array the other -- and getting that wrong is a type error that only surfaces
 * once the generated types are regenerated against the real schema. At a limit
 * of ten rows the joins are cheaper to do here than to get subtly wrong.
 */
export async function getUserPromotions(
  userId: string,
  limit = 10,
): Promise<PromotionHistoryRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("promotions")
    .select("id, product_id, package_id, status, amount_paise, starts_at, ends_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error(
      JSON.stringify({
        event: "user_promotions_query_failed",
        code: error.code ?? null,
        message: error.message,
        at: new Date().toISOString(),
      }),
    );
    return [];
  }

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const [products, packages, payments] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, slug")
      .in("id", [...new Set(rows.map((row) => row.product_id))]),
    supabase
      .from("promotion_packages")
      .select("id, name")
      .in("id", [...new Set(rows.map((row) => row.package_id))]),
    supabase
      .from("payments")
      .select("promotion_id, razorpay_payment_id")
      .eq("status", "paid")
      .in("promotion_id", [...new Set(rows.map((row) => row.id))]),
  ]);

  const productById = new Map((products.data ?? []).map((row) => [row.id, row]));
  const packageById = new Map((packages.data ?? []).map((row) => [row.id, row]));
  const referenceById = new Map(
    (payments.data ?? []).map((row) => [row.promotion_id, row.razorpay_payment_id]),
  );

  return rows.map((row) => ({
    id: row.id,
    productName: productById.get(row.product_id)?.name ?? "Your product",
    productSlug: productById.get(row.product_id)?.slug ?? "",
    packageName: packageById.get(row.package_id)?.name ?? "Promotion",
    status: row.status as PromotionStatus,
    amountPaise: Number(row.amount_paise),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    createdAt: row.created_at,
    paymentReference: referenceById.get(row.id) ?? null,
  }));
}

/**
 * Every promotion currently entitled to render, newest purchase first.
 *
 * The window is checked here rather than trusted from `status` alone, so a slot
 * stops appearing the instant it lapses -- there is no sweep job, and a
 * promotion that ended at 3am must not keep rendering until one runs.
 *
 * Service-role, and it has to be. `promotions` carries a select-own policy and
 * nothing else, so both the anon and the Clerk-token client would return an
 * empty set here rather than an error -- a promoted product would simply never
 * appear, with no failure to notice. The alternative, a public SELECT policy on
 * active rows, would expose `user_id` and `amount_paise` to anyone with the anon
 * key to satisfy a query that needs neither.
 *
 * NOTE: nothing calls this yet. Wiring promoted placements into the marketplace
 * and homepage is a separate change to those queries and their caches; this is
 * the seam it will read from. Until then a purchased slot is recorded, charged
 * and visible to its buyer, but is not yet rendered to visitors.
 */
export async function getActivePromotions(): Promise<
  { productId: string; placement: PromotionPlacement; endsAt: string }[]
> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("promotions")
    .select("product_id, placement, ends_at")
    .eq("status", "active")
    .gt("ends_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  // Promoted placement is an enhancement to a page that works without it, so a
  // failure here degrades to "no promotions" rather than breaking the listing.
  if (error || !data) return [];

  return data.map((row) => ({
    productId: row.product_id,
    placement: row.placement as PromotionPlacement,
    endsAt: row.ends_at as string,
  }));
}
