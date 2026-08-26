/**
 * Signed approval links.
 *
 * This token is the whole authorisation for approving a launch from an email,
 * without a session — so the cases that matter are the ones where it must say
 * no. A token that verifies for the wrong product, the wrong action, a stretched
 * deadline or a different secret is not a bug in a helper, it is an open door to
 * publishing anything on the marketplace.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { signReviewToken, verifyReviewToken } from "../lib/review-token.ts";

const SECRET = "test-secret-value";
const OTHER_SECRET = "a-different-secret";
const PRODUCT = "11111111-2222-3333-4444-555555555555";
const NOW = 1_800_000_000_000;

const sign = (productId = PRODUCT, action: "approve" | "reject" = "approve", now = NOW) =>
  signReviewToken(productId, action, { secret: SECRET, now });

describe("a token authorises exactly what it was signed for", () => {
  it("verifies for its own product and action", () => {
    const token = sign();
    assert.equal(verifyReviewToken(token, PRODUCT, "approve", { secret: SECRET, now: NOW }), true);
  });

  it("does not carry over to the other action", () => {
    const token = sign(PRODUCT, "approve");
    assert.equal(verifyReviewToken(token, PRODUCT, "reject", { secret: SECRET, now: NOW }), false);
  });

  it("does not carry over to another product", () => {
    const token = sign();
    const other = "99999999-8888-7777-6666-555555555555";
    assert.equal(verifyReviewToken(token, other, "approve", { secret: SECRET, now: NOW }), false);
  });

  it("does not verify under a different secret", () => {
    const token = sign();
    assert.equal(
      verifyReviewToken(token, PRODUCT, "approve", { secret: OTHER_SECRET, now: NOW }),
      false,
    );
  });
});

describe("the deadline is inside the signature, not beside it", () => {
  it("stops working once it expires", () => {
    const token = signReviewToken(PRODUCT, "approve", { secret: SECRET, now: NOW, ttlMs: 1000 });
    assert.equal(
      verifyReviewToken(token, PRODUCT, "approve", { secret: SECRET, now: NOW + 999 }),
      true,
    );
    assert.equal(
      verifyReviewToken(token, PRODUCT, "approve", { secret: SECRET, now: NOW + 1001 }),
      false,
    );
  });

  it("cannot be extended by editing the expiry in the URL", () => {
    const token = signReviewToken(PRODUCT, "approve", { secret: SECRET, now: NOW, ttlMs: 1000 })!;
    const signature = token.slice(token.indexOf(".") + 1);
    const stretched = `${NOW + 10_000_000}.${signature}`;
    assert.equal(
      verifyReviewToken(stretched, PRODUCT, "approve", { secret: SECRET, now: NOW + 5000 }),
      false,
    );
  });
});

describe("malformed input is refused, never thrown on", () => {
  const junk = ["", ".", "abc", `${NOW}.`, `.${"x".repeat(43)}`, "notanumber.signature", "1e999.x"];

  for (const token of junk) {
    it(`refuses ${JSON.stringify(token)}`, () => {
      assert.equal(
        verifyReviewToken(token, PRODUCT, "approve", { secret: SECRET, now: NOW }),
        false,
      );
    });
  }

  it("refuses null and undefined", () => {
    assert.equal(verifyReviewToken(null, PRODUCT, "approve", { secret: SECRET, now: NOW }), false);
    assert.equal(
      verifyReviewToken(undefined, PRODUCT, "approve", { secret: SECRET, now: NOW }),
      false,
    );
  });
});

describe("no secret means no one-click approval", () => {
  it("signs nothing", () => {
    assert.equal(signReviewToken(PRODUCT, "approve", { secret: null }), null);
  });

  it("verifies nothing — including a token signed while a secret existed", () => {
    const token = sign();
    assert.equal(verifyReviewToken(token, PRODUCT, "approve", { secret: null, now: NOW }), false);
  });
});
