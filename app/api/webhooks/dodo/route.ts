import type { NextRequest } from "next/server";

import { createServiceClient } from "@/lib/supabase/service";
import { fetchPayment, verifyWebhookSignature, webhookSecret } from "@/lib/dodo";
import {
  audit,
  failPayment,
  markPaymentPending,
  refundPayment,
  settlePayment,
} from "@/lib/promotion-activation";

/**
 * Dodo Payments webhook — the authoritative settlement path.
 *
 * The browser's confirm call (lib/actions/promotions.ts) is the fast path that
 * lets a customer see a success screen as soon as they land back on the site.
 * This is the one that is still correct when they close the tab on Dodo's
 * checkout, lose signal on the redirect, or pay through a mandate that settles
 * minutes later. Both write the same rows through the same functions, and both
 * are idempotent, so whichever arrives first wins and the other becomes a no-op.
 *
 * Three properties, in order of importance
 * ----------------------------------------
 * 1. **Authenticated.** The body is signed to the Standard Webhooks spec with
 *    `DODO_PAYMENTS_WEBHOOK_KEY` -- a different value from the API key. This
 *    endpoint is public and unauthenticated in every other sense, so without the
 *    signature check anyone could post a `payment.succeeded` and be handed a
 *    free promotion. Nothing is parsed as meaningful until the signature
 *    verifies, and the signed content includes the delivery's timestamp, so a
 *    body captured off the wire stops verifying after five minutes.
 *
 * 2. **Idempotent.** Dodo delivers at least once and retries every non-2xx, so
 *    duplicates are routine. `dodo_webhook_events` is a ledger keyed on Dodo's
 *    own `webhook-id`; the insert happens before any handler runs, and a unique
 *    violation short-circuits to 200. The settlement functions are independently
 *    idempotent too, so even an event with no id cannot double-activate.
 *
 * 3. **Quiet on failure.** Any outcome that is not "please retry" returns 200. A
 *    500 for an event we will never be able to process just buys a day of
 *    retries and a noisy dashboard.
 *
 * The raw body is read with `request.text()` and hashed before anything parses
 * it. `JSON.parse` followed by `JSON.stringify` re-orders keys and drops
 * whitespace, which changes the digest and would reject every genuine delivery.
 */

/** Dodo's payment entity, narrowed to the fields this handler reads. */
type PaymentEntity = {
  payment_id?: string;
  checkout_session_id?: string | null;
  total_amount?: number;
  currency?: string;
  tax?: number | null;
  status?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  metadata?: Record<string, string | number | boolean> | null;
};

/** Dodo's refund entity. Carries this refund only, never a running total. */
type RefundEntity = {
  refund_id?: string;
  payment_id?: string;
  amount?: number | null;
  is_partial?: boolean;
};

/**
 * One event, as it arrives.
 *
 * Deliberately structural rather than the SDK's `UnwrapWebhookEvent` union.
 * Narrowing that union requires the payload to already match one of its members,
 * which is exactly the assumption a webhook handler must not make: this endpoint
 * has to survive an event type Dodo added yesterday without throwing. The fields
 * actually read are all optional here and all checked before use.
 */
type WebhookBody = {
  type?: string;
  data?: PaymentEntity & RefundEntity & { payload_type?: string };
};

/** 200 with a short body. Dodo only reads the status code. */
function ok(handled: string) {
  return new Response(JSON.stringify({ status: handled }), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export async function POST(request: NextRequest) {
  const secret = webhookSecret();
  if (!secret) {
    audit("dodo_webhook_unconfigured", { reason: "missing_secret" });
    // 500 so Dodo retries: this is a misconfiguration on our side that an
    // operator can fix inside the retry window, not a bad event.
    return new Response("Webhook not configured", { status: 500 });
  }

  const rawBody = await request.text();
  const webhookId = request.headers.get("webhook-id");
  const timestamp = request.headers.get("webhook-timestamp");
  const signature = request.headers.get("webhook-signature");

  if (!verifyWebhookSignature({ rawBody, webhookId, timestamp, signature }, secret)) {
    // No detail in the response and no body in the log: an attacker probing this
    // endpoint learns only that it rejected them.
    audit("dodo_webhook_signature_rejected", {
      hasSignature: Boolean(signature),
      hasId: Boolean(webhookId),
      bytes: rawBody.length,
    });
    return new Response("Invalid signature", { status: 400 });
  }

  let body: WebhookBody;
  try {
    body = JSON.parse(rawBody) as WebhookBody;
  } catch {
    // Signed by us but unparseable. Retrying will not help.
    audit("dodo_webhook_unparseable", { bytes: rawBody.length });
    return ok("ignored");
  }

  const event = body.type ?? "unknown";
  const entity = body.data ?? {};

  // The idempotency gate, before any handler. `webhook-id` is required by the
  // spec and the signature check above already refused a delivery without one,
  // so this is always present -- but it is read defensively because the ledger
  // is the difference between a retry storm costing one insert and costing a
  // full settlement pass.
  if (webhookId) {
    const supabase = createServiceClient();
    const { error } = await supabase.from("dodo_webhook_events").insert({
      id: webhookId,
      event,
      payment_id: entity.payment_id ?? null,
      session_id: entity.checkout_session_id ?? null,
    });

    // 23505 unique_violation: seen before. Everything downstream is idempotent
    // anyway, but stopping here means a retry storm costs one insert attempt
    // rather than a full settlement pass.
    if (error?.code === "23505") {
      audit("dodo_webhook_replay", { webhookId, event });
      return ok("duplicate");
    }
    if (error) {
      // The ledger is unavailable. Continue rather than fail: the handlers below
      // are individually idempotent, so processing without the ledger is safe --
      // it is the cheap short-circuit that is lost, not the guarantee.
      audit("dodo_webhook_ledger_failed", { webhookId, code: error.code ?? null });
    }
  }

  audit("dodo_webhook_received", {
    event,
    webhookId,
    paymentId: entity.payment_id ?? null,
  });

  switch (event) {
    case "payment.succeeded": {
      // `checkout_session_id` is the join back to our own row, so an event
      // without one cannot be settled. That is not an error to retry: a payment
      // created outside our checkout (a dashboard charge, a payment link) is
      // simply not a promotion purchase.
      if (
        !entity.payment_id ||
        !entity.checkout_session_id ||
        typeof entity.total_amount !== "number"
      ) {
        return ok("ignored");
      }

      await settlePayment({
        sessionId: entity.checkout_session_id,
        paymentId: entity.payment_id,
        chargedAmount: entity.total_amount,
        currency: entity.currency ?? "INR",
        tax: entity.tax ?? null,
        metadataPromotionId:
          typeof entity.metadata?.promotion_id === "string"
            ? entity.metadata.promotion_id
            : null,
      });
      return ok("settled");
    }

    case "payment.failed":
    case "payment.cancelled": {
      if (!entity.checkout_session_id) return ok("ignored");
      // No `userId`: the webhook has no session. `failPayment` only ever writes
      // over a still-open payment, so it cannot undo a successful retry.
      await failPayment({
        sessionId: entity.checkout_session_id,
        code: entity.error_code ?? event,
        description: entity.error_message ?? null,
      });
      return ok("failed");
    }

    case "payment.processing": {
      if (!entity.checkout_session_id) return ok("ignored");
      // Neither paid nor dead. Recorded so the customer's own history says
      // "in progress" rather than nothing at all while a mandate clears.
      await markPaymentPending({
        sessionId: entity.checkout_session_id,
        paymentId: entity.payment_id ?? null,
      });
      return ok("pending");
    }

    case "refund.succeeded": {
      const paymentId = entity.payment_id;
      if (!paymentId) return ok("ignored");

      // The event carries this refund's amount; successive partial refunds have
      // to add up. Rather than maintain a running total -- which double-counts
      // the first time a delivery is replayed without the ledger catching it --
      // the payment is re-read and its refunds summed. Same answer however many
      // times this runs.
      const remote = await fetchPayment(paymentId);
      if (!remote.ok) {
        // Dodo is unreachable or refused. A 500 puts the event back in the retry
        // queue, which is right: a refund we failed to record leaves a promotion
        // running that should have stopped.
        audit("refund_lookup_failed", { paymentId });
        return new Response("Could not read the payment", { status: 500 });
      }

      await refundPayment({
        paymentId,
        refundedAmount: remote.data.refundedAmount,
        fullyRefunded:
          remote.data.refundStatus === "full" ||
          // `is_partial === false` on the event is Dodo's own statement that
          // this refund covered the payment. Trusted only in the affirmative
          // direction: `true` says nothing about what earlier refunds did.
          entity.is_partial === false,
      });
      return ok("refunded");
    }

    default:
      // Subscribed to more events than we handle, or Dodo added one. Not an
      // error -- acknowledging keeps it out of the retry queue.
      return ok("ignored");
  }
}

/**
 * Anything other than POST. Returning 405 explicitly keeps a stray GET (a
 * browser, a scanner, an uptime check) from being answered by the framework's
 * default in a way that suggests this endpoint does something on GET.
 */
export async function GET() {
  return new Response("Method Not Allowed", { status: 405, headers: { allow: "POST" } });
}
