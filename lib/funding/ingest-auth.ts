/**
 * Who is allowed to trigger an ingestion run.
 *
 * This lives apart from `app/api/funding/ingest/route.ts` for one reason: it is
 * the only security decision in the funding feature that a signed-in admin is
 * not standing behind, and a decision that cannot be tested is a decision taken
 * on trust. Nothing here imports Next, Supabase or the network, so the whole
 * gate is exercised by `tests/funding-ingest-auth.test.ts` in plain Node —
 * including the rejection paths, which are the ones a live smoke test is least
 * likely to cover and most costly to get wrong.
 *
 * The route keeps everything this file cannot decide: rate limiting (which
 * needs a request IP and Redis), and running the job.
 */

/** The headers the gate reads. A plain lookup, so `Headers` satisfies it. */
export type HeaderLookup = { get(name: string): string | null };

export type IngestAuthDecision =
  /** Configured and the presented secret matched. */
  | { ok: true }
  /**
   * No secret configured. 503 rather than 401: the caller did nothing wrong,
   * the deployment is incomplete — and saying so is safe, because the endpoint
   * is refusing either way.
   */
  | { ok: false; status: 503; error: "Ingestion is not configured." }
  /** Configured, and the presented secret did not match (or was absent). */
  | { ok: false; status: 401; error: "Unauthorized" };

/**
 * Timing-safe string comparison.
 *
 * Hand-rolled rather than `crypto.timingSafeEqual`, which needs Node Buffers
 * and is not available in every runtime this app is deployed to (it runs on
 * Cloudflare Workers via OpenNext). Comparing the full length of both strings
 * with a bitwise accumulator has the same property — the loop count and the
 * work done do not depend on where the first difference is.
 *
 * The length check is deliberately *not* an early return on mismatch alone: it
 * folds into the same accumulator, so a wrong-length guess costs the same as a
 * right-length one.
 */
export function secretMatches(presented: string, expected: string): boolean {
  const length = Math.max(presented.length, expected.length);
  let difference = presented.length ^ expected.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (presented.charCodeAt(index) || 0) ^ (expected.charCodeAt(index) || 0);
  }
  return difference === 0;
}

/**
 * The secret the caller presented, from either header scheduler products use.
 *
 * `Authorization: Bearer <secret>` is preferred and checked first; the
 * `X-Ingest-Secret` fallback exists because some schedulers reserve the
 * Authorization header for their own use. An Authorization header in any other
 * scheme is not treated as a secret — it falls through to the other header
 * rather than being compared raw, so a stray `Basic ...` cannot accidentally
 * match.
 */
export function presentedSecret(headers: HeaderLookup): string {
  const authorization = headers.get("authorization") ?? "";
  const bearer = /^Bearer\s+(.+)$/i.exec(authorization);
  if (bearer) return bearer[1].trim();
  return headers.get("x-ingest-secret")?.trim() ?? "";
}

/**
 * The gate itself.
 *
 * **Unset means closed.** With no secret configured this returns 503 and the
 * route ingests nothing. The alternative — treating "no secret" as "no gate" —
 * is how a deployment that forgot one environment variable ends up with a
 * public endpoint that runs a job and writes rows.
 */
export function authorizeIngest(headers: HeaderLookup, secret: string | undefined): IngestAuthDecision {
  const expected = secret?.trim();
  if (!expected) return { ok: false, status: 503, error: "Ingestion is not configured." };
  if (!secretMatches(presentedSecret(headers), expected)) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  return { ok: true };
}
