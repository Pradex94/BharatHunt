/**
 * Telling "the database said no" apart from "the database never answered".
 *
 * `createProduct` branches on this to decide what a maker is told after a failed
 * insert. Get it wrong in one direction and a real constraint violation is
 * reported as an unconfirmed save; get it wrong in the other and a launch that
 * may already be in the table is reported as failed, which invites the resubmit
 * that duplicates it. The shapes below are the ones postgrest-js actually
 * produces (see the note on `isTransportError`).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isMissingColumnError, isTransportError } from "../lib/supabase/errors.ts";

describe("isTransportError", () => {
  it("recognises the abort postgrest-js reports when a connection stalls", () => {
    assert.equal(
      isTransportError({
        message: "AbortError: This operation was aborted",
        code: "",
      }),
      true,
    );
  });

  it("recognises a failed connection", () => {
    assert.equal(isTransportError({ message: "TypeError: fetch failed", code: "" }), true);
    assert.equal(isTransportError({ message: "FetchError: network timeout", code: "" }), true);
  });

  it("does not claim a genuine Postgres error never reached the database", () => {
    // A unique violation: the row was seen, judged and rejected.
    assert.equal(
      isTransportError({ message: "duplicate key value violates unique constraint", code: "23505" }),
      false,
    );
    // The review trigger refusing a self-published launch.
    assert.equal(
      isTransportError({
        message: "A product is published by review, not by its creator",
        code: "23514",
      }),
      false,
    );
    // PostgREST's own "no rows returned" from `.single()`.
    assert.equal(isTransportError({ message: "JSON object requested", code: "PGRST116" }), false);
  });

  it("is not fooled by a coded error that merely mentions an error class", () => {
    assert.equal(
      isTransportError({ message: "TypeError: bad input syntax", code: "22P02" }),
      false,
      "a code means the database answered, whatever the message says",
    );
  });

  it("handles the empty cases without throwing", () => {
    assert.equal(isTransportError(null), false);
    assert.equal(isTransportError(undefined), false);
    assert.equal(isTransportError({}), false);
    assert.equal(isTransportError({ message: "", code: "" }), false);
  });

  it("stays disjoint from the missing-column fallback", () => {
    // Both predicates guard the same `writeWithOptionalColumns` result, so an
    // error must never look like both — that would retry a column fallback on a
    // request that never reached the schema at all.
    const stall = { message: "AbortError: This operation was aborted", code: "" };
    assert.equal(isTransportError(stall), true);
    assert.equal(isMissingColumnError(stall), false);

    const missingColumn = { message: "column products.launch_state does not exist", code: "42703" };
    assert.equal(isMissingColumnError(missingColumn), true);
    assert.equal(isTransportError(missingColumn), false);
  });
});
