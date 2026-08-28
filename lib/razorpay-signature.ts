/**
 * Razorpay HMAC-SHA256 signature verification.
 *
 * Split out of lib/razorpay.ts so it carries no `server-only` marker and no
 * network client: this is the function that decides whether money was actually
 * taken, so it has to be reachable by `npm test` in plain Node rather than only
 * through a request context. Same reasoning as lib/rate-limit-ip.ts.
 *
 * Nothing here reads `process.env`. Secrets arrive as arguments, which is what
 * lets the tests exercise the real comparison with a throwaway key instead of
 * asserting around it.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Constant-time compare of two hex digests.
 *
 * `a === b` on a signature is a timing oracle: string comparison returns at the
 * first differing byte, so an attacker who can submit many candidates learns the
 * digest one character at a time. `timingSafeEqual` always reads both buffers to
 * the end.
 *
 * It throws on a length mismatch, so the lengths are checked first -- and that
 * check is safe to short-circuit, because the length of a SHA-256 digest is
 * fixed and public.
 */
function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;

  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");

  // A non-hex character decodes to a shorter buffer than the string implies, so
  // an equal-length pair of strings can still yield unequal buffers. Without
  // this, `timingSafeEqual` would throw on malformed input rather than
  // returning false.
  if (left.length !== right.length || left.length === 0) return false;

  return timingSafeEqual(left, right);
}

/** Lowercase hex HMAC-SHA256 of `payload` under `secret`. */
export function hmacSha256Hex(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

/**
 * The string Razorpay signs when Checkout hands a payment back to the browser:
 * `order_id | payment_id`, in that order, joined by a literal pipe.
 *
 * Exported because the ordering is the entire security property and a test that
 * only ever calls `verifyCheckoutSignature` cannot tell a reversed pair from a
 * correct one.
 */
export function checkoutSignaturePayload(orderId: string, paymentId: string): string {
  return `${orderId}|${paymentId}`;
}

/**
 * True when Checkout's callback really came from Razorpay for this order.
 *
 * Signed with the **key secret**, not the webhook secret -- the two are
 * different values and swapping them fails every verification.
 *
 * This proves the payload is authentic. It does not prove the payment was
 * captured, nor that its amount matches what we charged: a signature is only
 * ever a statement about the three ids inside it. The caller re-reads the
 * payment from Razorpay's API for that, and lib/actions/promotions.ts does.
 */
export function verifyCheckoutSignature(
  params: { orderId: string; paymentId: string; signature: string },
  keySecret: string,
): boolean {
  if (!keySecret || !params.orderId || !params.paymentId || !params.signature) return false;

  const expected = hmacSha256Hex(
    checkoutSignaturePayload(params.orderId, params.paymentId),
    keySecret,
  );
  return safeEqualHex(expected, params.signature);
}

/**
 * True when a webhook body really came from Razorpay.
 *
 * Signed with the **webhook secret** over the exact bytes of the request body.
 * The caller must pass the raw text: `JSON.parse` followed by `JSON.stringify`
 * re-orders keys and drops insignificant whitespace, which changes the digest
 * and rejects every legitimate delivery.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null | undefined,
  webhookSecret: string,
): boolean {
  if (!webhookSecret || !signature || !rawBody) return false;
  return safeEqualHex(hmacSha256Hex(rawBody, webhookSecret), signature);
}

/**
 * Razorpay identifiers as they appear on the wire: `order_ABC123`, `pay_XYZ789`.
 *
 * Checked before anything is done with a caller-supplied id -- these values are
 * interpolated into an outbound API path, so constraining the character set here
 * is what stops a crafted id from reshaping that URL.
 */
const RAZORPAY_ID_RE = /^[A-Za-z0-9_]{5,64}$/;

export function isRazorpayId(value: unknown, prefix: "order" | "pay"): value is string {
  return (
    typeof value === "string" && value.startsWith(`${prefix}_`) && RAZORPAY_ID_RE.test(value)
  );
}

/** A SHA-256 hex digest, which is what every signature above must be. */
export function isHexSignature(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}
