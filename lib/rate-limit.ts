import "server-only";

import { headers } from "next/headers";

import { getRedisClient } from "@/lib/cache";
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
 * Why this exists on top of `allowRequest` in lib/cache.ts: that helper returns
 * `true` whenever Redis is not configured. That is the right call for a *cache*
 * — a cache outage should not take the site down — but as a limiter it means
 * the protection silently evaporates in any environment without Upstash
 * credentials (local, CI, a preview with the integration detached). A limiter
 * that can neither fail closed nor fall back in-process is not a limiter.
 *
 * So: Redis when it is there (distributed, correct across instances), and a
 * bounded in-process map when it is not. The in-process tier only sees one
 * serverless instance's traffic, so it is weaker than Redis — but it is a real
 * ceiling rather than none, and it makes the limits testable without a network
 * dependency. Redis *errors* (as opposed to absence) still fall back the same
 * way, because a transient Upstash blip must not start rejecting real writes.
 *
 * Every limit here is enforced inside the server action. None of it depends on
 * client state, and none of it is bypassable by editing the request.
 */

// ── Identity ─────────────────────────────────────────────────────────────

/**
 * Client IP from the proxy headers Vercel sets. Used only as a limiter key —
 * never logged, never persisted. `x-forwarded-for` is client-settable in
 * principle, but Vercel overwrites it at the edge, so the leftmost entry is the
 * real peer.
 */
export async function clientIp(): Promise<string> {
  const requestHeaders = await headers();
  const forwarded = requestHeaders.get("x-forwarded-for")?.split(",", 1)[0]?.trim();
  return forwarded || requestHeaders.get("x-real-ip") || "unknown";
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Consume one unit against `name` for `identifier` (a user id, or an IP).
 *
 * Returns a result rather than throwing, so each caller can shape its own
 * response — server actions fold it into their `{ error }` state.
 */
export async function checkRateLimit(
  name: RateLimitName,
  identifier: string,
): Promise<RateLimitResult> {
  const policy: RateLimitPolicy = RATE_LIMITS[name];
  const key = `ratelimit:${name}:${identifier}`;
  const redis = getRedisClient();

  // No Redis configured — use the in-process ceiling rather than waving
  // everything through, which is what the old cache-backed helper did.
  if (!redis) return consumeLocal(key, policy);

  try {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, policy.windowSeconds);

    // TTL tells the caller when the window actually resets. -1/-2 mean the key
    // has no expiry or vanished between calls; re-arm rather than report a
    // nonsense Retry-After.
    let retryAfter = policy.windowSeconds;
    if (count > policy.limit) {
      const ttl = await redis.ttl(key);
      if (ttl > 0) retryAfter = ttl;
      else await redis.expire(key, policy.windowSeconds);
    }

    const ok = count <= policy.limit;
    return {
      ok,
      limit: policy.limit,
      remaining: Math.max(0, policy.limit - count),
      retryAfter,
      message: ok ? "" : policy.message,
    };
  } catch {
    // A Redis blip must not become a write outage. Degrade to the in-process
    // ceiling, which still bounds a single instance.
    return consumeLocal(key, policy);
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

export { RATE_LIMITS, __resetLocalRateLimiter } from "@/lib/rate-limit-core";
export type { RateLimitName, RateLimitPolicy, RateLimitResult } from "@/lib/rate-limit-core";
