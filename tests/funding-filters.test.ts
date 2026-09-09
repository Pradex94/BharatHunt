import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  fundingFilterKey,
  hasActiveFilters,
  parseFundingFilters,
  toFundingQuery,
} from "../lib/funding/filters.ts";

/**
 * These tokens arrive from address bars, stale bookmarks, crawlers and a public
 * Server Action that anyone can post arbitrary JSON to. So the parser is a
 * security boundary as much as a convenience: what it refuses is what never
 * reaches the database.
 */

describe("parseFundingFilters — total, and bounded", () => {
  it("defaults everything with no parameters", () => {
    const filters = parseFundingFilters({});
    assert.deepEqual(filters, {
      q: null,
      stages: [],
      industries: [],
      geos: [],
      amount: "any",
      date: "all",
      investor: null,
      sort: "recent",
      page: 1,
    });
  });

  it("reads a multi-select token list", () => {
    assert.deepEqual(parseFundingFilters({ stage: "seed,series-a" }).stages, ["seed", "series-a"]);
  });

  it("drops unknown tokens instead of erroring", () => {
    // A hand-edited "?stage=serious-a" should render the unfiltered feed, not
    // an error page.
    assert.deepEqual(parseFundingFilters({ stage: "serious-a,seed" }).stages, ["seed"]);
  });

  it("de-duplicates repeated tokens", () => {
    assert.deepEqual(parseFundingFilters({ industry: "fintech,fintech,saas" }).industries, [
      "fintech",
      "saas",
    ]);
  });

  it("falls back to the default for an unknown single-select value", () => {
    const filters = parseFundingFilters({ date: "yesterday", amount: "squillions", sort: "chaos" });
    assert.equal(filters.date, "all");
    assert.equal(filters.amount, "any");
    assert.equal(filters.sort, "recent");
  });

  it("bounds the query length and the page number", () => {
    assert.equal(parseFundingFilters({ q: "x".repeat(500) }).q?.length, 120);
    assert.equal(parseFundingFilters({ page: "999999" }).page, 500);
    assert.equal(parseFundingFilters({ page: "-3" }).page, 1);
    assert.equal(parseFundingFilters({ page: "abc" }).page, 1);
  });

  it("treats a whitespace-only query as no query", () => {
    assert.equal(parseFundingFilters({ q: "   " }).q, null);
  });
});

describe("toFundingQuery — resolving tokens into a query", () => {
  const now = new Date("2026-09-09T12:00:00Z");

  it("passes null for every unset filter, not an empty array", () => {
    // `= any('{}')` matches nothing; null is what the SQL reads as "no
    // constraint". Getting this wrong empties the feed rather than filling it.
    const query = toFundingQuery(parseFundingFilters({}), 20, now);
    assert.equal(query.stage_filter, null);
    assert.equal(query.industry_filter, null);
    assert.equal(query.city_filter, null);
    assert.equal(query.min_amount, null);
    assert.equal(query.since_date, null);
  });

  it("expands Series C+ into the two stages it covers", () => {
    const query = toFundingQuery(parseFundingFilters({ stage: "series-c-plus" }), 20, now);
    assert.deepEqual(query.stage_filter, ["Series C", "Series D+"]);
  });

  it("expands Debt into both debt instruments", () => {
    const query = toFundingQuery(parseFundingFilters({ stage: "debt" }), 20, now);
    assert.deepEqual(query.stage_filter, ["Debt", "Venture Debt"]);
  });

  it("expands India into every Indian city bucket, excluding Global", () => {
    const query = toFundingQuery(parseFundingFilters({ geo: "india" }), 20, now);
    assert.ok(query.city_filter);
    assert.ok(query.city_filter.includes("Bengaluru"));
    assert.ok(query.city_filter.includes("Other India"));
    assert.equal(query.city_filter.includes("Global"), false);
  });

  it("restores the canonical casing of an industry token", () => {
    const query = toFundingQuery(parseFundingFilters({ industry: "fintech" }), 20, now);
    assert.deepEqual(query.industry_filter, ["Fintech"]);
  });

  it("resolves a date window against the injected clock", () => {
    const query = toFundingQuery(parseFundingFilters({ date: "7d" }), 20, now);
    assert.equal(query.since_date, "2026-09-02");
  });

  it("resolves 'today' to today", () => {
    const query = toFundingQuery(parseFundingFilters({ date: "today" }), 20, now);
    assert.equal(query.since_date, "2026-09-09");
  });

  it("resolves an amount floor in rupees", () => {
    const query = toFundingQuery(parseFundingFilters({ amount: "10cr" }), 20, now);
    assert.equal(query.min_amount, 100_000_000);
  });

  it("computes the offset from the page and page size", () => {
    const query = toFundingQuery(parseFundingFilters({ page: "3" }), 20, now);
    assert.equal(query.page_offset, 40);
    assert.equal(query.page_limit, 20);
  });

  it("combines filters rather than letting the last one win", () => {
    const query = toFundingQuery(
      parseFundingFilters({ stage: "seed", industry: "fintech", geo: "mumbai", date: "30d", q: "acme" }),
      20,
      now,
    );
    assert.deepEqual(query.stage_filter, ["Seed"]);
    assert.deepEqual(query.industry_filter, ["Fintech"]);
    assert.deepEqual(query.city_filter, ["Mumbai"]);
    assert.equal(query.since_date, "2026-08-10");
    assert.equal(query.search_query, "acme");
  });
});

describe("hasActiveFilters", () => {
  it("is false for the unfiltered feed", () => {
    assert.equal(hasActiveFilters(parseFundingFilters({})), false);
  });

  it("is true for any narrowing filter", () => {
    for (const params of [
      { q: "zepto" },
      { stage: "seed" },
      { industry: "fintech" },
      { geo: "mumbai" },
      { amount: "10cr" },
      { date: "7d" },
      { investor: "Sequoia" },
    ]) {
      assert.equal(hasActiveFilters(parseFundingFilters(params)), true, JSON.stringify(params));
    }
  });

  it("is false when only the page or sort differs", () => {
    // Neither narrows the set, so neither should offer "clear filters".
    assert.equal(hasActiveFilters(parseFundingFilters({ page: "4", sort: "amount" })), false);
  });
});

describe("fundingFilterKey", () => {
  it("is order-independent, so one filter set is one cache entry", () => {
    assert.equal(
      fundingFilterKey(parseFundingFilters({ stage: "seed,series-a" })),
      fundingFilterKey(parseFundingFilters({ stage: "series-a,seed" })),
    );
  });

  it("differs for different filter sets", () => {
    assert.notEqual(
      fundingFilterKey(parseFundingFilters({ stage: "seed" })),
      fundingFilterKey(parseFundingFilters({ stage: "series-a" })),
    );
  });

  it("ignores the page, which is keyed separately by the caller", () => {
    assert.equal(
      fundingFilterKey(parseFundingFilters({ page: "1" })),
      fundingFilterKey(parseFundingFilters({ page: "5" })),
    );
  });
});
