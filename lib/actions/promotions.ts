"use server";

/**
 * The money path: create a Razorpay order, then verify the payment that comes
 * back from it.
 *
 * Server Actions rather than Route Handlers, matching every other authenticated
 * write in this repo. That is not only consistency -- Next verifies the `Origin`
 * header against the `Host` on every Server Action POST, so CSRF protection is
 * structural here and would have to be hand-rolled on a route handler.
 *
 * The rule the whole file is built around
 * ---------------------------------------
 * The client sends a package id and a product id. It never sends an amount, and
 * there is no parameter here that could carry one. The price is read from
 * `promotion_packages` inside `createPromotionOrder`, and the order is created
 * from that figure. A tampered request can therefore choose *which* package to
 * buy -- which is just a menu -- but not what it costs.
 *
 * Every export of a `"use server"` module is a public HTTP endpoint that anyone
 * can post to, so this file exports exactly three functions and each one
 * re-establishes identity with `auth()` as its first statement. The service-role
 * writes they perform live in lib/promotion-activation.ts, which has no
 * `"use server"` directive and is therefore not addressable from a browser.
 */

import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";

import { createServiceClient } from "@/lib/supabase/service";
import { ensureProfile } from "@/lib/ensure-profile";
import { checkRateLimitByIpAndUser } from "@/lib/rate-limit";
import {
  createOrder,
  fetchPayment,
  checkoutSecret,
  isHexSignature,
  isRazorpayId,
  isRazorpayConfigured,
  publishableKeyId,
  verifyCheckoutSignature,
} from "@/lib/razorpay";
import {
  PAYMENT_ERROR_MESSAGE,
  VERIFICATION_ERROR_MESSAGE,
  type PromotionSummary,
} from "@/lib/promotions";
import {
  activatePromotion,
  audit,
  failPayment,
  promotionSummary,
  settlePayment,
} from "@/lib/promotion-activation";

/** What the browser needs to open Checkout. No secret is among these fields. */
export type CreateOrderResult =
  | {
      ok: true;
      /** Razorpay order id — safe to expose; it is what Checkout is opened with. */
      orderId: string;
      /** Publishable key id. Public by design; the *secret* never leaves this server. */
      keyId: string;
      amountPaise: number;
      currency: string;
      promotionId: string;
      packageName: string;
      productName: string;
    }
  | { ok: false; error: string };

export type VerifyResult =
  | { ok: true; summary: PromotionSummary }
  | { ok: false; error: string; retryable: boolean };

/**
 * A pending promotion older than this is not reused for a retry.
 *
 * Razorpay orders do not expire quickly, but a customer returning a day later
 * should be quoted today's price rather than resuming an order opened at an old
 * one. Fifteen minutes covers "the card failed, try another" without covering
 * "came back tomorrow".
 */
const RETRY_REUSE_MINUTES = 15;

// Create order
// ------------

/**
 * Price a promotion server-side and open a Razorpay order for it.
 *
 * Gates run cheapest first, the ordering lib/actions/ad-inquiry.ts established:
 * identity, then the rate limit, then database work, and only then an outbound
 * call to Razorpay. A rejected request never costs an order.
 */
export async function createPromotionOrder(input: {
  packageId: string;
  productId: string;
}): Promise<CreateOrderResult> {
  const { userId } = await auth();
  if (!userId) {
    return { ok: false, error: "Please log in to promote a product." };
  }

  if (!isRazorpayConfigured()) {
    audit("promotion_order_unconfigured", { reason: "missing_credentials" });
    return { ok: false, error: "Payments are temporarily unavailable. Please try again later." };
  }

  const allowed = await checkRateLimitByIpAndUser("promotionOrder", userId);
  if (!allowed.ok) return { ok: false, error: allowed.message };

  // Shape validation before anything touches the database. `packageId` is a
  // text primary key and `productId` a uuid; anything else is a crafted request.
  const packageId = String(input?.packageId ?? "").trim();
  const productId = String(input?.productId ?? "").trim();
  if (!/^[a-z0-9-]{1,64}$/.test(packageId)) {
    return { ok: false, error: "Choose a promotion package." };
  }
  if (!/^[0-9a-f-]{36}$/i.test(productId)) {
    return { ok: false, error: "Choose a product to promote." };
  }

  // `promotions.user_id` is a foreign key to profiles.id, and the webhook that
  // creates profiles is unreliable (see lib/ensure-profile.ts). Without this a
  // first-time buyer's insert fails on the foreign key.
  try {
    await ensureProfile();
  } catch (cause) {
    return {
      ok: false,
      error: cause instanceof Error ? cause.message : "Could not prepare your account.",
    };
  }

  const supabase = createServiceClient();

  // (1) The price. Read from the table, filtered on `is_active` so a retired
  //     package cannot be bought by naming its id.
  const { data: pkg } = await supabase
    .from("promotion_packages")
    .select("id, name, placement, duration_days, amount_paise, currency")
    .eq("id", packageId)
    .eq("is_active", true)
    .maybeSingle();

  if (!pkg) {
    return { ok: false, error: "That promotion package is no longer available." };
  }

  // (2) Ownership and eligibility. The service client bypasses RLS, so this
  //     check *is* the authorization -- there is no policy behind it to catch a
  //     mistake here. `creator_id` is compared explicitly, and `published` is
  //     required because a pending or draft launch renders nowhere for anyone,
  //     which is where this integrates with the existing review workflow.
  const { data: product } = await supabase
    .from("products")
    .select("id, name, creator_id, status")
    .eq("id", productId)
    .maybeSingle();

  if (!product || product.creator_id !== userId) {
    // One message for "does not exist" and "is not yours", so this cannot be
    // used to enumerate which product ids are real.
    return { ok: false, error: "That product is not available to promote." };
  }
  if (product.status !== "published") {
    return {
      ok: false,
      error: "Only a published product can be promoted. This one is still in review.",
    };
  }

  // (3) Already promoted? Checked here for a readable message; the partial
  //     unique index on `promotions (product_id) where status = 'active'` is
  //     what actually enforces it under a race.
  const { data: running } = await supabase
    .from("promotions")
    .select("id, ends_at")
    .eq("product_id", productId)
    .eq("status", "active")
    .gt("ends_at", new Date().toISOString())
    .maybeSingle();

  if (running) {
    return {
      ok: false,
      error:
        "This product already has a promotion running. You can buy the next one when it ends.",
    };
  }

  // (4) Retry reuse. A customer whose card failed comes back to the same
  //     promotion and the same Razorpay order rather than minting a second of
  //     each -- which is what would otherwise leave two pending promotions and
  //     two open orders behind one purchase.
  const reusableSince = new Date(Date.now() - RETRY_REUSE_MINUTES * 60 * 1000).toISOString();
  const { data: pending } = await supabase
    .from("promotions")
    .select("id, amount_paise")
    .eq("user_id", userId)
    .eq("product_id", productId)
    .eq("package_id", packageId)
    .eq("status", "pending_payment")
    .gte("created_at", reusableSince)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (pending && Number(pending.amount_paise) === Number(pkg.amount_paise)) {
    const { data: openPayment } = await supabase
      .from("payments")
      .select("razorpay_order_id, amount, currency")
      .eq("promotion_id", pending.id)
      .in("status", ["created", "pending"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // The open order's amount is re-checked against today's package price
    // rather than assumed: if the price moved since it was opened, the stale
    // order is abandoned and a fresh one created below at the current figure.
    if (openPayment && Number(openPayment.amount) === Number(pkg.amount_paise)) {
      audit("promotion_order_reused", {
        promotionId: pending.id,
        orderId: openPayment.razorpay_order_id,
      });
      return {
        ok: true,
        orderId: openPayment.razorpay_order_id,
        keyId: publishableKeyId()!,
        amountPaise: Number(pkg.amount_paise),
        currency: openPayment.currency,
        promotionId: pending.id,
        packageName: pkg.name,
        productName: product.name,
      };
    }
  }

  // (5) The promotion row, created before the order so the order's `notes` can
  //     carry its id -- which is what lets a webhook arriving for an otherwise
  //     unknown payment still be traced back to a purchase.
  const { data: promotion, error: promotionError } = await supabase
    .from("promotions")
    .insert({
      user_id: userId,
      product_id: productId,
      package_id: pkg.id,
      placement: pkg.placement,
      duration_days: pkg.duration_days,
      // Snapshotted. A later price change must not rewrite what this customer
      // agreed to pay.
      amount_paise: pkg.amount_paise,
      currency: pkg.currency,
      status: "pending_payment",
    })
    .select("id")
    .single();

  if (promotionError || !promotion) {
    audit("promotion_insert_failed", { code: promotionError?.code ?? null });
    return { ok: false, error: "Could not start that purchase. Please try again." };
  }

  // (6) The order. Razorpay caps `receipt` at 40 characters; a bare uuid is 36.
  const receipt = `bh_${promotion.id}`.slice(0, 40);
  const order = await createOrder({
    amountPaise: Number(pkg.amount_paise),
    currency: pkg.currency,
    receipt,
    notes: {
      promotion_id: promotion.id,
      product_id: productId,
      package_id: pkg.id,
      user_id: userId,
    },
  });

  if (!order.ok) {
    audit("promotion_order_failed", { promotionId: promotion.id });
    return { ok: false, error: order.error };
  }

  // (7) The payment record, storing Razorpay's own echoed amount rather than the
  //     package's, so the row reflects what was actually ordered.
  const { error: paymentError } = await supabase.from("payments").insert({
    user_id: userId,
    promotion_id: promotion.id,
    razorpay_order_id: order.data.id,
    receipt: order.data.receipt ?? receipt,
    amount: order.data.amount,
    currency: order.data.currency,
    status: "created",
  });

  if (paymentError) {
    // The order exists at Razorpay but we could not record it. Refusing here is
    // the safe direction: an unrecorded order nobody pays costs nothing, whereas
    // letting Checkout open against an order with no local row would take money
    // we could not afterwards match to a promotion.
    audit("payment_insert_failed", {
      promotionId: promotion.id,
      orderId: order.data.id,
      code: paymentError.code ?? null,
    });
    return { ok: false, error: "Could not start that purchase. Please try again." };
  }

  audit("promotion_order_created", {
    promotionId: promotion.id,
    orderId: order.data.id,
    packageId: pkg.id,
  });

  return {
    ok: true,
    orderId: order.data.id,
    keyId: publishableKeyId()!,
    amountPaise: order.data.amount,
    currency: order.data.currency,
    promotionId: promotion.id,
    packageName: pkg.name,
    productName: product.name,
  };
}

// Verify
// ------

/**
 * Confirm a Checkout callback and, only then, activate the promotion.
 *
 * Four independent things must all hold before anything is marked paid:
 *
 *   1. the HMAC over `order_id|payment_id` matches, under the key secret;
 *   2. the payment row for that order belongs to the caller;
 *   3. Razorpay's own API reports the payment captured, against that order;
 *   4. the captured amount and currency equal what we recorded.
 *
 * (1) alone is not enough. A signature attests only to the three ids inside it,
 * so a caller replaying an authentic-but-unrelated triple would pass it. (3) and
 * (4) are what make the callback a claim we check rather than a fact we accept.
 */
export async function verifyPromotionPayment(input: {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}): Promise<VerifyResult> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Please log in.", retryable: false };

  const allowed = await checkRateLimitByIpAndUser("paymentVerify", userId);
  if (!allowed.ok) return { ok: false, error: allowed.message, retryable: true };

  const orderId = String(input?.razorpay_order_id ?? "");
  const paymentId = String(input?.razorpay_payment_id ?? "");
  const signature = String(input?.razorpay_signature ?? "");

  if (
    !isRazorpayId(orderId, "order") ||
    !isRazorpayId(paymentId, "pay") ||
    !isHexSignature(signature)
  ) {
    return { ok: false, error: VERIFICATION_ERROR_MESSAGE, retryable: false };
  }

  const secret = checkoutSecret();
  if (!secret) {
    return { ok: false, error: "Payments are temporarily unavailable.", retryable: true };
  }

  // (1) Authenticity.
  if (!verifyCheckoutSignature({ orderId, paymentId, signature }, secret)) {
    audit("payment_signature_rejected", { orderId, paymentId });
    return { ok: false, error: VERIFICATION_ERROR_MESSAGE, retryable: false };
  }

  const supabase = createServiceClient();
  const { data: payment } = await supabase
    .from("payments")
    .select("id, user_id, promotion_id, amount, currency, status, razorpay_payment_id")
    .eq("razorpay_order_id", orderId)
    .maybeSingle();

  // (2) Authorization. A valid signature proves Razorpay produced it, not that
  //     the person presenting it is the buyer.
  if (!payment || payment.user_id !== userId) {
    audit("payment_owner_mismatch", { orderId, paymentId });
    return { ok: false, error: VERIFICATION_ERROR_MESSAGE, retryable: false };
  }

  // Already settled -- by an earlier call, or by the webhook winning the race.
  // Idempotent success rather than an error: the customer paid once and should
  // see one success screen however many times this runs.
  if (payment.status === "paid") {
    await activatePromotion(payment.promotion_id);
    const existing = await promotionSummary(
      payment.promotion_id,
      payment.razorpay_payment_id ?? paymentId,
    );
    return existing.ok
      ? { ok: true, summary: existing.summary }
      : { ok: false, error: existing.error, retryable: false };
  }

  // (3) and (4). Razorpay's word, not the browser's.
  const remote = await fetchPayment(paymentId);
  if (!remote.ok) {
    return {
      ok: false,
      error: "We could not confirm that payment yet. Please refresh in a moment.",
      retryable: true,
    };
  }

  const captured = remote.data.status === "captured" || remote.data.status === "authorized";
  const belongsToOrder = remote.data.order_id === orderId;

  if (!captured || !belongsToOrder) {
    audit("payment_not_settled", {
      orderId,
      paymentId,
      remoteStatus: remote.data.status,
      belongsToOrder,
    });

    // A genuinely failed payment is recorded as failed so a retry starts clean.
    // A mismatched one is recorded as nothing -- it is not this payment.
    if (remote.data.status === "failed" && belongsToOrder) {
      await failPayment({
        orderId,
        code: remote.data.error_code,
        description: remote.data.error_description,
        userId,
      });
      return { ok: false, error: PAYMENT_ERROR_MESSAGE, retryable: true };
    }

    return { ok: false, error: VERIFICATION_ERROR_MESSAGE, retryable: false };
  }

  // Check (4). The amount comparison lives inside `settlePayment`, which
  // refuses to settle a row whose recorded amount differs from what was
  // captured -- and a refusal must never be read as a success, or a mismatched
  // capture would draw a success screen over an unpaid promotion.
  const settled = await settlePayment({
    orderId,
    paymentId,
    amount: Number(remote.data.amount),
    currency: remote.data.currency,
    signature,
  });

  if (!settled.ok) {
    audit("payment_settlement_refused", { orderId, paymentId, reason: settled.reason });
    return { ok: false, error: VERIFICATION_ERROR_MESSAGE, retryable: false };
  }

  audit("payment_verified", {
    orderId,
    paymentId,
    promotionId: settled.promotionId,
    firstSettlement: settled.firstWrite,
  });

  // The maker's dashboard and their promotion history both change on payment.
  revalidatePath("/dashboard");
  revalidatePath("/promote/checkout");

  const summary = await promotionSummary(settled.promotionId, paymentId);
  return summary.ok
    ? { ok: true, summary: summary.summary }
    : { ok: false, error: summary.error, retryable: false };
}

/**
 * Record that a payment attempt failed, so the customer's history is honest and
 * a retry starts from a clean state.
 *
 * Cannot mark anything paid. It only ever writes `failed`, only over a
 * still-open payment, and only over one belonging to the caller -- so the worst
 * a forged call achieves is marking the caller's own open payment failed, which
 * they can already do by closing the Checkout modal.
 */
export async function recordPromotionPaymentFailure(input: {
  razorpay_order_id: string;
  code?: string;
  description?: string;
}): Promise<{ ok: boolean }> {
  const { userId } = await auth();
  if (!userId) return { ok: false };

  const orderId = String(input?.razorpay_order_id ?? "");
  if (!isRazorpayId(orderId, "order")) return { ok: false };

  await failPayment({
    orderId,
    code: String(input?.code ?? "") || null,
    description: String(input?.description ?? "") || null,
    userId,
  });

  return { ok: true };
}
