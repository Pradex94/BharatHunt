import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  discoveryReasons,
  EMPTY_ENGAGEMENT,
  fundingLinkVerified,
  plausibleCompanyName,
} from "../lib/intelligence/connections.ts";

describe("fundingLinkVerified", () => {
  it("links when the name and the product's own domain agree", () => {
    assert.equal(
      fundingLinkVerified({ name: "Krutrim", website_url: "https://www.krutrim.ai/" }, { name: "Krutrim", website: null }),
      true,
    );
    // Legal and generic suffixes fold away on both sides.
    assert.equal(
      fundingLinkVerified({ name: "Sarvam", website_url: "sarvam.ai" }, { name: "Sarvam AI Pvt Ltd", website: null }),
      true,
    );
    assert.equal(
      fundingLinkVerified({ name: "Zoho", website_url: "https://zoho.co.in" }, { name: "Zoho", website: null }),
      true,
    );
  });

  it("keeps the words a domain keeps — 'labs', 'ai' — when comparing", () => {
    // The hard fold reads "QNu Labs" as "qnu"; the domain is qnulabs.com.
    assert.equal(
      fundingLinkVerified({ name: "QNu Labs", website_url: "https://www.qnulabs.com" }, { name: "QNu Labs", website: null }),
      true,
    );
  });

  it("uses the Daily 5 company name when the product is named differently", () => {
    assert.equal(
      fundingLinkVerified(
        { name: "Kruti", companyName: "Krutrim", website_url: "https://krutrim.com" },
        { name: "Krutrim", website: null },
      ),
      true,
    );
  });

  it("refuses a name match the domain does not back up", () => {
    assert.equal(
      fundingLinkVerified({ name: "Pulse", website_url: "https://getpulse-habits.app" }, { name: "Pulse", website: null }),
      false,
    );
  });

  it("refuses a different company with a matching domain label but another name", () => {
    assert.equal(
      fundingLinkVerified({ name: "Acme Notes", website_url: "https://acme.com" }, { name: "Acme", website: null }),
      false,
    );
  });

  it("trusts a recorded startup website over names, both ways", () => {
    assert.equal(
      fundingLinkVerified({ name: "Anything", website_url: "https://app.example.in" }, { name: "Else", website: "example.in" }),
      true,
    );
    assert.equal(
      fundingLinkVerified({ name: "Krutrim", website_url: "https://krutrim.ai" }, { name: "Krutrim", website: "https://other.com" }),
      false,
    );
  });

  it("never links without an own website, on shared hosting, or for short names", () => {
    assert.equal(fundingLinkVerified({ name: "Krutrim", website_url: null }, { name: "Krutrim", website: null }), false);
    assert.equal(
      fundingLinkVerified({ name: "Krutrim", website_url: "https://www.linkedin.com/company/krutrim" }, { name: "Krutrim", website: null }),
      false,
    );
    assert.equal(
      fundingLinkVerified({ name: "Acmeco", website_url: "https://acmeco.vercel.app" }, { name: "Acmeco", website: null }),
      false,
    );
    assert.equal(fundingLinkVerified({ name: "Zo", website_url: "https://zo.in" }, { name: "Zo", website: null }), false);
  });
});

describe("plausibleCompanyName", () => {
  it("keeps names and drops extracted sentences", () => {
    assert.equal(plausibleCompanyName("Krutrim SI Designs Private Limited"), "Krutrim SI Designs Private Limited");
    assert.equal(plausibleCompanyName("  Enlight   Metals Pvt. Ltd "), "Enlight Metals Pvt. Ltd");
    assert.equal(plausibleCompanyName("Reach the Traccia team at Algen AI Private Limited"), null);
    assert.equal(plausibleCompanyName(""), null);
    assert.equal(plausibleCompanyName(null), null);
  });
});

describe("discoveryReasons", () => {
  it("says nothing when nothing clears its floor", () => {
    assert.deepEqual(discoveryReasons({ ...EMPTY_ENGAGEMENT, visitors: 9, saves: 1 }), []);
  });

  it("states recorded counts with their window", () => {
    const reasons = discoveryReasons(
      { days: 30, visitors: 1842, websiteClicks: 483, saves: 1, compares: 2, discoveryClicks: 0 },
      { risingScore: 2, daily5Date: "2026-10-02", daily5Label: "2 October 2026" },
    );
    assert.deepEqual(reasons, [
      "Attention is rising: more activity in the last 3 days than in the week before.",
      "1,842 people viewed it on BharatHunt in the last 30 days.",
      "483 visits to its website came from BharatHunt in the last 30 days.",
      "Added to 2 comparisons in the last 30 days.",
      "Picked for BharatHunt Daily 5 on 2 October 2026.",
    ]);
  });
});
