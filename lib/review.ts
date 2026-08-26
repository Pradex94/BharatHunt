import "server-only";

import { revalidatePath } from "next/cache";
import { clerkClient } from "@clerk/nextjs/server";

import { ADMIN_EMAILS, SITE_URL } from "@/lib/constants";
import { cacheInvalidatePrefix } from "@/lib/cache";
import { sendEmail } from "@/lib/email";
import {
  buildLaunchRejectedEmail,
  buildLaunchReviewEmail,
  buildSubmissionAckEmail,
  type ReviewedProduct,
} from "@/lib/emails/launch-review";
import { buildProductLaunchEmail } from "@/lib/emails/product-launch";
import { signReviewToken } from "@/lib/review-token";
import { createServiceClient } from "@/lib/supabase/service";
import { PRODUCTS_CACHE_PREFIX } from "@/services/products";

/**
 * The review queue's engine: everything that happens to a product between
 * "submitted" and "live", minus the Server Action wrappers in
 * lib/actions/review.ts.
 *
 * Kept out of that file on purpose. A `"use server"` module exposes every
 * export as a callable endpoint, so helpers that skip the authorisation check —
 * `approveProductById` does no permission work of its own — must not live
 * there. Their caller is responsible for proving the caller may act, which is
 * exactly what the actions file does and nothing else can.
 *
 * Every write here uses the service-role client. That is not a shortcut around
 * RLS: the trigger added in 20260825000000_launch_review_queue.sql refuses
 * `status = 'published'` from any other Postgres role, so publishing genuinely
 * cannot happen through a maker's session even if this code were wrong.
 */

/** What the review mail needs, in the shape the emails already expect. */
export type ReviewSubject = ReviewedProduct;

export type ReviewOutcome = { ok: true; slug: string } | { ok: false; error: string };

const REVIEW_COLUMNS =
  "id, slug, name, tagline, description, category, pricing_type, website_url, github_url, launch_state, status, creator_id";

/** Maps a products row onto the email payload. */
function toSubject(row: {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description?: string | null;
  category: string;
  pricing_type?: string | null;
  website_url?: string | null;
  github_url?: string | null;
  launch_state?: string | null;
}): ReviewSubject {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    description: row.description,
    category: row.category,
    pricingType: row.pricing_type,
    websiteUrl: row.website_url,
    githubUrl: row.github_url,
    launchState: row.launch_state,
  };
}

/**
 * The links that go in the review mail.
 *
 * Without `ADMIN_REVIEW_SECRET` the one-click pair is null and only the queue
 * link ships — the feature degrades to "sign in and approve" rather than to
 * "anyone who has the URL can approve".
 */
export function reviewLinksFor(productId: string) {
  const approve = signReviewToken(productId, "approve");
  const reject = signReviewToken(productId, "reject");
  const base = `${SITE_URL}/admin/review/${encodeURIComponent(productId)}`;

  return {
    approveUrl: approve ? `${base}?action=approve&token=${encodeURIComponent(approve)}` : null,
    rejectUrl: reject ? `${base}?action=reject&token=${encodeURIComponent(reject)}` : null,
    queueUrl: `${SITE_URL}/admin`,
  };
}

/**
 * The maker's contact details, from Clerk — `profiles` stores no email.
 *
 * Returns nulls rather than throwing: a launch must not fail, and an approval
 * must not be refused, because Clerk is slow or the account was deleted.
 */
async function makerContact(
  clerkUserId: string,
): Promise<{ email: string | null; name: string | null }> {
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(clerkUserId);
    const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || null;
    return { email: user.primaryEmailAddress?.emailAddress ?? null, name };
  } catch (error) {
    console.error(`[review] could not read the maker's Clerk profile: ${String(error)}`);
    return { email: null, name: null };
  }
}

/** Logs a failed send without ever putting the address in a shared log. */
function logSendFailure(kind: string, slug: string, error: string): void {
  console.error(`[review] ${kind} mail for "${slug}" was not delivered: ${error}`);
}

/**
 * Tells the admins a launch is waiting.
 *
 * Fail-open like every other send in this codebase (see lib/email.ts): a
 * submission is already stored and queued, and losing the notification must not
 * look to the maker like a failed launch. The queue on /admin is the durable
 * record; this mail is the prompt to go look at it.
 */
export async function notifyReviewers(
  product: ReviewSubject,
  makerName: string | null,
): Promise<void> {
  if (ADMIN_EMAILS.length === 0) return;

  const email = buildLaunchReviewEmail(product, makerName, reviewLinksFor(product.id));
  const sent = await sendEmail({ to: [...ADMIN_EMAILS], ...email });
  if (!sent.ok) logSendFailure("review-request", product.slug, sent.error);
}

/** Tells the maker their submission arrived and is queued. */
export async function sendSubmissionAck(
  product: ReviewSubject,
  to: string | null | undefined,
  makerName: string | null,
): Promise<void> {
  if (!to) return;

  const email = buildSubmissionAckEmail(product, makerName);
  const sent = await sendEmail({ to, ...email });
  if (!sent.ok) logSendFailure("submission-ack", product.slug, sent.error);
}

/** Everything a publish changes: lists, featured, counts, stats, the sitemap. */
async function revalidateAfterReview(slug: string): Promise<void> {
  await cacheInvalidatePrefix(PRODUCTS_CACHE_PREFIX);
  revalidatePath("/admin");
  revalidatePath("/dashboard");
  revalidatePath("/marketplace");
  revalidatePath("/");
  revalidatePath(`/products/${slug}`);
}

/**
 * Publishes a pending product. **Performs no authorisation** — the caller must
 * have proved the actor is an admin or holds a valid signed link.
 *
 * The `eq("status", "pending")` in the update is the concurrency guard: two
 * approvals of the same product (the mail on a phone, the queue on a laptop)
 * leave the second matching no rows, so `published_at` is written once and the
 * maker is told once.
 */
export async function approveProductById(productId: string): Promise<ReviewOutcome> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("products")
    .update({ status: "published", published_at: new Date().toISOString() })
    .eq("id", productId)
    .eq("status", "pending")
    .select(REVIEW_COLUMNS)
    .maybeSingle();

  if (error) {
    return { ok: false, error: `Could not approve that product: ${error.message}` };
  }
  if (!data) {
    return { ok: false, error: "That product is not waiting for review — it may already be live." };
  }

  const product = toSubject(data);
  await revalidateAfterReview(product.slug);

  // The maker's "you're live" receipt, the same one a launch used to send at
  // submission time. It belongs here now: it is only true once approved.
  const maker = await makerContact(data.creator_id);
  if (maker.email) {
    const email = buildProductLaunchEmail(
      {
        name: product.name,
        tagline: product.tagline,
        slug: product.slug,
        category: product.category,
        launchState: product.launchState,
      },
      maker.name,
    );
    const sent = await sendEmail({ to: maker.email, ...email });
    if (!sent.ok) logSendFailure("launch-receipt", product.slug, sent.error);
  }

  return { ok: true, slug: product.slug };
}

/**
 * Sends a pending product back to its maker's drafts. **Performs no
 * authorisation** — see `approveProductById`.
 *
 * Rejection is deliberately not deletion. The maker keeps the row, the images
 * and every field, and `submitForReview` puts it back in the queue once they
 * have revised it.
 */
export async function rejectProductById(
  productId: string,
  note?: string | null,
): Promise<ReviewOutcome> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("products")
    .update({ status: "draft" })
    .eq("id", productId)
    .eq("status", "pending")
    .select(REVIEW_COLUMNS)
    .maybeSingle();

  if (error) {
    return { ok: false, error: `Could not send that product back: ${error.message}` };
  }
  if (!data) {
    return { ok: false, error: "That product is not waiting for review." };
  }

  const product = toSubject(data);
  await revalidateAfterReview(product.slug);

  const maker = await makerContact(data.creator_id);
  if (maker.email) {
    const email = buildLaunchRejectedEmail(product, maker.name, note);
    const sent = await sendEmail({ to: maker.email, ...email });
    if (!sent.ok) logSendFailure("rejection", product.slug, sent.error);
  }

  return { ok: true, slug: product.slug };
}

/** One pending product, for the confirmation screen behind a signed link. */
export async function getProductForReview(productId: string): Promise<
  | (ReviewSubject & { status: string; makerName: string | null })
  | null
> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("products")
    .select(REVIEW_COLUMNS)
    .eq("id", productId)
    .maybeSingle();

  if (!data) return null;

  const maker = await makerContact(data.creator_id);
  return { ...toSubject(data), status: data.status, makerName: maker.name };
}
