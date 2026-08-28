/**
 * The Supabase transport gives up, and only retries what is safe to repeat.
 *
 * The bug being guarded against is not "no retry" — it is the two ways a retry
 * layer quietly does the wrong thing: waiting forever on a connection that has
 * stalled (which is what turned a launch into FUNCTION_INVOCATION_TIMEOUT in the
 * first place), and replaying a POST that may already have inserted a row.
 *
 * Everything here runs against an injected `fetchImpl`, so the assertions are
 * about the retry and deadline arithmetic rather than about the network.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createResilientFetch } from "../lib/supabase/resilient-fetch.ts";

/** A fetch that never settles until its signal aborts — i.e. a stalled connection. */
function stallingFetch(calls: { count: number }): typeof fetch {
  return ((_input: RequestInfo | URL, init?: RequestInit) => {
    calls.count += 1;
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const error = new Error("This operation was aborted");
        error.name = "AbortError";
        reject(error);
      });
    });
  }) as typeof fetch;
}

/** A fetch that stalls for the first `failures` calls, then answers. */
function flakyFetch(failures: number, calls: { count: number }): typeof fetch {
  return ((_input: RequestInfo | URL, init?: RequestInit) => {
    calls.count += 1;
    if (calls.count > failures) return Promise.resolve(new Response("ok", { status: 200 }));
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const error = new Error("This operation was aborted");
        error.name = "AbortError";
        reject(error);
      });
    });
  }) as typeof fetch;
}

const silent = () => {};

describe("resilientFetch", () => {
  it("abandons a stalled request instead of waiting on it forever", async () => {
    const calls = { count: 0 };
    const fetcher = createResilientFetch({
      attemptTimeoutMs: 20,
      readAttempts: 1,
      fetchImpl: stallingFetch(calls),
      onRetry: silent,
    });

    const started = Date.now();
    await assert.rejects(() => fetcher("https://example.test/rest/v1/products"));
    // The point of the whole module: bounded, not indefinite.
    assert.ok(Date.now() - started < 2_000, "should give up promptly, not hang");
    assert.equal(calls.count, 1);
  });

  it("retries an idempotent read and returns the attempt that lands", async () => {
    const calls = { count: 0 };
    const fetcher = createResilientFetch({
      attemptTimeoutMs: 20,
      readAttempts: 2,
      fetchImpl: flakyFetch(1, calls),
      onRetry: silent,
    });

    const response = await fetcher("https://example.test/rest/v1/products");
    assert.equal(response.status, 200);
    assert.equal(calls.count, 2, "first attempt stalls, second succeeds");
  });

  it("gives up on a read once its attempts are spent", async () => {
    const calls = { count: 0 };
    const fetcher = createResilientFetch({
      attemptTimeoutMs: 20,
      readAttempts: 2,
      fetchImpl: stallingFetch(calls),
      onRetry: silent,
    });

    await assert.rejects(() => fetcher("https://example.test/rest/v1/products"));
    assert.equal(calls.count, 2);
  });

  it("never replays a write — a stalled POST may already have inserted the row", async () => {
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      const calls = { count: 0 };
      const fetcher = createResilientFetch({
        attemptTimeoutMs: 20,
        readAttempts: 5,
        fetchImpl: stallingFetch(calls),
        onRetry: silent,
      });

      await assert.rejects(() => fetcher("https://example.test/rest/v1/products", { method }));
      assert.equal(calls.count, 1, `${method} must be attempted exactly once`);
    }
  });

  it("treats HEAD as a read — it is how a count query is issued", async () => {
    const calls = { count: 0 };
    const fetcher = createResilientFetch({
      attemptTimeoutMs: 20,
      readAttempts: 2,
      fetchImpl: flakyFetch(1, calls),
      onRetry: silent,
    });

    const response = await fetcher("https://example.test/rest/v1/products", { method: "HEAD" });
    assert.equal(response.status, 200);
    assert.equal(calls.count, 2);
  });

  it("honours a caller's own abort rather than retrying around it", async () => {
    const calls = { count: 0 };
    const fetcher = createResilientFetch({
      attemptTimeoutMs: 5_000,
      readAttempts: 3,
      fetchImpl: stallingFetch(calls),
      onRetry: silent,
    });

    const caller = new AbortController();
    const pending = fetcher("https://example.test/rest/v1/products", { signal: caller.signal });
    caller.abort();

    await assert.rejects(() => pending);
    assert.equal(calls.count, 1, "a deliberate cancellation is an answer, not a failure");
  });

  it("passes the request through untouched when nothing goes wrong", async () => {
    const seen: RequestInit[] = [];
    const fetcher = createResilientFetch({
      fetchImpl: ((_input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(init ?? {});
        return Promise.resolve(new Response("ok", { status: 200 }));
      }) as typeof fetch,
      onRetry: silent,
    });

    const response = await fetcher("https://example.test/rest/v1/products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"name":"x"}',
    });

    assert.equal(response.status, 200);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].method, "POST");
    assert.equal(seen[0].body, '{"name":"x"}');
  });
});
