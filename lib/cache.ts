import "server-only";

import { Redis } from "@upstash/redis";
import { headers } from "next/headers";

/**
 * Redis cache service (Upstash REST — serverless-friendly, no connection
 * pooling). Reads credentials from `UPSTASH_REDIS_REST_URL`/`_TOKEN` or Vercel
 * KV's `KV_REST_API_URL`/`_TOKEN`, so wiring up either integration "just works".
 *
 * Every operation is **fail-open**: if Redis isn't configured, or a call errors
 * (network blip, quota), we transparently fall back to the loader / no-op so the
 * app never breaks because of the cache. Values are JSON-serialized by the
 * client automatically.
 */

let client: Redis | null | undefined; // undefined = not yet resolved

function getRedis(): Redis | null {
  if (client !== undefined) return client;
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  client = url && token ? new Redis({ url, token }) : null;
  return client;
}

/** Whether a Redis backend is configured (useful for diagnostics). */
export function isCacheEnabled(): boolean {
  return getRedis() !== null;
}

/**
 * Best-effort fixed-window limiter for public writes. It is intentionally
 * fail-open when Redis is unavailable: availability is preferable to turning
 * a cache/integration outage into a site-wide form outage.
 */
export async function allowRequest(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return true;

  try {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, windowSeconds);
    return count <= limit;
  } catch {
    return true;
  }
}

/** Stable enough client key for Vercel requests; never logs or persists the IP itself. */
export async function requestRateLimitKey(scope: string): Promise<string> {
  const requestHeaders = await headers();
  const forwarded = requestHeaders.get("x-forwarded-for")?.split(",", 1)[0]?.trim();
  const ip = forwarded || requestHeaders.get("x-real-ip") || "unknown";
  return `ratelimit:${scope}:${ip}`;
}

/**
 * Get `key` from cache, or run `loader`, cache its result for `ttlSeconds`, and
 * return it. Loader errors propagate (so callers keep their existing behavior);
 * cache errors are swallowed.
 */
export async function cacheRemember<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<T> {
  const redis = getRedis();
  if (!redis) return loader();

  try {
    const cached = await redis.get<T>(key);
    if (cached !== null && cached !== undefined) return cached;
  } catch {
    // Cache read failed — fall through to the loader.
  }

  const fresh = await loader();

  try {
    await redis.set(key, fresh, { ex: ttlSeconds });
  } catch {
    // Cache write failed — the value is still returned to the caller.
  }

  return fresh;
}

/** Delete one or more exact keys. */
export async function cacheDelete(...keys: string[]): Promise<void> {
  const redis = getRedis();
  if (!redis || keys.length === 0) return;
  try {
    await redis.del(...keys);
  } catch {
    // ignore
  }
}

/**
 * Delete every key matching `${prefix}*` (SCAN + DEL). Used for coarse
 * invalidation on writes; safe to call frequently since writes are rare
 * relative to reads.
 */
export async function cacheInvalidatePrefix(prefix: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    let cursor = 0;
    do {
      const [next, keys] = await redis.scan(cursor, { match: `${prefix}*`, count: 200 });
      cursor = Number(next);
      if (keys.length > 0) await redis.del(...keys);
    } while (cursor !== 0);
  } catch {
    // ignore — stale keys expire via their TTL regardless
  }
}
