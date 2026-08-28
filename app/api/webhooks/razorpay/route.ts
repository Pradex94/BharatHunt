import type { NextRequest } from "next/server";

import { createServiceClient } from "@/lib/supabase/service";
import { verifyWebhookSignature, webhookSecret } from "@/lib/razorpay";
import { audit, failPayment, refundPayment, settlePayment } from "@/lib/promotion-activation";

/**
 * Razorpay webhook — the authoritative settlement path.
 *
 * The browser's verify call (lib/actions/promotions.ts) is the fast path that
 * lets a customer see a success screen immediately. This is the one that is
 * still correct when the customer closes the tab mid-payment, loses signal on
 * the callback, or pays through a UPI mandate that settles minutes later. Both
 * write the same rows through the same functions, and both are idempotent, so
 * whichever arrives first wins and the other becomes a no-op.
 *
 * Three properties, in order of importance
 * ----------------------------------------
 * 1. **Authenticated.** The body is HMAC-SHA256 signed with
 *    `RAZORPAY_WEBHOOK_SECRET` -- a different value from the key secret. This
 *    endpoint is public and unauthenticated in every other sense, so without the
 *    signature check anyone could post a `payment.captured` and be handed a free
 *    promotion. Nothing is parsed as meaningful until the signature verifies.
 *
 * 2. **Idempotent.** Razorpay delivers at least once and retries every non-2xx
 *    for 24 hours, so duplicates are routine. `razorpay_webhook_events` is a
 *    ledger keyed on Razorpay's own `x-razorpay-event-id`; the insert happens
 *    before any handler runs, and a unique violation short-circuits to 200. The
 *    settlement functions are independently idempotent too, so even an event
 *    with no id cannot double-activate.
 *
 * 3. **Quiet on failure.** Any outcome that is not "please retry" returns 200.
 *    A 500 for an event we will never be able to process just buys 24 hours of
 *    retries and a noisy dashboard.
 *
 * The raw body is read with `request.text()` and hashed before anything parses
 * it. `JSON.parse` followed by `JSON.stringify` re-orders keys and drops
 * whitespace, which changes the digest and would reject every genuine delivery.
 */

/** Razorpay's payment entity, narrowed to the fields this handler reads. */
type PaymentEntity = {
  id?: string;
  order_id?: string;
  amount?: number;
  currency?: string;
  status?: string;
  error_code?: string | null;
  error_description?: string | null;
  amount_refunded?: number;
};

type RefundEntity = {
  id?: string;
  payment_id?: string;
  amount?: number;
};

type WebhookBody = {
  event?: string;
  payload?: {
    payment?: { entity?: PaymentEntity };
    refund?: { entity?: RefundEntity };
    order?: { entity?: { id?: string } };
  };
};

/** 200 with a short body. Razorpay only reads the status code. */
function ok(handled: string) {
  return new Response(JSON.stringify({ status: handled }), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export async function POST(request: NextRequest) {
  const secret = webhookSecret();
  if (!secret) {
    audit("razorpay_webhook_unconfigured", { reason: "missing_secret" });
    // 500 so Razorpay retries: this is a misconfiguration on our side that an
    // operator can fix inside the retry window, not a bad event.
    return new Response("Webhook not configured", { status: 500 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature");

  if (!verifyWebhookSignature(rawBody, signature, secret)) {
    // No detail in the response and no body in the log: an attacker probing
    // this endpoint learns only that it rejected them.
    audit("razorpay_webhook_signature_rejected", {
      hasSignature: Boolean(signature),
      bytes: rawBody.length,
    });
    return new Response("Invalid signature", { status: 400 });
  }

  let body: WebhookBody;
  try {
    body = JSON.parse(rawBody) as WebhookBody;
  } catch {
    // Signed by us but unparseable. Retrying will not help.
    audit("razorpay_webhook_unparseable", { bytes: rawBody.length });
    return ok("ignored");
  }

  const event = body.event ?? "unknown";
  const payment = body.payload?.payment?.entity;
  const refund = body.payload?.refund?.entity;

  // The idempotency gate, before any handler.
  const eventId = request.headers.get("x-razorpay-event-id");
  if (eventId) {
    const supabase = createServiceClient();
    const { error } = await supabase.from("razorpay_webhook_events").insert({
      id: eventId,
      event,
      payment_id: payment?.id ?? refund?.payment_id ?? null,
      order_id: payment?.order_id ?? body.payload?.order?.entity?.id ?? null,
    });

    // 23505 unique_violation: seen before. Everything downstream is idempotent
    // anyway, but stopping here means a retry storm costs one insert attempt
    // rather than a full settlement pass.
    if (error?.code === "23505") {
      audit("razorpay_webhook_replay", { eventId, event });
      return ok("duplicate");
    }
    if (error) {
      // The ledger is unavailable. Continue rather than fail: the handlers below
      // are individually idempotent, so processing without the ledger is safe --
      // it is the cheap short-circuit that is lost, not the guarantee.
      audit("razorpay_webhook_ledger_failed", { eventId, code: error.code ?? null });
    }
  }

  audit("razorpay_webhook_received", {
    event,
    eventId,
    paymentId: payment?.id ?? refund?.payment_id ?? null,
  });

  switch (event) {
    // The money-arrived events. `authorized` is included because auto-capture
    // can lag it by moments and a customer should not wait; `settlePayment`
    // re-checks the amount against our row either way.
    case "payment.captured":
    case "payment.authorized": {
      if (!payment?.id || !payment.order_id || typeof payment.amount !== "number") {
        return ok("ignored");
      }
      await settlePayment({
        orderId: payment.order_id,
        paymentId: payment.id,
        amount: payment.amount,
        currency: payment.currency ?? "INR",
      });
      return ok("settled");
    }

    case "payment.failed": {
      if (!payment?.order_id) return ok("ignored");
      // No `userId`: the webhook has no session. `failPayment` only ever writes
      // over a still-open payment, so it cannot undo a successful retry.
      await failPayment({
        orderId: payment.order_id,
        code: payment.error_code ?? null,
        description: payment.error_description ?? null,
      });
      return ok("failed");
    }

    case "refund.created":
    case "refund.processed": {
      const paymentId = refund?.payment_id ?? payment?.id;
      if (!paymentId) return ok("ignored");
      // Razorpay reports the cumulative refunded total on the payment entity;
      // the refund entity carries only this refund's amount. Prefer the total so
      // successive partial refunds add up correctly.
      const refunded =
        typeof payment?.amount_refunded === "number"
          ? payment.amount_refunded
          : (refund?.amount ?? 0);
      await refundPayment({ paymentId, refundedAmount: refunded });
      return ok("refunded");
    }

    default:
      // Subscribed to more events than we handle, or Razorpay added one. Not an
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
