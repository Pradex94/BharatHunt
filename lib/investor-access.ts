import "server-only";

/**
 * Service-role writes that settle a directory payment and turn it into access.
 *
 * These live outside lib/actions/investors.ts on purpose, and the reason is a
 * security property rather than tidiness: **every export of a `"use server"`
 * module is a public HTTP endpoint.** Next assigns each one an action id and
 * serves it to anyone who posts that id, whether or not a client component ever
 * imports it. A `grantInvestorAccess(userId)` sitting in that file would
 * therefore be an unauthenticated "unlock the directory" endpoint taking the id
 * as its only argument.
 *
 * Here, with no `"use server"` directive, they are ordinary functions:
 * reachable from the Server Action and from the webhook route, reachable from
 * nowhere else. `server-only` makes importing them from a client component a
 * build error.
 *
 * Nothing in this file decides *whether* money arrived. Each function is called
 * by something that has already established that — Dodo's own session status
 * read back over the API, or a signed webhook — and its job is to record the
 * consequence exactly once.
 *
 * The whole file is a deliberate parallel of lib/promotion-activation.ts,
 * against a different table. It is not shared with it: that module's functions
 * are typed to `payments`/`promotions`, and generalising them over two products
 * would mean editing the live promotion money path to add a second one. Two
 * short, obvious files beat one clever file that both products depend on.
 */

import { createServiceClient } from "@/lib/supabase/service";
import {
  INVESTOR_VERIFICATION_ERROR_MESSAGE,
  type InvestorPurchaseSummary,
} from "@/lib/investors";

/**
 * Structured audit line for the directory payment path.
 *
 * Ids, codes and booleans only. No email, no name, no Dodo key, no request body
 * — Vercel retains these logs and makes them searchable, so a field added here
 * is a field kept indefinitely.
 */
export function audit(event: string, fields: Record<string, string | number | boolean | null>) {
  console.log(JSON.stringify({ event, ...fields, at: new Date().toISOString() }));
}

/**
 * The outcome of a settlement attempt.
 *
 * `ok` and "this call was the one that wrote the row" are deliberately separate
 * fields. Both `true` and `false` for `firstWrite` are success — the other path
 * having already settled it is the normal result of a race, not a failure — but
 * a caller must never treat a *refused* settlement as one. Collapsing the two
 * into a single boolean is how a mismatched charge ends up rendering a success
 * screen over an account that has not paid.
 */
export type InvestorSettlementResult =
  | { ok: true; firstWrite: boolean; purchaseId: string; userId: string }
  | {
      ok: false;
      reason: "unknown_session" | "user_mismatch" | "currency_mismatch" | "amount_short";
      purchaseId: string | null;
    };

/**
 * Mark a directory purchase paid from a trusted settlement signal.
 *
 * `status = 'paid'` *is* the access grant — there is no second table and no
 * second write that could fail after this one. That is the whole reason the
 * entitlement was not modelled separately: this function either grants access
 * or it does not, and there is no intermediate state where money is recorded
 * but the customer cannot see what they bought.
 *
 * What is checked, and why it is not an amount equality
 * ----------------------------------------------------
 * Dodo Payments is a Merchant of Record: it charges the catalogue price for the
 * product the session named, then adds the sales tax it is legally the seller
 * for. `total_amount` is therefore *expected* to exceed the net figure we
 * quoted, by an amount that varies with the customer's country. An equality
 * check would reject every taxed purchase.
 *
 * So the binding is identity, which is the stronger property anyway:
 *
 *   1. the payment names the checkout session we opened for a purchase;
 *   2. the user id we put in that session's metadata came back unchanged;
 *   3. the charge is in the currency we quoted in;
 *   4. it is not *less* than the net price we quoted.
 *
 * (1) and (2) are what make this payment ours and this customer's. (4) still
 * catches a cheaper charge being pointed at the directory, without rejecting the
 * tax on top. None of the four is influenceable by the customer: the price lives
 * in Dodo's catalogue, and the metadata was written server-side when the session
 * was created.
 */
export async function settleInvestorPurchase(params: {
  sessionId: string;
  paymentId: string;
  /** `total_amount` from Dodo: the net price plus whatever tax it collected. */
  chargedAmount: number;
  currency: string;
  /** Tax component of `chargedAmount`, when Dodo reports one. */
  tax?: number | null;
  /** `metadata.user_id`, echoed back by Dodo. Checked, never trusted. */
  metadataUserId?: string | null;
}): Promise<InvestorSettlementResult> {
  const supabase = createServiceClient();

  const { data: purchase } = await supabase
    .from("investor_directory_purchases")
    .select("id, user_id, amount, currency, status")
    .eq("dodo_session_id", params.sessionId)
    .maybeSingle();

  // Check (1). A session we never opened is not a purchase of ours. This is
  // also what keeps the two products apart: a promotion's session id is not in
  // this table, so a promotion payment routed here settles nothing.
  if (!purchase) {
    audit("investor_payment_unknown_session", {
      sessionId: params.sessionId,
      paymentId: params.paymentId,
    });
    return { ok: false, reason: "unknown_session", purchaseId: null };
  }

  // Check (2). Absent metadata is tolerated — Dodo omits the field rather than
  // sending an empty object on some event shapes — but a *contradicting* value
  // is not. Settling on it would unlock one account from another's payment.
  if (params.metadataUserId && params.metadataUserId !== purchase.user_id) {
    audit("investor_payment_user_mismatch", {
      sessionId: params.sessionId,
      paymentId: params.paymentId,
      purchaseId: purchase.id,
    });
    return { ok: false, reason: "user_mismatch", purchaseId: purchase.id };
  }

  // Check (3). Currency selection is disabled on the session, so a different
  // currency here means the charge did not come from the session we built.
  if (purchase.currency !== params.currency) {
    audit("investor_payment_currency_mismatch", {
      sessionId: params.sessionId,
      paymentId: params.paymentId,
      expected: purchase.currency,
      received: params.currency,
    });
    return { ok: false, reason: "currency_mismatch", purchaseId: purchase.id };
  }

  // Check (4). Tax only ever adds.
  if (Number(params.chargedAmount) < Number(purchase.amount)) {
    audit("investor_payment_amount_short", {
      sessionId: params.sessionId,
      paymentId: params.paymentId,
      quoted: Number(purchase.amount),
      charged: Number(params.chargedAmount),
    });
    return { ok: false, reason: "amount_short", purchaseId: purchase.id };
  }

  // Already settled by the other path — the browser's confirm call and the
  // webhook race routinely. Idempotent success, not an error.
  if (purchase.status === "paid") {
    return { ok: true, firstWrite: false, purchaseId: purchase.id, userId: purchase.user_id };
  }

  const { data: updated } = await supabase
    .from("investor_directory_purchases")
    .update({
      status: "paid",
      dodo_payment_id: params.paymentId,
      charged_amount: params.chargedAmount,
      charged_currency: params.currency,
      charged_tax: params.tax ?? null,
      paid_at: new Date().toISOString(),
      // A payment that succeeds on retry clears the earlier failure.
      error_code: null,
      error_description: null,
    })
    .eq("id", purchase.id)
    // Conditioned on the row still being open, so the second caller of a race
    // matches no rows and changes nothing — including `paid_at`, which must
    // record when the money actually cleared, not when the loser of the race
    // got round to writing.
    .in("status", ["created", "pending", "failed"])
    .select("id");

  const firstWrite = (updated?.length ?? 0) > 0;

  audit("investor_purchase_settled", {
    purchaseId: purchase.id,
    paymentId: params.paymentId,
    firstWrite,
  });

  return { ok: true, firstWrite, purchaseId: purchase.id, userId: purchase.user_id };
}

/**
 * Record a failed attempt. Never touches a purchase that has already been paid
 * — a late `payment.failed` for a retried session must not revoke the retry
 * that worked.
 */
export async function failInvestorPurchase(params: {
  sessionId: string;
  code?: string | null;
  description?: string | null;
  userId?: string;
}): Promise<void> {
  const supabase = createServiceClient();

  let query = supabase
    .from("investor_directory_purchases")
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
  audit("investor_payment_failed_recorded", {
    sessionId: params.sessionId,
    code: params.code ?? null,
  });
}

/**
 * Mark a directory payment as still in flight.
 *
 * Dodo's hosted checkout can leave a payment `processing` or
 * `requires_customer_action` — a UPI mandate awaiting approval, a 3DS step the
 * customer has not finished — for minutes. That is neither paid nor failed, and
 * recording it as either would be a lie the customer reads on their own receipt
 * list. Only ever moves a still-open row, so it cannot walk back a settlement
 * that landed while the customer was looking at the pending screen.
 */
export async function markInvestorPurchasePending(params: {
  sessionId: string;
  paymentId?: string | null;
  userId?: string;
}): Promise<void> {
  const supabase = createServiceClient();

  let query = supabase
    .from("investor_directory_purchases")
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
 * Record a refund and, on a full one, take the access away.
 *
 * A partial refund leaves the purchase `paid` with `refunded_amount` set: the
 * customer still bought the directory. Only a full refund flips it to
 * `refunded`, and because `status = 'paid'` *is* the entitlement, that one
 * update is what revokes access — on the very next request, with nothing to
 * expire and no second table to keep in step.
 *
 * `refundedAmount` is a cumulative total recomputed from Dodo's own refund list
 * (see `fetchPayment`), not a running sum maintained here. Webhooks are
 * at-least-once, and a stored total that adds each event's amount double-counts
 * the moment one is replayed.
 */
export async function refundInvestorPurchase(params: {
  paymentId: string;
  refundedAmount: number;
  /** Dodo's own verdict, preferred over comparing amounts when present. */
  fullyRefunded?: boolean;
}): Promise<void> {
  const supabase = createServiceClient();

  const { data: purchase } = await supabase
    .from("investor_directory_purchases")
    .select("id, user_id, amount, charged_amount")
    .eq("dodo_payment_id", params.paymentId)
    .maybeSingle();

  if (!purchase) {
    audit("investor_refund_unknown_payment", { paymentId: params.paymentId });
    return;
  }

  // Compared against what Dodo charged, not against the net price we quoted: a
  // full refund of a taxed purchase returns the tax too, so measuring it against
  // `amount` would read every full refund as an overpayment and every tax-sized
  // partial refund as a full one.
  const charged = Number(purchase.charged_amount ?? purchase.amount);
  const fullyRefunded = params.fullyRefunded ?? Number(params.refundedAmount) >= charged;

  await supabase
    .from("investor_directory_purchases")
    .update({
      refunded_amount: params.refundedAmount,
      ...(fullyRefunded ? { status: "refunded" } : {}),
    })
    .eq("id", purchase.id);

  audit("investor_refund_recorded", {
    purchaseId: purchase.id,
    paymentId: params.paymentId,
    fullyRefunded,
  });
}

/**
 * The success payload, read back from the database rather than assembled from
 * whatever the browser sent. What the customer is shown is what was stored.
 */
export async function investorPurchaseSummary(
  purchaseId: string,
  reference: string,
): Promise<
  { ok: true; summary: InvestorPurchaseSummary } | { ok: false; error: string }
> {
  const supabase = createServiceClient();

  const { data: purchase } = await supabase
    .from("investor_directory_purchases")
    .select("id, plan_id, amount, charged_amount, charged_currency, charged_tax")
    .eq("id", purchaseId)
    .maybeSingle();

  if (!purchase) return { ok: false, error: INVESTOR_VERIFICATION_ERROR_MESSAGE };

  const { data: plan } = await supabase
    .from("investor_directory_plans")
    .select("name")
    .eq("id", purchase.plan_id)
    .maybeSingle();

  // `?? null` rather than `|| null`: a zero tax is a real, displayable figure
  // and must not be coerced to "not recorded".
  const asAmount = (value: number | null | undefined): number | null =>
    value === null || value === undefined ? null : Number(value);

  return {
    ok: true,
    summary: {
      reference,
      planName: plan?.name ?? "Investor Directory",
      amountPaise: Number(purchase.amount),
      chargedAmount: asAmount(purchase.charged_amount),
      chargedCurrency: purchase.charged_currency,
      chargedTax: asAmount(purchase.charged_tax),
    },
  };
}
