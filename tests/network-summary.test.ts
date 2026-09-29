import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildNetworkNodes } from "../lib/network-summary.ts";

const BASE = {
  categoryCounts: { "Developer Tools": 16, Finance: 11, Productivity: 41 },
  collectionCounts: { "ai-tools": 32, "saas-products": 7 },
  aiStories24h: 8,
  fundingRounds: 67,
  totalProducts: 148,
};

describe("buildNetworkNodes", () => {
  it("builds six nodes from real counts, routed through the existing slugs", () => {
    const nodes = buildNetworkNodes(BASE);
    assert.deepEqual(
      nodes.map((n) => [n.key, n.href, n.meta]),
      [
        ["ai", "/ai", "8 stories in 24h"],
        ["dev", "/categories/developer-tools", "16 products"],
        ["fintech", "/categories/finance", "11 products"],
        ["startups", "/funding", "67 rounds tracked"],
        ["productivity", "/categories/productivity", "41 products"],
        ["saas", "/collections/saas-products", "7 products"],
      ],
    );
  });

  it("never calls a rolling 24-hour window 'today'", () => {
    for (const node of buildNetworkNodes(BASE)) {
      assert.doesNotMatch(`${node.meta} ${node.ticker}`, /today/i);
    }
  });

  it("drops a missing number but keeps the destination", () => {
    const nodes = buildNetworkNodes({ ...BASE, fundingRounds: 0 });
    const startups = nodes.find((n) => n.key === "startups")!;
    assert.equal(startups.href, "/funding");
    assert.equal(startups.value, null);
    assert.equal(startups.meta, null);
    assert.equal(startups.ticker, null);
  });

  it("falls back to AI products when no stories were covered in 24h", () => {
    const ai = buildNetworkNodes({ ...BASE, aiStories24h: 0 })[0];
    assert.equal(ai.meta, "32 AI products");
  });

  it("does not link an empty SaaS collection", () => {
    const saas = buildNetworkNodes({ ...BASE, collectionCounts: {} }).at(-1)!;
    assert.equal(saas.href, "/marketplace");
    assert.equal(saas.label, "All products");
  });

  it("uses the singular for one", () => {
    const nodes = buildNetworkNodes({ ...BASE, aiStories24h: 1, fundingRounds: 1 });
    assert.equal(nodes[0].meta, "1 story in 24h");
    assert.equal(nodes[3].ticker, "1 funding round tracked");
  });
});
