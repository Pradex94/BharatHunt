"use server";

import { revalidatePath } from "next/cache";
import { auth, currentUser } from "@clerk/nextjs/server";

import { getIsAdmin } from "@/lib/admin";
import { checkRateLimitByIpAndUser } from "@/lib/rate-limit";
import {
  approveProductById,
  notifyReviewers,
  rejectProductById,
  type ReviewOutcome,
} from "@/lib/review";
import { verifyReviewToken, type ReviewAction } from "@/lib/review-token";
import { createClient } from "@/lib/supabase/server";

/**
 * The Server Actions behind the review queue.
 *
 * Everything exported from a `"use server"` module is a public endpoint reachable
 * by anyone who can guess its id, so authorisation is the first thing each one
 * does — never a check the calling page performed on its behalf. Two ways in are
 * accepted, and they are equivalent in authority:
 *
 *   - a signed-in admin (`getIsAdmin()`), which is the /admin queue;
 *   - a valid signed link (`verifyReviewToken`), which is the mail. Scoped to one
 *     product and one action, so an approve link cannot approve anything else.
 *
 * The work itself lives in lib/review.ts, which does no permission checking at
 * all — the split is what keeps "who may do this" in one readable place.
 */

/** True when this caller may act on `productId`. */
async function mayReview(
  productId: string,
  action: ReviewAction,
  token: string | null | undefined,
): Promise<boolean> {
  if (verifyReviewToken(token, productId, action)) return true;
  return getIsAdmin();
}

const DENIED =
  "That review link has expired or is not valid. Sign in as an admin to review this launch.";

export async function approveProduct(
  productId: string,
  token?: string | null,
): Promise<ReviewOutcome> {
  if (!(await mayReview(productId, "approve", token))) {
    return { ok: false, error: DENIED };
  }
  return approveProductById(productId);
}

export async function rejectProduct(
  productId: string,
  note?: string | null,
  token?: string | null,
): Promise<ReviewOutcome> {
  if (!(await mayReview(productId, "reject", token))) {
    return { ok: false, error: DENIED };
  }
  // Maker-facing text, so it is bounded before it reaches an email template.
  const trimmed = (note ?? "").trim().slice(0, 1000);
  return rejectProductById(productId, trimmed || null);
}

/**
 * Puts a maker's own draft back into the queue.
 *
 * The write goes through the *user* client, so the products RLS policy is what
 * proves ownership — matching how every other maker action in this codebase
 * establishes it. `eq("status", "draft")` means a product already in review
 * cannot be resubmitted to mail the admin twice.
 */
export async function submitForReview(productId: string): Promise<ReviewOutcome> {
  const { userId } = await auth();
  if (!userId) {
    return { ok: false, error: "Sign in to submit this product for review." };
  }

  const rate = await checkRateLimitByIpAndUser("productUpdate", userId);
  if (!rate.ok) {
    return { ok: false, error: rate.message };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("products")
    .update({ status: "pending" })
    .eq("id", productId)
    .eq("creator_id", userId)
    .eq("status", "draft")
    .select(
      "id, slug, name, tagline, description, category, pricing_type, website_url, github_url, launch_state",
    )
    .maybeSingle();

  if (error) {
    return { ok: false, error: `Could not submit that product: ${error.message}` };
  }
  if (!data) {
    return {
      ok: false,
      error: "That product isn't a draft you own — it may already be in review.",
    };
  }

  const user = await currentUser();
  const makerName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.username || null;

  await notifyReviewers(
    {
      id: data.id,
      slug: data.slug,
      name: data.name,
      tagline: data.tagline,
      description: data.description,
      category: data.category,
      pricingType: data.pricing_type,
      websiteUrl: data.website_url,
      githubUrl: data.github_url,
      launchState: data.launch_state,
    },
    makerName,
  );

  // It moved out of the maker's drafts and into the admin's queue.
  revalidatePath("/dashboard");
  revalidatePath("/admin");

  return { ok: true, slug: data.slug };
}
