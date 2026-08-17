/**
 * Rate-limit policy table and the in-process fallback counter.
 *
 * Deliberately free of `server-only`, `next/headers` and the Redis client so it
 * can be exercised by `npm test` in plain Node. The server-bound half —
 * identity resolution and the Redis path — lives in lib/rate-limit.ts and
 * re-exports everything here.
 *
 * Phase 17 of the audit asked for the limiter to be *tested*, not asserted;
 * that is only possible if the counting logic is reachable without a network
 * dependency or a request context.
 */

export type RateLimitPolicy = {
  /** Requests allowed per window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
  /** What the caller is told when they hit it. */
  message: string;
};

/**
 * Per-endpoint policies. Deliberately not one shared number: the cost and blast
 * radius of these calls differ by orders of magnitude. A search is a cached
 * read; a product submission writes a row and invalidates caches; a newsletter
 * signup sends mail through a paid provider; a metadata fetch makes this server
 * issue an outbound HTTP request to a caller-chosen URL.
 */
export const RATE_LIMITS = {
  /** Public, cached, cheap — generous so real browsing is never touched. */
  search: { limit: 60, windowSeconds: 60, message: "Too many searches. Please slow down." },
  loadMore: { limit: 120, windowSeconds: 60, message: "Too many requests. Please slow down." },

  /** Authenticated writes, keyed per user. */
  upvote: {
    limit: 30,
    windowSeconds: 60,
    message: "You are voting too quickly. Try again shortly.",
  },
  comment: {
    limit: 10,
    windowSeconds: 300,
    message: "You are commenting too quickly. Try again in a few minutes.",
  },
  productCreate: {
    limit: 5,
    windowSeconds: 3600,
    message: "You have submitted several products already. Try again in an hour.",
  },
  productUpdate: { limit: 30, windowSeconds: 3600, message: "Too many edits. Try again shortly." },
  productDelete: {
    limit: 10,
    windowSeconds: 3600,
    message: "Too many deletions. Try again shortly.",
  },

  /**
   * Makes this server fetch an arbitrary remote URL on the caller's behalf, so
   * it is both an egress cost and an amplification primitive. Tightest of the
   * authenticated limits.
   */
  metadataFetch: {
    limit: 10,
    windowSeconds: 600,
    message: "Too many link imports. Try again in a few minutes.",
  },

  /** Sends real email through a paid provider — strictest, and keyed per IP. */
  newsletter: {
    limit: 3,
    windowSeconds: 3600,
    message: "Too many signup attempts. Please try again later.",
  },
  adInquiry: {
    limit: 5,
    windowSeconds: 3600,
    message: "Too many enquiries. Please try again later.",
  },
  /**
   * The pre-captcha gate on the same form. Verifying a Turnstile token is an
   * outbound call to Cloudflare, so unverified attempts need their own, looser
   * ceiling ahead of the submission limit above.
   */
  adInquiryAttempts: {
    limit: 30,
    windowSeconds: 3600,
    message: "Too many attempts. Please try again later.",
  },
} as const satisfies Record<string, RateLimitPolicy>;

export type RateLimitName = keyof typeof RATE_LIMITS;

export type RateLimitResult = {
  ok: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the window resets. Suitable for a `Retry-After` header. */
  retryAfter: number;
  /** Empty when `ok`; the policy's user-facing message otherwise. */
  message: string;
};

// ── In-process fallback ──────────────────────────────────────────────────
/*
 * Fixed-window counters, bounded so a flood of distinct keys cannot grow this
 * without limit. Expired entries are dropped on write; if the map is still at
 * capacity after that sweep, the window closest to expiry is evicted.
 */
const MAX_LOCAL_KEYS = 10_000;
const localCounters = new Map<string, { count: number; resetAt: number }>();

function sweepLocal(now: number) {
  for (const [key, entry] of localCounters) {
    if (entry.resetAt <= now) localCounters.delete(key);
  }
  if (localCounters.size >= MAX_LOCAL_KEYS) {
    let oldestKey: string | null = null;
    let oldestAt = Infinity;
    for (const [key, entry] of localCounters) {
      if (entry.resetAt < oldestAt) {
        oldestAt = entry.resetAt;
        oldestKey = key;
      }
    }
    if (oldestKey !== null) localCounters.delete(oldestKey);
  }
}

export function consumeLocal(key: string, policy: RateLimitPolicy): RateLimitResult {
  const now = Date.now();
  sweepLocal(now);

  const existing = localCounters.get(key);
  if (!existing || existing.resetAt <= now) {
    localCounters.set(key, { count: 1, resetAt: now + policy.windowSeconds * 1000 });
    return {
      ok: true,
      limit: policy.limit,
      remaining: policy.limit - 1,
      retryAfter: policy.windowSeconds,
      message: "",
    };
  }

  existing.count += 1;
  const ok = existing.count <= policy.limit;
  return {
    ok,
    limit: policy.limit,
    remaining: Math.max(0, policy.limit - existing.count),
    retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    message: ok ? "" : policy.message,
  };
}

/** Test seam: drop all in-process counters between cases. */
export function __resetLocalRateLimiter() {
  localCounters.clear();
}
