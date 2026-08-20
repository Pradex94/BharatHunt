import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { headers } from "next/headers";

import { getRedisClient } from "@/lib/cache";
import { clientIpFrom } from "@/lib/rate-limit-ip";
import {
  consumeLocal,
  RATE_LIMITS,
  type RateLimitName,
  type RateLimitPolicy,
  type RateLimitResult,
} from "@/lib/rate-limit-core";

/**
 * Server-side rate limiting.
 *
 * Backed by `@upstash/ratelimit` on the Upstash Redis this project already
 * uses. Distributed by construction: the counter lives in Redis, so it is
 * shared across every serverless instance rather than being per-process.
 *
 * **Sliding window, not fixed.** A fixed window lets a caller spend a full
 * budget in the last instant of one window and another immediately in the
 * next — two budgets back to back, which is exactly the "1000 requests in two
 * seconds" burst this is meant to stop. The sliding window weights the previous
 * window's count by how much of it still overlaps, so the burst is counted
 * rather than reset away. This replaces the INCR/EXPIRE fixed window that was
 * here before.
 *
 * **The in-process tier is a fallback, never the production limiter.** When
 * Redis is unconfigured (local dev, CI) the bounded map in rate-limit-core
 * keeps the limits non-zero and testable. On Vercel with Upstash configured it
 * is never the active path. A Redis *error* also degrades there rather than
 * failing closed, because a transient Upstash blip must not become a site-wide
 * write outage.
 *
 * Nothing here depends on client state, and none of it is bypassable by editing
 * the request.
 */

/** One Ratelimit instance per policy, built lazily and reused across requests. */
const limiters = new Map<RateLimitName, Ratelimit>();

/*
 * Short-circuits repeat offenders without a Redis round-trip: once a key is
 * known-blocked for the current window, this answers directly. It is what stops
 * a flood from becoming one Upstash call per request — the attacker's traffic
 * is the traffic that stops costing anything. Never the source of truth; it
 * only ever withholds a request that Redis already rejected.
 */
const ephemeralCache = new Map<string, number>();

function getLimiter(name: RateLimitName): Ratelimit | null {
  const redis = getRedisClient();
  if (!redis) return null;

  const existing = limiters.get(name);
  if (existing) return existing;

  const policy: RateLimitPolicy = RATE_LIMITS[name];
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(policy.limit, `${policy.windowSeconds} s`),
    prefix: `ratelimit:${name}`,
    // Surfaces per-endpoint reject counts in the Upstash console — the "which
    // endpoint is being attacked" view, without building a dashboard.
    analytics: true,
    ephemeralCache,
  });
  limiters.set(name, limiter);
  return limiter;
}

// ── Identity ─────────────────────────────────────────────────────────────

/** `clientIpFrom` against the current request's headers. */
export async function clientIp(): Promise<string> {
  const requestHeaders = await headers();
  return clientIpFrom((name) => requestHeaders.get(name));
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Consume one unit against `name` for `identifier` (a user id, or an IP).
 *
 * Returns a result rather than throwing, so each caller shapes its own
 * response — server actions fold it into `{ error }`, the proxy returns a 429.
 */
export async function checkRateLimit(
  name: RateLimitName,
  identifier: string,
): Promise<RateLimitResult> {
  const policy: RateLimitPolicy = RATE_LIMITS[name];
  const limiter = getLimiter(name);

  if (!limiter) {
    return consumeLocal(`ratelimit:${name}:${identifier}`, policy);
  }

  try {
    const { success, limit, remaining, reset } = await limiter.limit(identifier);
    return {
      ok: success,
      limit,
      remaining: Math.max(0, remaining),
      // `reset` is an epoch-ms timestamp; Retry-After wants whole seconds.
      retryAfter: Math.max(1, Math.ceil((reset - Date.now()) / 1000)),
      message: success ? "" : policy.message,
    };
  } catch {
    return consumeLocal(`ratelimit:${name}:${identifier}`, policy);
  }
}

/** `checkRateLimit` keyed by client IP — for endpoints reachable signed-out. */
export async function checkRateLimitByIp(name: RateLimitName): Promise<RateLimitResult> {
  return checkRateLimit(name, `ip:${await clientIp()}`);
}

/** `checkRateLimit` keyed by Clerk user id. */
export async function checkRateLimitByUser(
  name: RateLimitName,
  userId: string,
): Promise<RateLimitResult> {
  return checkRateLimit(name, `user:${userId}`);
}

/**
 * Both ceilings for one authenticated write: the account's own budget, and the
 * budget of the address it arrived from.
 *
 * A per-user limit alone is bypassed by rotating accounts; a per-IP limit alone
 * is bypassed by one account working from many addresses. Whichever is
 * exhausted first wins, and the IP verdict is reported first so a flood reads
 * as a flood.
 *
 * The two checks are issued together rather than one after the other. They were
 * sequential so a blocked IP never touched the account's budget; that cost
 * every legitimate write two serial Upstash round trips on its critical path,
 * and the budget it saved belonged to whoever was already being blocked. Both
 * counters now count the attempt, which only ever makes a limit stricter --
 * never looser -- and halves the latency this adds to a launch.
 */
export async function checkRateLimitByIpAndUser(
  name: RateLimitName,
  userId: string,
): Promise<RateLimitResult> {
  const [byIp, byUser] = await Promise.all([
    checkRateLimitByIp(name),
    checkRateLimitByUser(name, userId),
  ]);
  return byIp.ok ? byUser : byIp;
}

export { RATE_LIMITS, __resetLocalRateLimiter } from "@/lib/rate-limit-core";
export type { RateLimitName, RateLimitPolicy, RateLimitResult } from "@/lib/rate-limit-core";

export { clientIpFrom, anonymizeIp } from "@/lib/rate-limit-ip";
