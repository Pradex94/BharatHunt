/**
 * Signed one-click approval links for the launch review email.
 *
 * The admin gets a mail per submission and should be able to act on it from
 * their phone, at the moment they read it, without a login round trip. That
 * means the link itself has to carry the authority — so it is an HMAC over the
 * product id, the action and an expiry, signed with `ADMIN_REVIEW_SECRET`.
 * Nothing is stored: the product's own status is the replay guard, since only a
 * pending product can be approved or rejected.
 *
 * Three properties this file is responsible for:
 *
 *   - **Scoped.** The signature covers the action as well as the id, so an
 *     approve link cannot be edited into a reject link, or moved to another
 *     product.
 *   - **Expiring.** The deadline is inside the signed payload rather than
 *     alongside it, so it cannot be extended by editing the URL.
 *   - **Compared in constant time.** A byte-by-byte early return leaks the
 *     signature one character at a time to anyone who can measure it.
 *
 * Without a secret configured, `signReviewToken` returns null and the email
 * falls back to a plain link to /admin, which is gated by a Clerk session. The
 * feature degrades to "log in and approve" rather than to "anyone can approve".
 *
 * Framework-agnostic (no `server-only`, no `next/*`) so `npm test` can exercise
 * it directly. `node:crypto` is available on the Node runtime this app builds
 * for; it is never imported into a client bundle.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export type ReviewAction = "approve" | "reject";

/** How long a link in the review email stays usable. */
export const REVIEW_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The signing secret, or null when unset.
 *
 * Read through a function rather than captured at module load so a test can set
 * the variable, and so a missing value is a runtime fallback rather than a
 * build-time crash.
 */
export function reviewSecret(): string | null {
  const secret = process.env.ADMIN_REVIEW_SECRET?.trim();
  return secret ? secret : null;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/**
 * Constant-time compare.
 *
 * `timingSafeEqual` throws rather than returns false on a length mismatch, so
 * the lengths are checked first. That leaks nothing: both sides are base64url
 * SHA-256 digests and always the same length, so an unequal length means the
 * token was malformed — which the caller could see anyway.
 */
function matches(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * `<expiry>.<signature>`, or null when no secret is configured.
 *
 * `now` is injectable so a test can pin the clock.
 */
export function signReviewToken(
  productId: string,
  action: ReviewAction,
  options: { secret?: string | null; now?: number; ttlMs?: number } = {},
): string | null {
  const secret = options.secret ?? reviewSecret();
  if (!secret) return null;

  const expiresAt = (options.now ?? Date.now()) + (options.ttlMs ?? REVIEW_TOKEN_TTL_MS);
  return `${expiresAt}.${sign(`${productId}:${action}:${expiresAt}`, secret)}`;
}

/**
 * Whether `token` authorises `action` on `productId` right now.
 *
 * False for anything malformed, expired, re-pointed at another product or
 * action, or signed with a different secret — and always false when no secret
 * is configured, so turning the variable off closes the door rather than
 * opening it.
 */
export function verifyReviewToken(
  token: string | null | undefined,
  productId: string,
  action: ReviewAction,
  options: { secret?: string | null; now?: number } = {},
): boolean {
  const secret = options.secret ?? reviewSecret();
  if (!secret || !token) return false;

  const separator = token.indexOf(".");
  if (separator < 1) return false;

  const expiresAt = Number(token.slice(0, separator));
  const signature = token.slice(separator + 1);
  if (!Number.isSafeInteger(expiresAt) || !signature) return false;
  if ((options.now ?? Date.now()) > expiresAt) return false;

  return matches(signature, sign(`${productId}:${action}:${expiresAt}`, secret));
}
