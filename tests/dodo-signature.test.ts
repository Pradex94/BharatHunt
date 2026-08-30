import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";

// Relative and extensioned, like tests/client-ip.test.ts: `npm test` runs these
// in plain Node, where the `@/` alias and extensionless specifiers do not
// resolve.
import {
  isDodoId,
  isFreshTimestamp,
  signedContent,
  signWebhook,
  TIMESTAMP_TOLERANCE_SECONDS,
  verifyWebhookSignature,
} from "../lib/dodo-signature.ts";

/**
 * This function decides whether money arrived. Everything downstream — marking a
 * payment paid, activating a promotion, standing one down on a refund — is gated
 * on it returning true, so it is the only part of the payment path worth testing
 * without a database or a network.
 *
 * Throwaway secrets throughout. Nothing here reads the environment, which is
 * exactly why this module was split out of lib/dodo.ts.
 */

/** A `whsec_`-prefixed secret, base64 like a real one. */
const SECRET = `whsec_${Buffer.from("bharat-hunt-test-webhook-key-0001").toString("base64")}`;

const ID = "evt_test_0000000000000001";
const TS = "1767225600";
const BODY = JSON.stringify({ type: "payment.succeeded", data: { payment_id: "pay_test_1" } });

/** `TS`, so every test runs against a fixed clock rather than the wall clock. */
const NOW = Number(TS);

/**
 * The wire format, pinned.
 *
 * Produced by the real `standardwebhooks` package — the one the `dodopayments`
 * SDK verifies with — for exactly the inputs above. Its whole job is to fail if
 * lib/dodo-signature.ts ever drifts from what Dodo actually sends.
 *
 * A round-trip test cannot catch that drift: an implementation that signed
 * `{timestamp}.{id}.{body}`, or used the secret as raw UTF-8 instead of
 * base64-decoding it, would verify its own signatures perfectly and reject every
 * real delivery. Only a constant from outside this file can tell the difference.
 */
const GOLDEN_SIGNATURE = "aRf5uiatgnVvsiNUn7RK6ymAVBLagVv720z+maSDKOU=";

/** The signing key the way the spec defines it: strip `whsec_`, base64-decode. */
function signingKey(secret: string): Buffer {
  return Buffer.from(secret.replace(/^whsec_/, ""), "base64");
}

function sign(id: string, timestamp: string, body: string, secret = SECRET): string {
  return createHmac("sha256", signingKey(secret))
    .update(`${id}.${timestamp}.${body}`, "utf8")
    .digest("base64");
}

describe("webhook signature", () => {
  it("matches the signature the Standard Webhooks reference produces", () => {
    assert.equal(signWebhook({ webhookId: ID, timestamp: TS, rawBody: BODY }, SECRET), GOLDEN_SIGNATURE);
  });

  it("accepts a delivery Dodo would have sent", () => {
    assert.equal(
      verifyWebhookSignature(
        { rawBody: BODY, webhookId: ID, timestamp: TS, signature: `v1,${GOLDEN_SIGNATURE}` },
        SECRET,
        NOW,
      ),
      true,
    );
  });

  /*
   * The order of the three parts is the entire security property. A verifier
   * that assembled `{timestamp}.{id}.{body}` would round-trip against itself and
   * pass every other test in this file while rejecting every real delivery.
   */
  it("signs id, then timestamp, then body, joined by dots", () => {
    assert.equal(signedContent(ID, TS, BODY), `${ID}.${TS}.${BODY}`);
  });

  it("base64-decodes the secret rather than using its bytes", () => {
    // The same secret without the decode step produces a different digest. If
    // this ever passes, the implementation has stopped decoding.
    const undecoded = createHmac("sha256", SECRET)
      .update(`${ID}.${TS}.${BODY}`, "utf8")
      .digest("base64");
    assert.notEqual(undecoded, GOLDEN_SIGNATURE);
  });

  it("tolerates a secret that arrives without the whsec_ prefix", () => {
    const bare = SECRET.replace(/^whsec_/, "");
    assert.equal(signWebhook({ webhookId: ID, timestamp: TS, rawBody: BODY }, bare), GOLDEN_SIGNATURE);
  });

  it("rejects a signature made with a different secret", () => {
    const forged = sign(ID, TS, BODY, `whsec_${Buffer.from("some-other-key").toString("base64")}`);
    assert.equal(
      verifyWebhookSignature(
        { rawBody: BODY, webhookId: ID, timestamp: TS, signature: `v1,${forged}` },
        SECRET,
        NOW,
      ),
      false,
    );
  });

  it("rejects a body that was altered after signing", () => {
    const tampered = JSON.stringify({
      type: "payment.succeeded",
      data: { payment_id: "pay_attacker" },
    });
    assert.equal(
      verifyWebhookSignature(
        { rawBody: tampered, webhookId: ID, timestamp: TS, signature: `v1,${GOLDEN_SIGNATURE}` },
        SECRET,
        NOW,
      ),
      false,
    );
  });

  /*
   * The id and the timestamp are inside the signed content, so replaying a real
   * body under a fresh id (to slip past the event ledger) or a fresh timestamp
   * (to slip past the freshness window) invalidates the signature.
   */
  it("rejects a genuine body replayed under a different webhook id", () => {
    assert.equal(
      verifyWebhookSignature(
        {
          rawBody: BODY,
          webhookId: "evt_test_0000000000000002",
          timestamp: TS,
          signature: `v1,${GOLDEN_SIGNATURE}`,
        },
        SECRET,
        NOW,
      ),
      false,
    );
  });

  it("rejects a genuine body replayed under a different timestamp", () => {
    const later = String(NOW + 60);
    assert.equal(
      verifyWebhookSignature(
        { rawBody: BODY, webhookId: ID, timestamp: later, signature: `v1,${GOLDEN_SIGNATURE}` },
        SECRET,
        NOW + 60,
      ),
      false,
    );
  });

  it("accepts any v1 entry when several are present, as during a key rotation", () => {
    const stale = sign(ID, TS, BODY, `whsec_${Buffer.from("retired-key").toString("base64")}`);
    assert.equal(
      verifyWebhookSignature(
        {
          rawBody: BODY,
          webhookId: ID,
          timestamp: TS,
          signature: `v1,${stale} v1,${GOLDEN_SIGNATURE}`,
        },
        SECRET,
        NOW,
      ),
      true,
    );
  });

  it("skips entries at an unknown version rather than failing the header", () => {
    assert.equal(
      verifyWebhookSignature(
        {
          rawBody: BODY,
          webhookId: ID,
          timestamp: TS,
          signature: `v2,ignore-me v1,${GOLDEN_SIGNATURE}`,
        },
        SECRET,
        NOW,
      ),
      true,
    );
  });

  it("rejects a correct digest presented at the wrong version", () => {
    assert.equal(
      verifyWebhookSignature(
        { rawBody: BODY, webhookId: ID, timestamp: TS, signature: `v2,${GOLDEN_SIGNATURE}` },
        SECRET,
        NOW,
      ),
      false,
    );
  });

  it("rejects a bare digest with no version prefix", () => {
    assert.equal(
      verifyWebhookSignature(
        { rawBody: BODY, webhookId: ID, timestamp: TS, signature: GOLDEN_SIGNATURE },
        SECRET,
        NOW,
      ),
      false,
    );
  });

  /* Each of these is a header a probe would omit. None may be treated as absent
   * meaning "unsigned, therefore fine". */
  it("rejects a delivery missing any required part", () => {
    const base = { rawBody: BODY, webhookId: ID, timestamp: TS, signature: `v1,${GOLDEN_SIGNATURE}` };
    for (const field of ["rawBody", "webhookId", "timestamp", "signature"] as const) {
      assert.equal(verifyWebhookSignature({ ...base, [field]: null }, SECRET, NOW), false, field);
      assert.equal(verifyWebhookSignature({ ...base, [field]: "" }, SECRET, NOW), false, field);
    }
  });

  it("rejects everything when no secret is configured", () => {
    assert.equal(
      verifyWebhookSignature(
        { rawBody: BODY, webhookId: ID, timestamp: TS, signature: `v1,${GOLDEN_SIGNATURE}` },
        "",
        NOW,
      ),
      false,
    );
  });
});

describe("timestamp freshness", () => {
  it("accepts a delivery at the edge of the window, in both directions", () => {
    assert.equal(isFreshTimestamp(String(NOW - TIMESTAMP_TOLERANCE_SECONDS), NOW), true);
    assert.equal(isFreshTimestamp(String(NOW + TIMESTAMP_TOLERANCE_SECONDS), NOW), true);
  });

  /*
   * Both directions matter. A stale timestamp is a captured delivery being
   * replayed; a future one is the same capture being *held* to replay later, and
   * a verifier that only checked the past would accept it forever.
   */
  it("rejects a delivery outside the window, in both directions", () => {
    assert.equal(isFreshTimestamp(String(NOW - TIMESTAMP_TOLERANCE_SECONDS - 1), NOW), false);
    assert.equal(isFreshTimestamp(String(NOW + TIMESTAMP_TOLERANCE_SECONDS + 1), NOW), false);
  });

  it("rejects a timestamp that is not purely digits", () => {
    // `parseInt` would read "1767225600abc" as a valid number; the value is
    // about to be hashed verbatim, so it must be exactly what it claims.
    for (const bad of ["", " ", "abc", "1767225600abc", "-1767225600", "1.5e9", "0x1"]) {
      assert.equal(isFreshTimestamp(bad, NOW), false, bad);
    }
  });

  it("refuses a signature whose timestamp is stale, however valid the digest", () => {
    const old = String(NOW - TIMESTAMP_TOLERANCE_SECONDS - 1);
    assert.equal(
      verifyWebhookSignature(
        { rawBody: BODY, webhookId: ID, timestamp: old, signature: `v1,${sign(ID, old, BODY)}` },
        SECRET,
        NOW,
      ),
      false,
    );
  });
});

describe("dodo identifiers", () => {
  it("accepts the shapes Dodo actually sends", () => {
    assert.equal(isDodoId("pdt_R8AWMPiV8RyJElcCKvAID", "pdt"), true);
    assert.equal(isDodoId("pay_n010SZaY4NXc7F1ck3Tq1", "pay"), true);
    assert.equal(isDodoId("cks_n010SZaY4NXc7F1ck3Tq1", "cks"), true);
  });

  it("rejects an id carrying the wrong prefix", () => {
    assert.equal(isDodoId("pay_n010SZaY4NXc7F1ck3Tq1", "cks"), false);
    assert.equal(isDodoId("cks_n010SZaY4NXc7F1ck3Tq1", "pdt"), false);
  });

  /*
   * These ids are interpolated into outbound API paths. Constraining the
   * character set is what stops a crafted id from reshaping that URL, so the
   * separators that would do it are the cases worth naming.
   */
  it("rejects an id that could reshape a request path", () => {
    for (const bad of [
      "pay_../../products/pdt_x",
      "pay_a/b",
      "pay_a?b=1",
      "pay_a#b",
      "pay_a b",
      "pay_a%2Fb",
      "pay_",
      "pay",
      `pay_${"a".repeat(200)}`,
      null,
      undefined,
      42,
      {},
    ]) {
      assert.equal(isDodoId(bad, "pay"), false, String(bad));
    }
  });
});
