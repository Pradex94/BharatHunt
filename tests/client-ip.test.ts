/**
 * Client-IP resolution for the rate limiter.
 *
 * The whole limiter rests on this function. If a caller can choose their own
 * key, they mint a fresh budget per request and every limit above becomes
 * decorative — so these tests are really about one property: a header the
 * client can set must never outrank one the platform sets.
 *
 * Pure header-map input, no request context, so it runs in plain Node.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { anonymizeIp, clientIpFrom } from "../lib/rate-limit-ip.ts";

/** Build the `get` accessor `clientIpFrom` expects from a plain object. */
const from = (headers: Record<string, string>) => (name: string) => headers[name] ?? null;

describe("clientIpFrom — spoofing resistance", () => {
  it("prefers Vercel's own header over a forged x-forwarded-for", () => {
    // The attack: send X-Forwarded-For yourself to get a new bucket each time.
    // x-vercel-forwarded-for is set by the platform and never forwarded from
    // the client, so it has to win.
    const ip = clientIpFrom(
      from({
        "x-vercel-forwarded-for": "203.0.113.50",
        "x-forwarded-for": "1.2.3.4",
        "x-real-ip": "5.6.7.8",
      }),
    );
    assert.equal(ip, "203.0.113.50");
  });

  it("returns the same key no matter what the client claims", () => {
    const attacker = "203.0.113.50";
    const keys = new Set(
      ["1.1.1.1", "2.2.2.2", "3.3.3.3", "evil", ""].map((forged) =>
        clientIpFrom(
          from({ "x-vercel-forwarded-for": attacker, "x-forwarded-for": forged }),
        ),
      ),
    );
    assert.deepEqual([...keys], [attacker], "a forged header must not change the bucket");
  });

  it("takes the leftmost entry of a proxy chain", () => {
    assert.equal(
      clientIpFrom(from({ "x-vercel-forwarded-for": "203.0.113.50, 70.41.3.18" })),
      "203.0.113.50",
    );
  });

  it("falls back to x-real-ip, then x-forwarded-for, off-platform", () => {
    assert.equal(clientIpFrom(from({ "x-real-ip": "198.51.100.7" })), "198.51.100.7");
    assert.equal(clientIpFrom(from({ "x-forwarded-for": "198.51.100.9" })), "198.51.100.9");
  });

  it("collapses to a single shared bucket when no IP is available", () => {
    // One shared budget, not a free pass per unidentifiable request.
    assert.equal(clientIpFrom(from({})), "unknown");
    assert.equal(clientIpFrom(from({ "x-forwarded-for": "   " })), "unknown");
  });
});

describe("anonymizeIp — logs correlate without identifying", () => {
  it("drops the last octet of an IPv4 address", () => {
    assert.equal(anonymizeIp("203.0.113.50"), "203.0.113.x");
  });

  it("keeps only the leading groups of an IPv6 address", () => {
    assert.equal(anonymizeIp("2001:db8:85a3:0:0:8a2e:370:7334"), "2001:db8::");
  });

  it("never echoes an unparseable value back into the log", () => {
    assert.equal(anonymizeIp("unknown"), "unknown");
    assert.equal(anonymizeIp("garbage"), "unknown");
  });
});
