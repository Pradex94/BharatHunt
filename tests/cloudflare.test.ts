/**
 * Cloudflare edge-range matching.
 *
 * This is the gate that decides whether `cf-connecting-ip` and `cf-ipcountry`
 * are believed, so it protects the rate limiter: say yes to an address that is
 * not Cloudflare's and a caller can name their own rate-limit bucket by setting
 * a header. The false-cases below therefore matter more than the true-cases —
 * a missed Cloudflare range costs accuracy, a wrong one costs the limiter.
 *
 * Pure string input, no request context, so it runs in plain Node.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isCloudflareIp } from "../lib/cloudflare.ts";

describe("isCloudflareIp — published ranges", () => {
  const inside = [
    "104.16.0.1", // 104.16.0.0/13
    "104.23.255.255", // last address of that range
    "172.64.10.20", // 172.64.0.0/13
    "162.158.1.1", // 162.158.0.0/15
    "131.0.72.5", // 131.0.72.0/22
    "173.245.48.1", // 173.245.48.0/20
    "2400:cb00::1",
    "2606:4700:3033::6815:1",
    "2a06:98c5::1", // inside the /29, which masks mid-group
  ];

  for (const ip of inside) {
    it(`recognises ${ip}`, () => {
      assert.equal(isCloudflareIp(ip), true);
    });
  }
});

describe("isCloudflareIp — everything else", () => {
  const outside = [
    "203.0.113.50", // ordinary visitor
    "8.8.8.8",
    "76.76.21.21", // Vercel's own anycast address
    "104.15.255.255", // one below 104.16.0.0/13
    "104.28.0.1", // between two Cloudflare blocks, in neither
    "173.245.64.1", // one past the end of 173.245.48.0/20
    "2a06:98c8::1", // one past the end of the /29
    "2001:db8::1",
  ];

  for (const ip of outside) {
    it(`rejects ${ip}`, () => {
      assert.equal(isCloudflareIp(ip), false);
    });
  }
});

describe("isCloudflareIp — malformed input is never a match", () => {
  const junk = ["", "   ", "unknown", "not-an-ip", "999.1.1.1", "1.2.3", "::ffff::1", "cloudflare"];

  for (const value of junk) {
    it(`rejects ${JSON.stringify(value)}`, () => {
      assert.equal(isCloudflareIp(value), false);
    });
  }

  it("rejects null and undefined", () => {
    assert.equal(isCloudflareIp(null), false);
    assert.equal(isCloudflareIp(undefined), false);
  });
});

describe("isCloudflareIp — IPv4 wearing an IPv6 costume", () => {
  it("matches an IPv4-mapped Cloudflare address", () => {
    assert.equal(isCloudflareIp("::ffff:104.16.0.1"), true);
  });

  it("does not match an IPv4-mapped visitor address", () => {
    assert.equal(isCloudflareIp("::ffff:203.0.113.50"), false);
  });
});
