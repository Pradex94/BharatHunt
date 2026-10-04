import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cleanLegalName, companyNameFits } from "../lib/daily-agent/domain.ts";
import { verifiedCompanyName } from "../lib/intelligence/connections.ts";

// The eight Daily 5 picks published by 2026-10-04, with the registered name
// the extractor stored for each. Three were wrong.
const LIVE = [
  { raw: "Reach the Traccia team at Algen AI Private Limited", name: "Traccia", web: "https://traccia.ai/", expect: null },
  { raw: "Hospital emergency infrastructure Limited", name: "TRUE ARTIS", web: "https://trueartis.com/", expect: null },
  { raw: "BDO India LLP", name: "Jio Haptik", web: "https://haptik.ai/", expect: null },
  { raw: "Enlight Metals Pvt. Ltd", name: "Enlight Metals", web: "https://enlightmetals.com/", expect: "Enlight Metals Pvt. Ltd" },
  { raw: "QuNu Labs Private Limited", name: "QNu Labs", web: "https://qnulabs.com/", expect: "QuNu Labs Private Limited" },
  { raw: "Fractal Analytics Limited", name: "Fractal Analytics", web: "https://fractal.ai/", expect: "Fractal Analytics Limited" },
  { raw: "Krutrim SI Designs Private Limited", name: "Krutrim Cloud", web: "https://olakrutrim.com/", expect: "Krutrim SI Designs Private Limited" },
  { raw: "CoRover P. Limited", name: "CoRover.ai", web: "https://corover.ai/", expect: "CoRover P. Limited" },
];

describe("cleanLegalName", () => {
  it("drops the sentence leading into a registered name", () => {
    assert.equal(cleanLegalName("Reach the Traccia team at Algen AI Private Limited"), "Algen AI Private Limited");
    assert.equal(cleanLegalName("Copyright Acme & Sons Private Limited"), "Copyright Acme & Sons Private Limited");
    assert.equal(cleanLegalName("  QuNu   Labs Private Limited "), "QuNu Labs Private Limited");
  });

  it("returns null when nothing name-shaped is left", () => {
    assert.equal(cleanLegalName("Hospital emergency infrastructure Limited"), null);
    assert.equal(cleanLegalName(""), null);
    assert.equal(cleanLegalName(null), null);
  });
});

describe("companyNameFits", () => {
  it("accepts the maker's own registered name and rejects auditors and strangers", () => {
    assert.equal(companyNameFits("BDO India LLP", { name: "Jio Haptik", website: "https://haptik.ai" }), false);
    assert.equal(companyNameFits("Fractal Analytics Limited", { name: "Fractal Analytics", website: "https://fractal.ai" }), true);
    // Generic words alone never make a match.
    assert.equal(companyNameFits("Other Labs Private Limited", { name: "QNu Labs", website: "https://qnulabs.com" }), false);
  });
});

describe("verifiedCompanyName on the live Daily 5 picks", () => {
  for (const pick of LIVE) {
    it(`${pick.name} → ${pick.expect ?? "not confirmed"}`, () => {
      assert.equal(verifiedCompanyName(pick.raw, { name: pick.name, website_url: pick.web }), pick.expect);
    });
  }
});
