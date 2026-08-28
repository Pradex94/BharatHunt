import "server-only";

/**
 * Service-role writes that settle a payment and turn it into a live promotion.
 *
 * These live outside lib/actions/promotions.ts on purpose, and the reason is a
 * security property rather than tidiness: **every export of a `"use server"`
 * module is a public HTTP endpoint.** Next assigns each one an action id and
 * serves it to anyone who posts that id, whether or not a client component ever
 * imports it. `activatePromotion(promotionId)` sitting in that file would
 * therefore be an unauthenticated "make this promotion live" endpoint taking the
 * id as its only argument.
 *
 * Here, with no `"use server"` directive, they are ordinary functions: reachable
 * from the Server Action and from the webhook route, reachable from nowhere
 * else. `server-only` makes importing them from a client component a build
 * error.
 *
 * Nothing in this file decides *whether* money arrived. Each function is called
 * by something that has already established that -- a verified Checkout
 * signature plus Razorpay's own API, or a signed webhook -- and its job is to
 * record the consequence exactly once.
 */

import { createServiceClient } from "@/lib/supabase/service";
import {
  promotionWindow,
  VERIFICATION_ERROR_MESSAGE,
  type PromotionSummary,
} from "@/lib/promotions";

/**
 * Structured audit line for the payment path.
 *
 * Ids, codes and booleans only. No email, no name, no Razorpay secret, no
 * request body -- Vercel retains these logs and makes them searchable, so a
 * field added here is a field kept indefinitely.
 */
export function audit(event: string, fields: Record<string, string | number | boolean | null>) {
  console.log(JSON.stringify({ event, ...fields, at: new Date().toISOString() }));
}

/**
 * Move a promotion to `active` and stamp the window the customer bought.
 *
 * Idempotent by construction: the update is conditioned on the row still being
 * `pending_payment`, so the second caller of a race matches no rows and changes
 * nothing. Both the browser's verify call and the webhook run this, routinely.
 */
export async function activatePromotion(promotionId: string): Promise<void> {
  const supabase = createServiceClient();

  const { data: promotion } = await supabase
    .from("promotions")
    .select("id, duration_days, status")
    .eq("id", promotionId)
    .maybeSingle();

  if (!promotion || promotion.status !== "pending_payment") return;

  const { startsAt, endsAt } = promotionWindow(new Date(), promotion.duration_days);

  const { error } = await supabase
    .from("promotions")
    .update({
      status: "active",
      starts_at: startsAt,
      ends_at: endsAt,
      activated_at: startsAt,
    })
    .eq("id", promotionId)
    .eq("status", "pending_payment");

  if (error) {
    // A 23505 here is the partial unique index doing its job: another promotion
    // for this product is already active. The payment stands and support can
    // extend or refund it; what must not happen is two live slots for one
    // product, and it now cannot.
    audit("promotion_activation_conflict", { promotionId, code: error.code ?? null });
    return;
  }

  audit("promotion_activated", { promotionId, endsAt });
}

/**
 * The outcome of a settlement attempt.
 *
 * `ok` and "this call was the one that wrote the row" are deliberately separate
 * fields. Both `true` and `false` for `firstWrite` are success -- the other path
 * having already settled it is the normal result of a race, not a failure -- but
 * a caller must never treat a *refused* settlement as one. Collapsing the two
 * into a single boolean is how an amount mismatch ends up rendering a success
 * screen over an unpaid promotion.
 */
export type SettlementResult =
  | { ok: true; firstWrite: boolean; promotionId: string }
  | { ok: false; reason: "unknown_order" | "amount_mismatch"; promotionId: string | null };

/**
 * Mark a payment paid from a trusted settlement signal, and activate its
 * promotion.
 *
 * The amount is re-checked against our own row rather than taken from the
 * caller: a settlement for a different figure than we charged is not this
 * payment, and activating on it would hand out a slot for whatever the payer
 * chose to send. The caller has already established that money arrived; this
 * establishes that it was *our* money.
 */
export async function settlePayment(params: {
  orderId: string;
  paymentId: string;
  amount: number;
  currency: string;
  /** Only the Checkout callback has one; a webhook does not. */
  signature?: string;
}): Promise<SettlementResult> {
  const supabase = createServiceClient();

  const { data: payment } = await supabase
    .from("payments")
    .select("id, promotion_id, amount, currency, status")
    .eq("razorpay_order_id", params.orderId)
    .maybeSingle();

  if (!payment) {
    audit("payment_unknown_order", { orderId: params.orderId, paymentId: params.paymentId });
    return { ok: false, reason: "unknown_order", promotionId: null };
  }

  if (Number(payment.amount) !== Number(params.amount) || payment.currency !== params.currency) {
    audit("payment_amount_mismatch", {
      orderId: params.orderId,
      paymentId: params.paymentId,
      expected: Number(payment.amount),
      received: Number(params.amount),
    });
    return { ok: false, reason: "amount_mismatch", promotionId: payment.promotion_id };
  }

  if (payment.status === "paid") {
    // Already settled by the other path. Activation is still attempted, and is
    // itself a no-op if it already happened -- which covers the one ordering
    // that would otherwise strand a customer: settling succeeded, activating
    // did not.
    await activatePromotion(payment.promotion_id);
    return { ok: true, firstWrite: false, promotionId: payment.promotion_id };
  }

  const { data: updated } = await supabase
    .from("payments")
    .update({
      status: "paid",
      razorpay_payment_id: params.paymentId,
      ...(params.signature ? { razorpay_signature: params.signature } : {}),
      // A payment that succeeds on retry clears the earlier failure.
      error_code: null,
      error_description: null,
    })
    .eq("id", payment.id)
    .in("status", ["created", "pending", "failed"])
    .select("id");

  await activatePromotion(payment.promotion_id);

  return {
    ok: true,
    firstWrite: (updated?.length ?? 0) > 0,
    promotionId: payment.promotion_id,
  };
}

/**
 * Record a failed attempt. Never touches a payment that has already been paid --
 * a late `payment.failed` for a retried order must not undo the retry that
 * worked.
 */
export async function failPayment(params: {
  orderId: string;
  code?: string | null;
  description?: string | null;
  userId?: string;
}): Promise<void> {
  const supabase = createServiceClient();

  let query = supabase
    .from("payments")
    .update({
      status: "failed",
      error_code: params.code?.slice(0, 80) ?? null,
      error_description: params.description?.slice(0, 500) ?? null,
    })
    .eq("razorpay_order_id", params.orderId)
    .in("status", ["created", "pending"]);

  // The browser-initiated path scopes the write to the caller's own rows. The
  // webhook has no session and does not pass this.
  if (params.userId) query = query.eq("user_id", params.userId);

  await query;
  audit("payment_failed_recorded", { orderId: params.orderId, code: params.code ?? null });
}

/**
 * Record a refund and stand the promotion down.
 *
 * A partial refund leaves the payment `paid` with `refunded_amount` set: the
 * customer still bought the slot. Only a full refund flips the payment to
 * `refunded` and ends the promotion, which is the state that frees the product
 * to be promoted again.
 */
export async function refundPayment(params: {
  paymentId: string;
  refundedAmount: number;
}): Promise<void> {
  const supabase = createServiceClient();

  const { data: payment } = await supabase
    .from("payments")
    .select("id, promotion_id, amount, refunded_amount")
    .eq("razorpay_payment_id", params.paymentId)
    .maybeSingle();

  if (!payment) {
    audit("refund_unknown_payment", { paymentId: params.paymentId });
    return;
  }

  const fullyRefunded = Number(params.refundedAmount) >= Number(payment.amount);

  await supabase
    .from("payments")
    .update({
      refunded_amount: params.refundedAmount,
      ...(fullyRefunded ? { status: "refunded" } : {}),
    })
    .eq("id", payment.id);

  if (fullyRefunded) {
    await supabase
      .from("promotions")
      .update({ status: "refunded", ends_at: new Date().toISOString() })
      .eq("id", payment.promotion_id)
      .in("status", ["pending_payment", "active"]);
  }

  audit("refund_recorded", {
    paymentId: params.paymentId,
    promotionId: payment.promotion_id,
    fullyRefunded,
  });
}

/**
 * The success payload, read back from the database rather than assembled from
 * whatever the browser sent. What the customer is shown is what was stored.
 */
export async function promotionSummary(
  promotionId: string,
  reference: string,
): Promise<{ ok: true; summary: PromotionSummary } | { ok: false; error: string }> {
  const supabase = createServiceClient();

  const { data: promotion } = await supabase
    .from("promotions")
    .select("id, product_id, package_id, amount_paise, starts_at, ends_at")
    .eq("id", promotionId)
    .maybeSingle();

  if (!promotion) return { ok: false, error: VERIFICATION_ERROR_MESSAGE };

  const [{ data: product }, { data: pkg }] = await Promise.all([
    supabase.from("products").select("name").eq("id", promotion.product_id).maybeSingle(),
    supabase.from("promotion_packages").select("name").eq("id", promotion.package_id).maybeSingle(),
  ]);

  return {
    ok: true,
    summary: {
      reference,
      productName: product?.name ?? "Your product",
      packageName: pkg?.name ?? "Promotion",
      startsAt: promotion.starts_at,
      endsAt: promotion.ends_at,
      amountPaise: Number(promotion.amount_paise),
    },
  };
}
