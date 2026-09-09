import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  authorizeIngest,
  presentedSecret,
  secretMatches,
} from "../lib/funding/ingest-auth.ts";

/**
 * The ingestion endpoint is the only funding write path with no signed-in admin
 * behind it, so these are the tests that matter most in this feature — and
 * almost all of them are negative. A gate is only proven by what it refuses.
 *
 * `Headers` is a global in Node 18+, so the real thing is used here rather than
 * a hand-rolled lookup: header names are matched case-insensitively by the
 * platform, and a fake object would quietly not test that.
 */

const SECRET = "9c1f4b2a-not-a-real-secret-just-long-enough";

function headers(init: Record<string, string> = {}): Headers {
  return new Headers(init);
}

describe("secretMatches", () => {
  it("accepts an exact match", () => {
    assert.equal(secretMatches(SECRET, SECRET), true);
  });

  it("rejects a wrong secret of the same length", () => {
    const wrong = SECRET.slice(0, -1) + "X";
    assert.equal(wrong.length, SECRET.length);
    assert.equal(secretMatches(wrong, SECRET), false);
  });

  it("rejects a correct prefix", () => {
    // The attack the constant-time loop exists to frustrate: guessing the
    // secret one character at a time. A prefix must be exactly as wrong as
    // random noise.
    assert.equal(secretMatches(SECRET.slice(0, 10), SECRET), false);
  });

  it("rejects a longer string that starts with the secret", () => {
    assert.equal(secretMatches(SECRET + "extra", SECRET), false);
  });

  it("rejects the empty string", () => {
    assert.equal(secretMatches("", SECRET), false);
  });

  it("is case sensitive", () => {
    assert.equal(secretMatches(SECRET.toUpperCase(), SECRET), false);
  });

  it("compares every position, not just up to the first difference", () => {
    // Differing in the FIRST character and in the LAST must both be rejected.
    // An early-exit comparison passes this test too — it cannot prove timing —
    // but a truncating one (comparing only min length, or only a prefix) fails,
    // and that is the bug worth a regression test.
    assert.equal(secretMatches("X" + SECRET.slice(1), SECRET), false);
    assert.equal(secretMatches(SECRET.slice(0, -1) + "X", SECRET), false);
  });
});

describe("presentedSecret", () => {
  it("reads an Authorization: Bearer header", () => {
    assert.equal(presentedSecret(headers({ authorization: `Bearer ${SECRET}` })), SECRET);
  });

  it("accepts any casing of the Bearer scheme", () => {
    assert.equal(presentedSecret(headers({ authorization: `bearer ${SECRET}` })), SECRET);
    assert.equal(presentedSecret(headers({ Authorization: `BEARER ${SECRET}` })), SECRET);
  });

  it("trims surrounding whitespace", () => {
    assert.equal(presentedSecret(headers({ authorization: `Bearer   ${SECRET}  ` })), SECRET);
    assert.equal(presentedSecret(headers({ "x-ingest-secret": `  ${SECRET} ` })), SECRET);
  });

  it("falls back to X-Ingest-Secret for schedulers that reserve Authorization", () => {
    assert.equal(presentedSecret(headers({ "x-ingest-secret": SECRET })), SECRET);
  });

  it("prefers Bearer when both headers are present", () => {
    const value = presentedSecret(
      headers({ authorization: `Bearer ${SECRET}`, "x-ingest-secret": "other" }),
    );
    assert.equal(value, SECRET);
  });

  it("does not read a non-Bearer Authorization scheme as a secret", () => {
    // A stray `Basic <base64>` must not be compared raw against the secret.
    assert.equal(presentedSecret(headers({ authorization: `Basic ${SECRET}` })), "");
  });

  it("returns empty when no header is present", () => {
    assert.equal(presentedSecret(headers()), "");
  });
});

describe("authorizeIngest", () => {
  it("503s when no secret is configured — unset means closed, never open", () => {
    // The single most important assertion in this file. If this ever returns
    // ok, one missing environment variable turns a job that makes outbound
    // requests and writes rows into a public endpoint.
    const decision = authorizeIngest(headers({ authorization: `Bearer ${SECRET}` }), undefined);
    assert.deepEqual(decision, {
      ok: false,
      status: 503,
      error: "Ingestion is not configured.",
    });
  });

  it("503s when the configured secret is blank or whitespace", () => {
    for (const configured of ["", "   ", "\n"]) {
      const decision = authorizeIngest(headers({ "x-ingest-secret": configured }), configured);
      assert.equal(decision.ok, false);
      assert.equal(decision.ok === false && decision.status, 503);
    }
  });

  it("401s when the secret is configured and the caller presents none", () => {
    const decision = authorizeIngest(headers(), SECRET);
    assert.deepEqual(decision, { ok: false, status: 401, error: "Unauthorized" });
  });

  it("401s on a wrong secret", () => {
    const decision = authorizeIngest(headers({ authorization: "Bearer wrong" }), SECRET);
    assert.deepEqual(decision, { ok: false, status: 401, error: "Unauthorized" });
  });

  it("401s on a correct prefix of the secret", () => {
    const decision = authorizeIngest(
      headers({ "x-ingest-secret": SECRET.slice(0, -1) }),
      SECRET,
    );
    assert.equal(decision.ok, false);
  });

  it("authorizes a correct secret via either header", () => {
    assert.deepEqual(authorizeIngest(headers({ authorization: `Bearer ${SECRET}` }), SECRET), {
      ok: true,
    });
    assert.deepEqual(authorizeIngest(headers({ "x-ingest-secret": SECRET }), SECRET), {
      ok: true,
    });
  });

  it("tolerates a configured secret stored with stray whitespace", () => {
    // Copy-pasting into a dashboard field is how secrets acquire a trailing
    // newline. Trimming both sides beats an outage nobody can explain.
    assert.deepEqual(authorizeIngest(headers({ "x-ingest-secret": SECRET }), ` ${SECRET}\n`), {
      ok: true,
    });
  });

  it("never reveals which part was wrong", () => {
    // Every rejection with a secret configured is byte-identical.
    const noHeader = authorizeIngest(headers(), SECRET);
    const wrong = authorizeIngest(headers({ authorization: "Bearer nope" }), SECRET);
    const prefix = authorizeIngest(headers({ "x-ingest-secret": SECRET.slice(0, 5) }), SECRET);
    assert.deepEqual(noHeader, wrong);
    assert.deepEqual(wrong, prefix);
  });
});
