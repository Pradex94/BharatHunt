/**
 * Guards the extraction CI depends on.
 *
 * The parity job is only as good as its ability to find the functions it is
 * meant to compare. Two shell versions of this silently extracted nothing (see
 * the note in `scripts/extract-search-functions.mjs`), and an extraction that
 * returns nothing makes the parity check pass vacuously — the worst possible
 * failure mode for a check whose job is catching silent drift.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  FUNCTION_NAMES,
  MIGRATION_PATH,
  extractAll,
  extractFunction,
} from "../scripts/extract-search-functions.mjs";

const migration: string = readFileSync(MIGRATION_PATH, "utf8");

describe("extract-search-functions", () => {
  it("finds all three normalisers in the real migration", () => {
    const sql: string = extractAll(migration);
    const count = (sql.match(/^create or replace function/gm) ?? []).length;
    assert.equal(count, 3, "expected exactly three function definitions");
  });

  for (const name of FUNCTION_NAMES) {
    it(`extracts public.${name} with a closing $$;`, () => {
      const block: string = extractFunction(migration, name);
      assert.ok(
        block.startsWith(`create or replace function public.${name}(`),
        `block for ${name} starts with the wrong line`,
      );
      assert.ok(block.trimEnd().endsWith("$$;"), `block for ${name} is not terminated`);
      // A definition this short means the terminator matched too early.
      assert.ok(block.split("\n").length > 5, `block for ${name} looks truncated`);
    });
  }

  it("keeps the immutability markers the generated columns depend on", () => {
    // Postgres refuses a generated column backed by a non-IMMUTABLE function,
    // so losing these turns into a migration failure, not a wrong result.
    const sql: string = extractAll(migration);
    const immutables = (sql.match(/^immutable$/gm) ?? []).length;
    assert.equal(immutables, 3, "every extracted function must still be IMMUTABLE");
  });

  it("throws loudly when a function is missing rather than returning nothing", () => {
    assert.throws(
      () => extractFunction("-- an unrelated migration\n", "search_normalize"),
      /Could not find/,
      "a missing function must fail, not yield empty SQL",
    );
  });

  it("throws when a function is never terminated", () => {
    assert.throws(
      () => extractFunction("create or replace function public.search_tokens(value text)\n", "search_tokens"),
      /no closing/,
    );
  });
});
