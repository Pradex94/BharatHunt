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

describe("clientIpFrom — behind Cloudflare's proxy", () => {
  /*
   * With the orange cloud on, every request reaches the origin from a
   * Cloudflare data centre, so the platform header names Cloudflare rather than
   * the visitor. Keying on it would put everyone served by one PoP into a
   * single 300/min budget — the whole of Mumbai throttled by one busy hour.
   */
  it("keys on the visitor, not on the Cloudflare data centre", () => {
    const ip = clientIpFrom(
      from({
        "x-vercel-forwarded-for": "104.16.0.1",
        "cf-connecting-ip": "203.0.113.50",
      }),
    );
    assert.equal(ip, "203.0.113.50");
  });

  it("gives two visitors behind one data centre two budgets", () => {
    const edge = "162.158.1.1";
    const first = clientIpFrom(
      from({
        "x-vercel-forwarded-for": edge,
        "cf-connecting-ip": "203.0.113.10",
      }),
    );
    const second = clientIpFrom(
      from({
        "x-vercel-forwarded-for": edge,
        "cf-connecting-ip": "203.0.113.11",
      }),
    );
    assert.notEqual(first, second);
  });

  /*
   * The reason the range check exists. `cf-connecting-ip` is an ordinary
   * header, and the .vercel.app origin stays reachable without going through
   * Cloudflare, so a caller can send one directly — and would mint a fresh
   * budget per request if it were believed.
   */
  it("ignores a cf-connecting-ip that did not arrive from Cloudflare", () => {
    const ip = clientIpFrom(
      from({
        "x-vercel-forwarded-for": "203.0.113.99",
        "cf-connecting-ip": "1.2.3.4",
      }),
    );
    assert.equal(ip, "203.0.113.99");
  });

  it("returns the same key however the forged header changes", () => {
    const attacker = "203.0.113.99";
    const keys = new Set(
      ["1.1.1.1", "2.2.2.2", "104.16.0.1", ""].map((forged) =>
        clientIpFrom(
          from({
            "x-vercel-forwarded-for": attacker,
            "cf-connecting-ip": forged,
          }),
        ),
      ),
    );
    assert.deepEqual([...keys], [attacker]);
  });

  it("falls back to the edge address when Cloudflare sent no client header", () => {
    assert.equal(clientIpFrom(from({ "x-vercel-forwarded-for": "104.16.0.1" })), "104.16.0.1");
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
