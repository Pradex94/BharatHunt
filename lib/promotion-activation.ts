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
 * by something that has already established that -- Dodo's own session status
 * read back over the API, or a signed webhook -- and its job is to record the
 * consequence exactly once.
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
 * Ids, codes and booleans only. No email, no name, no Dodo key, no request body
 * -- Vercel retains these logs and makes them searchable, so a field added here
 * is a field kept indefinitely.
 */
export function audit(event: string, fields: Record<string, string | number | boolean | null>) {
  console.log(JSON.stringify({ event, ...fields, at: new Date().toISOString() }));
}

/**
 * Move a promotion to `active` and stamp the window the customer bought.
 *
 * Idempotent by construction: the update is conditioned on the row still being
 * `pending_payment`, so the second caller of a race matches no rows and changes
 * nothing. Both the browser's return path and the webhook run this, routinely.
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
 * into a single boolean is how a mismatched charge ends up rendering a success
 * screen over an unpaid promotion.
 */
export type SettlementResult =
  | { ok: true; firstWrite: boolean; promotionId: string }
  | {
      ok: false;
      reason: "unknown_session" | "promotion_mismatch" | "currency_mismatch" | "amount_short";
      promotionId: string | null;
    }
  ;

/**
 * Mark a payment paid from a trusted settlement signal, and activate its
 * promotion.
 *
 * What is checked here, and why it is not an amount equality
 * ---------------------------------------------------------
 * The Razorpay integration this replaces compared the settled amount to our own
 * row and refused anything that differed, because we had sent that exact figure
 * and any other number meant "not this payment". Dodo Payments is a Merchant of
 * Record: it charges the catalogue price for the product the session named, then
 * adds the sales tax it is legally the seller for. `total_amount` is therefore
 * *expected* to exceed the net figure we quoted, by an amount that varies with
 * the customer's country. An equality check would reject every taxed purchase.
 *
 * So the binding moved to identity, which is strictly the stronger property
 * anyway:
 *
 *   1. the payment names the checkout session we opened for this promotion;
 *   2. the promotion id we put in that session's metadata came back unchanged;
 *   3. the charge is in the currency we quoted in;
 *   4. it is not *less* than the net price we quoted.
 *
 * (1) and (2) are what make this payment ours. (4) still catches the case an
 * equality check existed for -- a cheaper charge being pointed at an expensive
 * slot -- without rejecting the tax on top. None of the four is influenceable by
 * the customer: the price lives in Dodo's catalogue, and the metadata was
 * written server-side when the session was created.
 */
export async function settlePayment(params: {
  sessionId: string;
  paymentId: string;
  /** `total_amount` from Dodo: the net price plus whatever tax it collected. */
  chargedAmount: number;
  currency: string;
  /** Tax component of `chargedAmount`, when Dodo reports one. */
  tax?: number | null;
  /** `metadata.promotion_id`, echoed back by Dodo. Checked, never trusted. */
  metadataPromotionId?: string | null;
}): Promise<SettlementResult> {
  const supabase = createServiceClient();

  const { data: payment } = await supabase
    .from("payments")
    .select("id, promotion_id, amount, currency, status")
    .eq("dodo_session_id", params.sessionId)
    .maybeSingle();

  // Check (1). A session we never opened is not a purchase of ours.
  if (!payment) {
    audit("payment_unknown_session", { sessionId: params.sessionId, paymentId: params.paymentId });
    return { ok: false, reason: "unknown_session", promotionId: null };
  }

  // Check (2). Absent metadata is tolerated -- Dodo omits the field rather than
  // sending an empty object on some event shapes -- but a *contradicting* value
  // is not. Settling on it would credit one maker's promotion from another's
  // payment.
  if (params.metadataPromotionId && params.metadataPromotionId !== payment.promotion_id) {
    audit("payment_promotion_mismatch", {
      sessionId: params.sessionId,
      paymentId: params.paymentId,
      expected: payment.promotion_id,
    });
    return { ok: false, reason: "promotion_mismatch", promotionId: payment.promotion_id };
  }

  // Check (3). Currency selection is disabled on the session, so a different
  // currency here means the charge did not come from the session we built.
  if (payment.currency !== params.currency) {
    audit("payment_currency_mismatch", {
      sessionId: params.sessionId,
      paymentId: params.paymentId,
      expected: payment.currency,
      received: params.currency,
    });
    return { ok: false, reason: "currency_mismatch", promotionId: payment.promotion_id };
  }

  // Check (4). Tax only ever adds.
  if (Number(params.chargedAmount) < Number(payment.amount)) {
    audit("payment_amount_short", {
      sessionId: params.sessionId,
      paymentId: params.paymentId,
      quoted: Number(payment.amount),
      charged: Number(params.chargedAmount),
    });
    return { ok: false, reason: "amount_short", promotionId: payment.promotion_id };
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
      dodo_payment_id: params.paymentId,
      charged_amount: params.chargedAmount,
      charged_currency: params.currency,
      charged_tax: params.tax ?? null,
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
 * a late `payment.failed` for a retried session must not undo the retry that
 * worked.
 */
export async function failPayment(params: {
  sessionId: string;
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
    .eq("dodo_session_id", params.sessionId)
    .in("status", ["created", "pending"]);

  // The browser-initiated path scopes the write to the caller's own rows. The
  // webhook has no session and does not pass this.
  if (params.userId) query = query.eq("user_id", params.userId);

  await query;
  audit("payment_failed_recorded", { sessionId: params.sessionId, code: params.code ?? null });
}

/**
 * Mark a payment as still in flight.
 *
 * Dodo's hosted checkout can leave a payment `processing` or
 * `requires_customer_action` -- a UPI mandate awaiting approval, a 3DS step the
 * customer has not finished -- for minutes. That is neither paid nor failed, and
 * recording it as either would be a lie the customer reads on their own history
 * page. Only ever moves a still-open row, so it cannot walk back a settlement
 * that landed while the customer was looking at the pending screen.
 */
export async function markPaymentPending(params: {
  sessionId: string;
  paymentId?: string | null;
  userId?: string;
}): Promise<void> {
  const supabase = createServiceClient();

  let query = supabase
    .from("payments")
    .update({
      status: "pending",
      ...(params.paymentId ? { dodo_payment_id: params.paymentId } : {}),
    })
    .eq("dodo_session_id", params.sessionId)
    .eq("status", "created");

  if (params.userId) query = query.eq("user_id", params.userId);

  await query;
}

/**
 * Record a refund and stand the promotion down.
 *
 * A partial refund leaves the payment `paid` with `refunded_amount` set: the
 * customer still bought the slot. Only a full refund flips the payment to
 * `refunded` and ends the promotion, which is the state that frees the product
 * to be promoted again.
 *
 * `refundedAmount` is a cumulative total recomputed from Dodo's own refund list
 * (see `fetchPayment`), not a running sum maintained here. Webhooks are
 * at-least-once, and a stored total that adds each event's amount double-counts
 * the moment one is replayed.
 */
export async function refundPayment(params: {
  paymentId: string;
  refundedAmount: number;
  /** Dodo's own verdict, preferred over comparing amounts when present. */
  fullyRefunded?: boolean;
}): Promise<void> {
  const supabase = createServiceClient();

  const { data: payment } = await supabase
    .from("payments")
    .select("id, promotion_id, amount, charged_amount, refunded_amount")
    .eq("dodo_payment_id", params.paymentId)
    .maybeSingle();

  if (!payment) {
    audit("refund_unknown_payment", { paymentId: params.paymentId });
    return;
  }

  // Compared against what Dodo charged, not against the net price we quoted: a
  // full refund of a taxed purchase returns the tax too, so measuring it against
  // `amount` would read every full refund as an overpayment and every
  // tax-sized partial refund as a full one.
  const charged = Number(payment.charged_amount ?? payment.amount);
  const fullyRefunded = params.fullyRefunded ?? Number(params.refundedAmount) >= charged;

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

  const [{ data: product }, { data: pkg }, { data: payment }] = await Promise.all([
    supabase.from("products").select("name").eq("id", promotion.product_id).maybeSingle(),
    supabase.from("promotion_packages").select("name").eq("id", promotion.package_id).maybeSingle(),
    // The figure actually charged, tax included. Showing the net price on a
    // receipt beside a card statement that reads higher is the single most
    // reliable way to generate a support ticket.
    supabase
      .from("payments")
      .select("charged_amount, charged_currency, charged_tax")
      .eq("promotion_id", promotionId)
      .eq("status", "paid")
      .maybeSingle(),
  ]);

  // `?? null` rather than `|| null`: a zero tax is a real, displayable figure
  // and must not be coerced to "not recorded".
  const asAmount = (value: number | null | undefined): number | null =>
    value === null || value === undefined ? null : Number(value);

  return {
    ok: true,
    summary: {
      reference,
      productName: product?.name ?? "Your product",
      packageName: pkg?.name ?? "Promotion",
      startsAt: promotion.starts_at,
      endsAt: promotion.ends_at,
      amountPaise: Number(promotion.amount_paise),
      chargedAmount: asAmount(payment?.charged_amount),
      chargedCurrency: payment?.charged_currency ?? null,
      chargedTax: asAmount(payment?.charged_tax),
    },
  };
}
