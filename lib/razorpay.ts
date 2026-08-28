import "server-only";

/**
 * Razorpay REST client.
 *
 * Hand-rolled over `fetch` rather than the `razorpay` npm package, matching how
 * this repo already talks to Sendgrove (lib/email.ts), Cloudflare Turnstile
 * (lib/actions/ad-inquiry.ts) and Cloudinary. The surface we need is three
 * endpoints and an HMAC; the SDK would add a dependency tree to a money path in
 * exchange for wrapping calls this file makes in ten lines.
 *
 * `server-only` is load-bearing. Importing this from a client component is a
 * build error, not a runtime surprise -- which is the mechanical guarantee that
 * `RAZORPAY_KEY_SECRET` cannot reach a browser bundle. The signature helpers are
 * re-exported from lib/razorpay-signature.ts, which is deliberately free of that
 * marker so `npm test` can reach it; that module holds no secrets and reads no
 * environment.
 *
 * Live credentials only. There is no test-mode branch, no mock response and no
 * fixture path in this file: whatever `RAZORPAY_KEY_ID` names is what gets
 * charged, and a missing variable fails loudly instead of falling back to
 * something pretend.
 */

import { isRazorpayId } from "@/lib/razorpay-signature";

const RAZORPAY_API = "https://api.razorpay.com/v1";

/** Razorpay's own ceiling on the `receipt` field. */
const RECEIPT_MAX = 40;

/**
 * Anything the API can go wrong with, as one type the callers can branch on
 * without catching. A money path should not use exceptions for expected
 * outcomes -- a thrown error in a Server Action becomes an opaque digest in
 * production and the cause is lost.
 */
export type RazorpayResult<T> = { ok: true; data: T } | { ok: false; error: string };

export type RazorpayOrder = {
  id: string;
  amount: number;
  currency: string;
  receipt: string | null;
  status: string;
};

export type RazorpayPayment = {
  id: string;
  order_id: string | null;
  amount: number;
  currency: string;
  /** created | authorized | captured | refunded | failed */
  status: string;
  method: string | null;
  error_code: string | null;
  error_description: string | null;
  amount_refunded: number;
};

// Credentials
// -----------

/**
 * Reads credentials at call time, never at module scope.
 *
 * A module-level `const KEY = process.env...` is evaluated during the build,
 * where the variable may legitimately be absent, and would bake `undefined` into
 * the bundle for every later request.
 */
function credentials(): { keyId: string; keySecret: string } | null {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  return { keyId, keySecret };
}

/** Whether live Razorpay credentials are configured in this environment. */
export function isRazorpayConfigured(): boolean {
  return credentials() !== null;
}

/**
 * The publishable key id, for handing to Checkout in the browser.
 *
 * Returned through the order-creation response rather than published as a
 * `NEXT_PUBLIC_` variable. Both are safe -- the key id is public by design -- but
 * this way there is exactly one Razorpay variable naming convention in the
 * project (`RAZORPAY_*`, all server-side), and no reviewer has to work out which
 * of the three is the safe one to expose. A page that never creates an order
 * never receives it either.
 */
export function publishableKeyId(): string | null {
  return credentials()?.keyId ?? null;
}

/** The key secret, for `verifyCheckoutSignature`. Never leaves the server. */
export function checkoutSecret(): string | null {
  return credentials()?.keySecret ?? null;
}

/** The webhook secret, a *different* value from the key secret. */
export function webhookSecret(): string | null {
  return process.env.RAZORPAY_WEBHOOK_SECRET ?? null;
}

// Transport
// ---------

/**
 * One authenticated call to Razorpay.
 *
 * Failures are logged with the endpoint and Razorpay's error code only. The
 * response body can echo request fields, and the `Authorization` header is a
 * credential -- neither is ever written to a log line, which on Vercel is
 * retained and searchable.
 */
async function call<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown },
): Promise<RazorpayResult<T>> {
  const creds = credentials();
  if (!creds) {
    console.error(
      JSON.stringify({
        event: "razorpay_not_configured",
        endpoint: path,
        at: new Date().toISOString(),
      }),
    );
    return { ok: false, error: "Payments are not configured." };
  }

  const auth = Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString("base64");

  let response: Response;
  try {
    response = await fetch(`${RAZORPAY_API}${path}`, {
      method: init.method,
      headers: {
        authorization: `Basic ${auth}`,
        "content-type": "application/json",
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      // Never cached: an order response is a one-shot fact and a payment's
      // status is the thing most likely to have just changed.
      cache: "no-store",
    });
  } catch (cause) {
    console.error(
      JSON.stringify({
        event: "razorpay_request_failed",
        endpoint: path,
        reason: cause instanceof Error ? cause.name : "unknown",
        at: new Date().toISOString(),
      }),
    );
    return { ok: false, error: "Could not reach the payment provider." };
  }

  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: { code?: string; description?: string } })
    | null;

  if (!response.ok || payload === null) {
    console.error(
      JSON.stringify({
        event: "razorpay_api_error",
        endpoint: path,
        status: response.status,
        // Razorpay's machine-readable code only, never its description, which
        // can quote back submitted values.
        code: payload?.error?.code ?? null,
        at: new Date().toISOString(),
      }),
    );
    return { ok: false, error: "The payment provider rejected that request." };
  }

  return { ok: true, data: payload };
}

// Endpoints
// ---------

/**
 * Create an order for `amountPaise`.
 *
 * The amount is an argument because the *caller* is the only place allowed to
 * decide it, and the only caller reads it from `promotion_packages`. It is
 * asserted to be a positive integer here anyway: paise are indivisible, and a
 * float that arrived from anywhere would be silently truncated by Razorpay
 * rather than rejected.
 *
 * `notes` carry our own ids into Razorpay's dashboard and back out on every
 * webhook, which is what lets support reconcile a charge to a promotion without
 * a lookup table. They are visible to anyone with dashboard access, so they hold
 * ids and nothing else -- no email, no name.
 */
export async function createOrder(params: {
  amountPaise: number;
  currency: string;
  receipt: string;
  notes: Record<string, string>;
}): Promise<RazorpayResult<RazorpayOrder>> {
  if (!Number.isSafeInteger(params.amountPaise) || params.amountPaise <= 0) {
    return { ok: false, error: "Invalid amount." };
  }

  return call<RazorpayOrder>("/orders", {
    method: "POST",
    body: {
      amount: params.amountPaise,
      currency: params.currency,
      receipt: params.receipt.slice(0, RECEIPT_MAX),
      notes: params.notes,
      // Auto-capture. Without it a payment sits `authorized` and expires
      // uncaptured after five days -- the customer sees a debit, we see no
      // money, and the promotion never activates.
      payment_capture: 1,
    },
  });
}

/**
 * Read a payment back from Razorpay.
 *
 * This is the call that makes verification mean something. A valid signature
 * proves the callback is authentic; only this proves the payment was actually
 * captured, for this order, for the amount we charged. Everything else is the
 * browser's word.
 */
export async function fetchPayment(paymentId: string): Promise<RazorpayResult<RazorpayPayment>> {
  // The id is interpolated into the request path, so it is validated rather
  // than trusted even though every caller has already checked it.
  if (!isRazorpayId(paymentId, "pay")) {
    return { ok: false, error: "Invalid payment reference." };
  }
  return call<RazorpayPayment>(`/payments/${paymentId}`, { method: "GET" });
}

export {
  verifyCheckoutSignature,
  verifyWebhookSignature,
  isRazorpayId,
  isHexSignature,
} from "@/lib/razorpay-signature";
