/**
 * Disposable-email detection.
 *
 * The failure this guards against is not "disposable addresses get through" —
 * it is over-blocking. A list of 121k domains applied with a sloppy matcher
 * (suffix matching, say) will happily reject `mail.startup.com` because
 * `mail.tm` is disposable, and the people it locks out are exactly the founders
 * this product is for. So the allow-cases below matter more than the block-cases.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  checkEmail,
  isDisposableDomain,
  normalizeEmail,
} from "../lib/disposable-email.ts";

describe("normalizeEmail", () => {
  it("trims surrounding whitespace", () => {
    assert.equal(normalizeEmail("  test@gmail.com  ")?.email, "test@gmail.com");
  });

  it("lowercases the whole address", () => {
    const result = normalizeEmail("TEST@GMAIL.COM");
    assert.equal(result?.email, "test@gmail.com");
    assert.equal(result?.domain, "gmail.com");
  });

  it("extracts the domain after the last @", () => {
    assert.equal(normalizeEmail("first.last+tag@sub.example.co.uk")?.domain, "sub.example.co.uk");
  });

  it("strips a trailing root dot", () => {
    assert.equal(normalizeEmail("a@example.com.")?.domain, "example.com");
  });

  it("does not rewrite the local part", () => {
    // Gmail treats dots and +tags as the same mailbox, but rewriting what the
    // user typed changes what we store and display. Out of scope here.
    assert.equal(normalizeEmail("first.last+bharat@gmail.com")?.email, "first.last+bharat@gmail.com");
  });

  for (const bad of ["test@", "@gmail.com", "test", "", "   ", "a@b", "a b@gmail.com", "a@@b.com"]) {
    it(`rejects malformed input ${JSON.stringify(bad)}`, () => {
      assert.equal(normalizeEmail(bad), null);
    });
  }

  it("rejects non-strings and absurd lengths", () => {
    assert.equal(normalizeEmail(null), null);
    assert.equal(normalizeEmail(undefined), null);
    assert.equal(normalizeEmail(`${"a".repeat(250)}@gmail.com`), null);
  });
});

describe("isDisposableDomain — blocks known throwaway services", () => {
  for (const domain of ["mailinator.com", "yopmail.com", "guerrillamail.com", "10minutemail.com"]) {
    it(`blocks ${domain}`, () => {
      assert.equal(isDisposableDomain(domain), true);
    });
  }

  it("blocks subdomains of wildcard parents", () => {
    // `10mail.org` is a wildcard entry, so arbitrary subdomains are disposable.
    assert.equal(isDisposableDomain("inbox.10mail.org"), true);
  });

  it("is case- and whitespace-insensitive", () => {
    assert.equal(isDisposableDomain("  MAILINATOR.COM  "), true);
  });
});

describe("isDisposableDomain — does not over-block", () => {
  const legitimate = [
    // Mainstream consumer providers.
    "gmail.com",
    "outlook.com",
    "hotmail.com",
    "yahoo.com",
    "icloud.com",
    "proton.me",
    "protonmail.com",
    "zoho.com",
    // Indian providers and ISPs, which a naive list can catch.
    "rediffmail.com",
    // Custom / business / startup / university domains — the whole point.
    "startup.com",
    "mycompany.in",
    "myproduct.io",
    "bharathunt.org",
    "iitb.ac.in",
    "stanford.edu",
  ];

  for (const domain of legitimate) {
    it(`allows ${domain}`, () => {
      assert.equal(isDisposableDomain(domain), false);
    });
  }

  it("does not treat a legitimate domain as disposable because of a shared suffix", () => {
    /*
     * The bug a careless `endsWith` matcher introduces: matching on bare
     * substrings rather than on a label boundary. `mailinator.com` is
     * disposable; a domain that merely *contains* it, or sits under an
     * unrelated parent, is not.
     *
     * Note `notmailinator.com` is deliberately NOT used here despite looking
     * like the obvious case — it is a genuine disposable service and is in the
     * list on its own merits. Asserting it were allowed would encode a false
     * premise and the test would fail for the right reason.
     */
    assert.equal(isDisposableDomain("mail.startup.com"), false);
    assert.equal(isDisposableDomain("mailinator-fanclub.com"), false);
    assert.equal(isDisposableDomain("my-mailinator-notes.io"), false);
    assert.equal(isDisposableDomain("mailinator.com.mycompany.in"), false);
  });

  it("allows an unfamiliar brand-new custom domain", () => {
    assert.equal(isDisposableDomain("some-brand-new-startup-xyz-2026.co"), false);
  });
});

describe("checkEmail — the entry point callers use", () => {
  it("accepts a plain consumer address", () => {
    const result = checkEmail("test@gmail.com");
    assert.deepEqual(result, { ok: true, email: "test@gmail.com", domain: "gmail.com" });
  });

  it("normalizes case and spaces before deciding", () => {
    const result = checkEmail("  TEST@GMAIL.COM  ");
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.email, "test@gmail.com");
  });

  it("rejects a disposable address with the disposable reason", () => {
    const result = checkEmail("test@mailinator.com");
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "disposable");
  });

  it("catches a disposable address behind mixed case and padding", () => {
    const result = checkEmail("  Test@MAILINATOR.com  ");
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "disposable");
  });

  it("rejects malformed input with the malformed reason", () => {
    const result = checkEmail("test@");
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "malformed");
  });

  it("allows a founder on their own domain", () => {
    assert.equal(checkEmail("founder@startup.com").ok, true);
    assert.equal(checkEmail("hello@myproduct.io").ok, true);
    assert.equal(checkEmail("founder@mycompany.in").ok, true);
  });
});
