/**
 * The search-normalisation contract.
 *
 * `lib/search.ts` and `public.search_normalize()` in
 * `supabase/migrations/20260809120000_product_search.sql` are hand-maintained
 * mirrors of each other. If they drift, search breaks in a way that is close to
 * invisible: queries still run, they just quietly stop matching. `npm run
 * build` does not catch it. This file is what catches it.
 *
 * It enforces three things:
 *
 *   1. The TypeScript normalisers still produce what they produced when the
 *      golden file was generated. Behaviour changes have to be deliberate.
 *   2. The generated fixtures are current. You cannot edit `lib/search.ts` or
 *      the corpus and leave the SQL parity script describing the old rules.
 *   3. The invariants both implementations rely on hold.
 *
 * What it deliberately does NOT do is talk to Postgres -- `npm test` must run
 * with no database. The SQL half lives in
 * `supabase/tests/search-normalize-parity.sql` and is checked against the same
 * golden file. See tests/README.md.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { MIN_SUGGEST_LENGTH, isSuggestable, matchesNormalized, normalizeSearchText, searchTokens } from "../lib/search.ts";
import { GOLDEN_PATH, SQL_PATH, buildGolden, buildSql, readCorpus, sqlLiteral } from "../scripts/gen-search-fixtures.mjs";

/** One row of the generated golden file. */
type GoldenCase = {
  input: string;
  note: string;
  normalized: string;
  tokens: string[];
};

const golden: { cases: GoldenCase[] } = JSON.parse(readFileSync(GOLDEN_PATH, "utf8"));

describe("normalizeSearchText / searchTokens match the golden corpus", () => {
  for (const testCase of golden.cases) {
    const label = testCase.input === "" ? "(empty string)" : JSON.stringify(testCase.input);

    it(`${label} — ${testCase.note}`, () => {
      assert.equal(
        normalizeSearchText(testCase.input),
        testCase.normalized,
        `normalizeSearchText changed for ${label}`,
      );
      assert.deepEqual(
        searchTokens(testCase.input),
        testCase.tokens,
        `searchTokens changed for ${label}`,
      );
    });
  }
});

describe("generated fixtures are current", () => {
  const regenerated: { cases: GoldenCase[] } = buildGolden(readCorpus());

  it("search-golden.json matches what lib/search.ts produces now", () => {
    assert.deepEqual(
      regenerated.cases,
      golden.cases,
      "Golden fixture is stale. Run: node scripts/gen-search-fixtures.mjs",
    );
  });

  it("search-normalize-parity.sql was generated from this golden file", () => {
    assert.equal(
      readFileSync(SQL_PATH, "utf8").replace(/\r\n/g, "\n"),
      buildSql(regenerated).replace(/\r\n/g, "\n"),
      "SQL parity script is stale. Run: node scripts/gen-search-fixtures.mjs",
    );
  });

  it("every corpus input appears in the golden file exactly once", () => {
    const corpusInputs = (readCorpus() as { input: string }[]).map((entry) => entry.input);
    assert.deepEqual(golden.cases.map((c: GoldenCase) => c.input), corpusInputs);
  });
});

describe("SQL literal escaping", () => {
  it("keeps printable ASCII as-is", () => {
    assert.equal(sqlLiteral("grow easy"), "E'grow easy'");
  });

  it("doubles nothing but escapes quotes and backslashes", () => {
    assert.equal(sqlLiteral("O'Reilly"), "E'O\\'Reilly'");
    assert.equal(sqlLiteral("a\\b"), "E'a\\\\b'");
  });

  it("escapes non-ASCII so the .sql file stays ASCII-only", () => {
    assert.equal(sqlLiteral("é"), "E'\\u00e9'");
    assert.equal(sqlLiteral("​"), "E'\\u200b'");
  });

  it("escapes astral codepoints with \\U", () => {
    assert.equal(sqlLiteral("🚀"), "E'\\U0001f680'");
  });

  it("escapes control characters rather than embedding them", () => {
    assert.equal(sqlLiteral("a\tb\nc"), "E'a\\u0009b\\u000ac'");
  });
});

describe("invariants both implementations depend on", () => {
  const inputs = golden.cases.map((c: GoldenCase) => c.input);

  it("normalisation is idempotent", () => {
    for (const input of inputs) {
      const once = normalizeSearchText(input);
      assert.equal(normalizeSearchText(once), once, `not idempotent for ${JSON.stringify(input)}`);
    }
  });

  it("output contains only [a-z0-9]", () => {
    for (const input of inputs) {
      assert.match(normalizeSearchText(input), /^[a-z0-9]*$/, `stray character from ${JSON.stringify(input)}`);
    }
  });

  it("no token is empty", () => {
    for (const input of inputs) {
      for (const token of searchTokens(input)) {
        assert.notEqual(token, "", `empty token from ${JSON.stringify(input)}`);
      }
    }
  });

  it("every token is a substring of the normalised whole", () => {
    // The ranking bands rely on this: a token match is always a weaker form of
    // a whole-string match, never a different thing.
    for (const input of inputs) {
      const whole = normalizeSearchText(input);
      for (const token of searchTokens(input)) {
        assert.ok(whole.includes(token), `token ${JSON.stringify(token)} not inside ${JSON.stringify(whole)}`);
      }
    }
  });

  it("null and undefined are treated as empty, not as a crash", () => {
    assert.equal(normalizeSearchText(null), "");
    assert.equal(normalizeSearchText(undefined), "");
    assert.deepEqual(searchTokens(null), []);
    assert.deepEqual(searchTokens(undefined), []);
  });
});

describe("the GrowEasy acceptance case", () => {
  // The requirement this whole search architecture was built to satisfy:
  // a product stored as "GrowEasy" must be found by someone typing "grow easy".
  const stored = "GrowEasy";

  for (const typed of ["grow easy", "Grow Easy", "GROW EASY", "grow-easy", "grow_easy", "groweasy", "  grow   easy  "]) {
    it(`"${typed}" matches a product stored as "${stored}"`, () => {
      assert.equal(normalizeSearchText(typed), normalizeSearchText(stored));
      assert.ok(matchesNormalized(stored, typed));
    });
  }

  it("does not match an unrelated product", () => {
    assert.ok(!matchesNormalized("Payflow", "grow easy"));
  });

  it("matches on a partial token, which is how autocomplete feels live", () => {
    assert.ok(matchesNormalized(stored, "grow"));
    assert.ok(matchesNormalized(stored, "easy"));
  });
});

describe("isSuggestable", () => {
  it(`requires ${MIN_SUGGEST_LENGTH} normalised characters`, () => {
    assert.ok(!isSuggestable("a"));
    assert.ok(isSuggestable("ai"));
  });

  it("counts characters after normalisation, not before", () => {
    // Three typed characters, one surviving character: not worth a round trip.
    assert.ok(!isSuggestable("a-!"));
    assert.ok(!isSuggestable("   x   "));
  });

  it("ignores queries that normalise away entirely", () => {
    assert.ok(!isSuggestable("!!!"));
    assert.ok(!isSuggestable("दुकान"));
  });
});
