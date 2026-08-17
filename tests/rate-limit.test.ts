/**
 * The rate limiter actually limits.
 *
 * The bug this guards against is not "the limiter is missing" — it is "the
 * limiter is present, is called, and returns true anyway". `allowRequest` in
 * lib/cache.ts does exactly that whenever Redis is unconfigured, which is every
 * environment without Upstash credentials. A limiter with that failure mode
 * passes code review and protects nothing, so these tests assert on the
 * *counting*, not on the presence of a call.
 *
 * Everything here exercises the in-process tier, which is the tier that runs
 * when Redis is absent. The Redis path is the same fixed-window arithmetic
 * against INCR/EXPIRE and is verified separately against a live instance (see
 * the report).
 */

import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";

import {
  consumeLocal,
  RATE_LIMITS,
  __resetLocalRateLimiter,
  type RateLimitPolicy,
} from "../lib/rate-limit-core.ts";

beforeEach(() => __resetLocalRateLimiter());
after(() => __resetLocalRateLimiter());

const policy = (limit: number, windowSeconds = 60): RateLimitPolicy => ({
  limit,
  windowSeconds,
  message: "nope",
});

describe("the limit is enforced, not merely consulted", () => {
  it("allows exactly `limit` requests and refuses the next", () => {
    const p = policy(5);
    const verdicts = Array.from({ length: 6 }, () => consumeLocal("k", p).ok);
    assert.deepEqual(verdicts, [true, true, true, true, true, false]);
  });

  it("keeps refusing once over the limit", () => {
    const p = policy(2);
    consumeLocal("k", p);
    consumeLocal("k", p);
    for (let i = 0; i < 10; i += 1) {
      assert.equal(consumeLocal("k", p).ok, false, `call ${i + 3} should still be refused`);
    }
  });

  it("counts each key independently, so one caller cannot exhaust another", () => {
    const p = policy(1);
    assert.equal(consumeLocal("user:a", p).ok, true);
    assert.equal(consumeLocal("user:a", p).ok, false);
    // A different identity still has its full budget.
    assert.equal(consumeLocal("user:b", p).ok, true);
  });

  it("reports remaining budget, flooring at zero", () => {
    const p = policy(3);
    assert.equal(consumeLocal("k", p).remaining, 2);
    assert.equal(consumeLocal("k", p).remaining, 1);
    assert.equal(consumeLocal("k", p).remaining, 0);
    assert.equal(consumeLocal("k", p).remaining, 0, "never negative");
  });

  it("carries the policy message only on refusal", () => {
    const p = policy(1);
    assert.equal(consumeLocal("k", p).message, "");
    assert.equal(consumeLocal("k", p).message, "nope");
  });

  it("supplies a positive retryAfter when refusing", () => {
    const p = policy(1, 300);
    consumeLocal("k", p);
    const refused = consumeLocal("k", p);
    assert.equal(refused.ok, false);
    assert.ok(refused.retryAfter > 0, "retryAfter must be usable as Retry-After");
    assert.ok(refused.retryAfter <= 300, "retryAfter cannot exceed the window");
  });
});

describe("windows expire", () => {
  it("refills once the window has passed", () => {
    // A zero-length window is already expired on the next call, which exercises
    // the reset branch without making the test sleep.
    const p = policy(1, 0);
    assert.equal(consumeLocal("k", p).ok, true);
    assert.equal(consumeLocal("k", p).ok, true, "a fresh window starts a new count");
  });
});

describe("the policy table", () => {
  it("gives every endpoint a positive limit and window", () => {
    for (const [name, p] of Object.entries(RATE_LIMITS)) {
      assert.ok(p.limit > 0, `${name} has a non-positive limit`);
      assert.ok(p.windowSeconds > 0, `${name} has a non-positive window`);
      assert.ok(p.message.length > 0, `${name} has no user-facing message`);
    }
  });

  it("does not hand every endpoint the same budget", () => {
    // The audit brief called this out explicitly: a single shared number means
    // either search is throttled to email limits or email is opened to search
    // limits. Assert the table actually discriminates.
    const shapes = new Set(
      Object.values(RATE_LIMITS).map((p) => `${p.limit}/${p.windowSeconds}`),
    );
    assert.ok(shapes.size > 3, `expected varied policies, saw ${[...shapes].join(", ")}`);
  });

  it("keeps the email-sending endpoints strictest", () => {
    // Newsletter and ad enquiries both send real mail through a paid provider.
    // Neither may ever be looser than an ordinary authenticated write.
    const perHour = (p: { limit: number; windowSeconds: number }) =>
      (p.limit / p.windowSeconds) * 3600;

    assert.ok(
      perHour(RATE_LIMITS.newsletter) < perHour(RATE_LIMITS.comment),
      "newsletter must be stricter than commenting",
    );
    assert.ok(
      perHour(RATE_LIMITS.adInquiry) < perHour(RATE_LIMITS.upvote),
      "ad enquiries must be stricter than voting",
    );
    assert.ok(
      perHour(RATE_LIMITS.metadataFetch) < perHour(RATE_LIMITS.search),
      "outbound link fetches must be stricter than search",
    );
  });
});
