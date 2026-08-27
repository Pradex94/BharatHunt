"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";

import { cacheInvalidatePrefix } from "@/lib/cache";
import { ensureProfile } from "@/lib/ensure-profile";
import { checkRateLimitByIpAndUser } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { PRODUCTS_CACHE_PREFIX } from "@/services/products";

export type RatingState = { error?: string; rating?: number } | undefined;

/**
 * Records or changes the caller's rating of a product.
 *
 * Every rule that matters lives in the database (see
 * 20260828000000_product_ratings.sql): one rating per person per product, no
 * rating your own product, and aggregates written only by trigger. This action
 * is the pleasant way to reach those rules, not the thing enforcing them — the
 * anon key is public, so a check that exists only here is a suggestion.
 *
 * The upsert is what makes changing a rating the same operation as casting one:
 * the unique constraint turns a second submission into an update, so there is
 * no separate "edit" path to keep in step.
 */
export async function rateProduct(
  productId: string,
  productSlug: string,
  rating: number,
): Promise<RatingState> {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { error: "A rating is a whole number of stars from 1 to 5." };
  }

  const { userId } = await auth();
  if (!userId) {
    return { error: "Sign in to rate this product." };
  }

  const limit = await checkRateLimitByIpAndUser("upvote", userId);
  if (!limit.ok) {
    return { error: limit.message };
  }

  try {
    await ensureProfile();
  } catch (profileError) {
    return {
      error:
        profileError instanceof Error ? profileError.message : "Could not prepare your profile.",
    };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("product_ratings")
    .upsert(
      { product_id: productId, user_id: userId, rating },
      { onConflict: "product_id,user_id" },
    );

  if (error) {
    /*
     * The self-rating rule is an RLS refusal, which arrives as a policy error
     * rather than something readable. Anything else is genuinely unexpected and
     * is surfaced as-is.
     */
    if (/row-level security|violates/i.test(error.message)) {
      return { error: "You can't rate your own product." };
    }
    return { error: `Could not save your rating: ${error.message}` };
  }

  // The average is denormalised onto products and read by the cards, the
  // collection pages and the schema builder.
  await cacheInvalidatePrefix(PRODUCTS_CACHE_PREFIX);
  revalidatePath(`/products/${productSlug}`);

  return { rating };
}

/** Removes the caller's rating. Scoped by `user_id` and by the RLS policy behind it. */
export async function clearRating(productId: string, productSlug: string): Promise<RatingState> {
  const { userId } = await auth();
  if (!userId) {
    return { error: "Sign in to change your rating." };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("product_ratings")
    .delete()
    .eq("product_id", productId)
    .eq("user_id", userId);

  if (error) {
    return { error: `Could not remove your rating: ${error.message}` };
  }

  await cacheInvalidatePrefix(PRODUCTS_CACHE_PREFIX);
  revalidatePath(`/products/${productSlug}`);

  return {};
}
