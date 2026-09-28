import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  cityHref,
  cityLabel,
  geoTokenForCity,
  industryHref,
  investorHref,
} from "../lib/funding/links.ts";

/**
 * These links are how the KPI tiles, charts and rankings feed back into the
 * filtered feed, so each must produce a token `parseFundingFilters` accepts.
 */
describe("funding links", () => {
  it("maps a stored city bucket to its geography filter token", () => {
    assert.equal(geoTokenForCity("Bengaluru"), "bengaluru");
    assert.equal(geoTokenForCity("Delhi NCR"), "delhi-ncr");
    assert.equal(geoTokenForCity("Other India"), "other");
    assert.equal(geoTokenForCity("Global"), "global");
  });

  it("never resolves a city to the India roll-up", () => {
    // "india" contains every Indian bucket; a city link must narrow to one.
    assert.notEqual(geoTokenForCity("Mumbai"), "india");
  });

  it("returns null for an unknown bucket instead of a dead filter", () => {
    assert.equal(geoTokenForCity("Atlantis"), null);
    assert.equal(cityHref("Atlantis"), null);
  });

  it("builds feed links that land on the feed", () => {
    assert.equal(cityHref("Pune"), "/funding?geo=pune#funding-feed");
    assert.equal(industryHref("AI"), "/funding?industry=ai#funding-feed");
    assert.equal(
      investorHref("Accel & Partners"),
      "/funding?investor=Accel%20%26%20Partners#funding-feed",
    );
  });

  it("names the roll-up bucket as a place a reader recognises", () => {
    assert.equal(cityLabel("Other India"), "Rest of India");
    assert.equal(cityLabel("Chennai"), "Chennai");
  });
});
