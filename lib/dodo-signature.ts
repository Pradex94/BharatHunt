/**
 * Dodo Payments webhook signature verification (Standard Webhooks).
 *
 * Split out of lib/dodo.ts so it carries no `server-only` marker and no SDK
 * import: this is the function that decides whether money arrived, so it has to
 * be reachable by `npm test` in plain Node rather than only through a request
 * context. Same reasoning as lib/rate-limit-ip.ts, and the same split the
 * Razorpay integration this replaces used.
 *
 * Nothing here reads `process.env`. The secret arrives as an argument, which is
 * what lets the tests exercise the real comparison with a throwaway key.
 *
 * Why not `client.webhooks.unwrap()`
 * ----------------------------------
 * The SDK's helper does exactly this, via the `standardwebhooks` package. It is
 * re-implemented here for two reasons and neither is taste: `unwrap` requires a
 * constructed `DodoPayments` client, which throws without `DODO_PAYMENTS_API_KEY`
 * — so a test for the signature check would need a fake API key to exist — and it
 * signals failure by throwing, where every other verification in this repo
 * returns a boolean the caller branches on. The format is pinned by a golden
 * vector in tests/dodo-signature.test.ts generated from the real library, so a
 * drift between this file and the SDK fails the test rather than the webhook.
 *
 * The scheme (https://www.standardwebhooks.com):
 *
 *   signed content = `{webhook-id}.{webhook-timestamp}.{raw body}`
 *   signature      = base64( HMAC-SHA256( base64decode(secret minus "whsec_"),
 *                                         signed content ) )
 *   header         = space-separated list of `v1,<signature>` entries
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/** Standard Webhooks' own prefix on a signing secret. Stripped before decoding. */
const SECRET_PREFIX = "whsec_";

/**
 * How far a `webhook-timestamp` may be from now, in seconds.
 *
 * Five minutes, matching the `standardwebhooks` default. This is what stops a
 * signature captured off the wire from being replayable forever; the event
 * ledger in the webhook route stops it being replayable at all, but that is a
 * database row and this is arithmetic, so both exist.
 */
export const TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

/**
 * Constant-time compare of two base64 signatures.
 *
 * `a === b` on a signature is a timing oracle: string comparison returns at the
 * first differing byte, so an attacker who can submit many candidates learns the
 * digest one character at a time. `timingSafeEqual` always reads both buffers to
 * the end.
 *
 * It throws on a length mismatch, so lengths are compared first -- and that
 * comparison is safe to short-circuit, because the length of a SHA-256 digest is
 * fixed and public. The comparison is over the raw bytes of the *encoding*
 * rather than the decoded digest, which is what `standardwebhooks` does: two
 * different base64 spellings of one digest are not a signature we produced.
 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

/**
 * The signing key: the secret with its `whsec_` prefix removed, base64-decoded.
 *
 * The decode is the part worth stating. The secret is *not* used as UTF-8 bytes
 * the way Razorpay's was -- a verifier that skips this step produces a digest
 * that never matches, and the failure looks exactly like "Dodo sent a bad
 * signature" rather than "we parsed our own secret wrong".
 */
function signingKey(secret: string): Buffer {
  const raw = secret.startsWith(SECRET_PREFIX) ? secret.slice(SECRET_PREFIX.length) : secret;
  return Buffer.from(raw, "base64");
}

/**
 * The exact bytes Dodo signs.
 *
 * Exported because the ordering and the separators *are* the security property,
 * and a test that only ever calls `verifyWebhookSignature` cannot tell a
 * correctly assembled payload from one this file also assembles wrongly.
 */
export function signedContent(webhookId: string, timestamp: string, rawBody: string): string {
  return `${webhookId}.${timestamp}.${rawBody}`;
}

/** Base64 HMAC-SHA256 of `content` under `secret`, in Dodo's wire encoding. */
export function signWebhook(
  params: { webhookId: string; timestamp: string; rawBody: string },
  secret: string,
): string {
  return createHmac("sha256", signingKey(secret))
    .update(signedContent(params.webhookId, params.timestamp, params.rawBody), "utf8")
    .digest("base64");
}

/**
 * True when `timestamp` (Unix seconds, as a string) is inside the replay window.
 *
 * Rejects both directions. A clock-skewed future timestamp is as much a sign of
 * a forged header as an ancient one, and accepting it would let a captured
 * delivery be held and replayed later.
 */
export function isFreshTimestamp(timestamp: string, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  // `parseInt` would accept "123abc"; a header we are about to hash must be
  // exactly what it claims to be.
  if (!/^\d{1,15}$/.test(timestamp)) return false;
  const sent = Number(timestamp);
  return Math.abs(nowSeconds - sent) <= TIMESTAMP_TOLERANCE_SECONDS;
}

/**
 * True when a webhook body really came from Dodo.
 *
 * The caller must pass the **raw** request text. `JSON.parse` followed by
 * `JSON.stringify` re-orders keys and drops insignificant whitespace, which
 * changes the digest and rejects every legitimate delivery.
 *
 * `webhook-signature` carries a space-separated list so a secret can be rotated
 * without dropping deliveries: during a rotation Dodo sends one entry per active
 * key. Every `v1` entry is tried and any match accepts; entries at an unknown
 * version are skipped rather than failing the whole header, which is what lets a
 * future `v2` be added without this returning false for everything.
 */
export function verifyWebhookSignature(
  params: {
    rawBody: string;
    webhookId: string | null | undefined;
    timestamp: string | null | undefined;
    signature: string | null | undefined;
  },
  secret: string,
  nowSeconds?: number,
): boolean {
  const { rawBody, webhookId, timestamp, signature } = params;

  if (!secret || !rawBody || !webhookId || !timestamp || !signature) return false;
  if (!isFreshTimestamp(timestamp, nowSeconds)) return false;

  const expected = signWebhook({ webhookId, timestamp, rawBody }, secret);

  for (const entry of signature.split(" ")) {
    const separator = entry.indexOf(",");
    if (separator === -1) continue;
    if (entry.slice(0, separator) !== "v1") continue;
    if (safeEqual(entry.slice(separator + 1), expected)) return true;
  }

  return false;
}

/**
 * Dodo identifiers as they appear on the wire: `pdt_...`, `pay_...`, `cks_...`.
 *
 * Checked before anything is done with a caller-supplied id -- these values are
 * interpolated into an outbound API path, so constraining the character set here
 * is what stops a crafted id from reshaping that URL.
 */
const DODO_ID_RE = /^[A-Za-z0-9_-]{5,80}$/;

export function isDodoId(value: unknown, prefix: "pdt" | "pay" | "cks" | "ref"): value is string {
  return typeof value === "string" && value.startsWith(`${prefix}_`) && DODO_ID_RE.test(value);
}
