import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";

// Relative and extensioned, like tests/client-ip.test.ts: `npm test` runs these
// in plain Node, where the `@/` alias and extensionless specifiers do not
// resolve.
import {
  checkoutSignaturePayload,
  hmacSha256Hex,
  isHexSignature,
  isRazorpayId,
  verifyCheckoutSignature,
  verifyWebhookSignature,
} from "../lib/razorpay-signature.ts";

/**
 * These functions decide whether money arrived. Everything downstream — marking
 * a payment paid, activating a promotion — is gated on one of them returning
 * true, so they are the only part of the payment path that is worth testing
 * without a database or a network.
 *
 * Throwaway secrets throughout. Nothing here reads the environment, which is
 * exactly why this module was split out of lib/razorpay.ts.
 */

const KEY_SECRET = "test_key_secret_do_not_use";
const WEBHOOK_SECRET = "test_webhook_secret_do_not_use";

const ORDER = "order_QxyZ0123456789";
const PAYMENT = "pay_QabC9876543210";

function checkoutSignature(orderId: string, paymentId: string, secret: string): string {
  return createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
}

describe("checkout signature", () => {
  it("accepts a signature Razorpay would have produced", () => {
    const signature = checkoutSignature(ORDER, PAYMENT, KEY_SECRET);
    assert.equal(
      verifyCheckoutSignature({ orderId: ORDER, paymentId: PAYMENT, signature }, KEY_SECRET),
      true,
    );
  });

  it("rejects a signature made with a different secret", () => {
    const signature = checkoutSignature(ORDER, PAYMENT, "some_other_secret");
    assert.equal(
      verifyCheckoutSignature({ orderId: ORDER, paymentId: PAYMENT, signature }, KEY_SECRET),
      false,
    );
  });

  /*
   * The ordering of the two ids is the whole security property. A verifier that
   * signed `payment|order` would still round-trip against itself and pass every
   * other test in this file, while rejecting every real Razorpay callback.
   */
  it("signs order_id before payment_id", () => {
    assert.equal(checkoutSignaturePayload(ORDER, PAYMENT), `${ORDER}|${PAYMENT}`);

    const reversed = checkoutSignature(PAYMENT, ORDER, KEY_SECRET);
    assert.equal(
      verifyCheckoutSignature(
        { orderId: ORDER, paymentId: PAYMENT, signature: reversed },
        KEY_SECRET,
      ),
      false,
    );
  });

  it("rejects a signature for a different order or payment", () => {
    const signature = checkoutSignature(ORDER, PAYMENT, KEY_SECRET);

    assert.equal(
      verifyCheckoutSignature(
        { orderId: "order_DIFFERENT01234", paymentId: PAYMENT, signature },
        KEY_SECRET,
      ),
      false,
    );
    assert.equal(
      verifyCheckoutSignature(
        { orderId: ORDER, paymentId: "pay_DIFFERENT01234", signature },
        KEY_SECRET,
      ),
      false,
    );
  });

  it("rejects empty and malformed input instead of throwing", () => {
    const signature = checkoutSignature(ORDER, PAYMENT, KEY_SECRET);

    assert.equal(verifyCheckoutSignature({ orderId: "", paymentId: PAYMENT, signature }, KEY_SECRET), false);
    assert.equal(verifyCheckoutSignature({ orderId: ORDER, paymentId: "", signature }, KEY_SECRET), false);
    assert.equal(
      verifyCheckoutSignature({ orderId: ORDER, paymentId: PAYMENT, signature: "" }, KEY_SECRET),
      false,
    );
    // No secret configured must never verify as true.
    assert.equal(
      verifyCheckoutSignature({ orderId: ORDER, paymentId: PAYMENT, signature }, ""),
      false,
    );
  });

  /*
   * `timingSafeEqual` throws when its two buffers differ in length, and a string
   * of the right length made of non-hex characters decodes to a shorter buffer.
   * Without the guard in `safeEqualHex` this input crashes the verifier — which
   * in a Server Action is a 500, not a rejection.
   */
  it("rejects a same-length non-hex signature without throwing", () => {
    const notHex = "z".repeat(64);
    assert.equal(
      verifyCheckoutSignature({ orderId: ORDER, paymentId: PAYMENT, signature: notHex }, KEY_SECRET),
      false,
    );
  });
});

describe("webhook signature", () => {
  const body = JSON.stringify({
    event: "payment.captured",
    payload: { payment: { entity: { id: PAYMENT, order_id: ORDER, amount: 499900 } } },
  });

  it("accepts a body signed with the webhook secret", () => {
    const signature = hmacSha256Hex(body, WEBHOOK_SECRET);
    assert.equal(verifyWebhookSignature(body, signature, WEBHOOK_SECRET), true);
  });

  /*
   * The two secrets are different values, and swapping them is the single most
   * likely deployment mistake — both are opaque strings in the same dashboard.
   */
  it("rejects a body signed with the key secret instead", () => {
    const signature = hmacSha256Hex(body, KEY_SECRET);
    assert.equal(verifyWebhookSignature(body, signature, WEBHOOK_SECRET), false);
  });

  /*
   * The digest is over raw bytes. Re-serialising the parsed body reorders keys
   * and drops whitespace, which is why the route must hash `request.text()`
   * before it parses anything.
   */
  it("rejects a re-serialised body", () => {
    const signature = hmacSha256Hex(body, WEBHOOK_SECRET);
    const reserialised = JSON.stringify(JSON.parse(body), null, 2);
    assert.notEqual(reserialised, body);
    assert.equal(verifyWebhookSignature(reserialised, signature, WEBHOOK_SECRET), false);
  });

  it("rejects a tampered body", () => {
    const signature = hmacSha256Hex(body, WEBHOOK_SECRET);
    const tampered = body.replace("499900", "100");
    assert.equal(verifyWebhookSignature(tampered, signature, WEBHOOK_SECRET), false);
  });

  it("rejects a missing signature header", () => {
    assert.equal(verifyWebhookSignature(body, null, WEBHOOK_SECRET), false);
    assert.equal(verifyWebhookSignature(body, undefined, WEBHOOK_SECRET), false);
    assert.equal(verifyWebhookSignature(body, "", WEBHOOK_SECRET), false);
  });

  it("rejects everything when no webhook secret is configured", () => {
    const signature = hmacSha256Hex(body, "");
    assert.equal(verifyWebhookSignature(body, signature, ""), false);
  });
});

describe("identifier validation", () => {
  it("accepts real-shaped Razorpay ids", () => {
    assert.equal(isRazorpayId(ORDER, "order"), true);
    assert.equal(isRazorpayId(PAYMENT, "pay"), true);
  });

  it("rejects an id of the wrong kind", () => {
    assert.equal(isRazorpayId(ORDER, "pay"), false);
    assert.equal(isRazorpayId(PAYMENT, "order"), false);
  });

  /*
   * These ids are interpolated into an outbound API path, so anything that
   * could reshape a URL has to be refused before it gets there.
   */
  it("rejects ids carrying path or query characters", () => {
    assert.equal(isRazorpayId("pay_../../orders", "pay"), false);
    assert.equal(isRazorpayId("pay_abc?foo=1", "pay"), false);
    assert.equal(isRazorpayId("pay_abc/refunds", "pay"), false);
    assert.equal(isRazorpayId("pay_" + "a".repeat(200), "pay"), false);
    assert.equal(isRazorpayId(null, "pay"), false);
    assert.equal(isRazorpayId(12345, "pay"), false);
  });

  it("accepts only a 64-character hex digest as a signature", () => {
    assert.equal(isHexSignature("a".repeat(64)), true);
    assert.equal(isHexSignature("A".repeat(64)), true);
    assert.equal(isHexSignature("a".repeat(63)), false);
    assert.equal(isHexSignature("z".repeat(64)), false);
    assert.equal(isHexSignature(null), false);
  });
});
