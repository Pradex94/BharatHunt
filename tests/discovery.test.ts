import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { deriveKnowledge, knowledgeAttributes, type KnowledgeInput } from "../lib/intelligence/knowledge.ts";
import { describeRequest, parseMatchQuery, rankMatches, type MatchRequest } from "../lib/intelligence/match.ts";
import { dedupBucket, MAX_EVENTS_PER_BEACON, parseSignalPayload } from "../lib/signal-events.ts";
import { cleanListTitle, listSlug, LIST_SLUG_PATTERN } from "../lib/lists.ts";
import { stem } from "../lib/intelligence/text.ts";

let seq = 0;
function product(overrides: Partial<KnowledgeInput> & { upvote_count?: number; published_at?: string | null }) {
  seq += 1;
  const input = {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    name: `Product ${seq}`,
    tagline: "",
    description: "",
    category: "Productivity",
    pricing_type: "free",
    tags: [] as string[],
    website_url: "https://example.com",
    github_url: null,
    launch_state: null,
    launch_state_source: null,
    source: "maker",
    platform_links: {},
    upvote_count: 0,
    comment_count: 0,
    published_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
  return { ...input, knowledge: deriveKnowledge(input) };
}

const request = (query: string, extra: Partial<MatchRequest> = {}): MatchRequest => ({
  query,
  budget: "any",
  audience: null,
  category: null,
  ...extra,
});

describe("stem", () => {
  it("folds -ies and -ie to the same stem, so calories find calorie", () => {
    assert.equal(stem("calories"), stem("calorie"));
    assert.equal(stem("categories"), stem("category"));
  });
});

describe("parseMatchQuery", () => {
  it("reads budget words as a preference and keeps them out of concepts", () => {
    const parsed = parseMatchQuery("I need a cheap AI video editor for YouTube on a budget");
    assert.equal(parsed.budgetPreference, "free-plan");
    assert.equal(parsed.wantsAi, true);
    assert.ok(!parsed.concepts.includes("personal-finance"), "\"budget\" must not read as personal finance");
    assert.equal(parsed.concepts[0], "video-editing", "the specific ask outranks the platform");
  });

  it("flags a price it cannot check, and knows strict free", () => {
    assert.equal(parseMatchQuery("whatsapp tool under ₹500/month").mentionedPrice, true);
    assert.equal(parseMatchQuery("a completely free resume builder").budgetPreference, "free");
  });

  it("describes what it understood", () => {
    assert.equal(describeRequest(parseMatchQuery("free pdf tools")), "PDF tools");
    assert.equal(describeRequest(parseMatchQuery("xyzzy")), null);
  });
});

describe("rankMatches", () => {
  const crm = product({ name: "LeadDesk", tagline: "A simple CRM for freelancers and small teams", upvote_count: 3 });
  const popular = product({ name: "MegaSuite", tagline: "All-in-one business software", description: "Sales tools and more.", upvote_count: 5000 });
  const paid = product({ name: "PipeKing", tagline: "CRM and sales pipeline for agencies", pricing_type: "paid" });
  const unrelated = product({ name: "Snapcal", tagline: "Track calories with a photo" });

  it("puts relevance above popularity", () => {
    const { results } = rankMatches(request("I need a CRM for my small startup"), [popular, crm, paid, unrelated]);
    assert.equal(results[0].product.id, crm.id);
    assert.ok(!results.some((result) => result.product.id === unrelated.id));
  });

  it("treats the explicit budget as a hard filter", () => {
    const { results } = rankMatches(request("crm", { budget: "free-plan" }), [crm, paid]);
    assert.deepEqual(results.map((result) => result.product.id), [crm.id]);
  });

  it("explains only with the listing's own words and fields", () => {
    const { results } = rankMatches(request("free crm"), [crm]);
    assert.equal(results[0].explanation, "You asked for CRM — its tagline says “CRM”. It is listed as free.");
  });

  it("returns nothing rather than padding", () => {
    assert.deepEqual(rankMatches(request("xyzzy plugh"), [crm, popular]).results, []);
  });

  it("filters to AI-first when the AI category is chosen", () => {
    const ai = product({ tagline: "AI-powered CRM for startups" });
    const { results } = rankMatches(request("crm", { category: "ai" }), [crm, ai]);
    assert.deepEqual(results.map((result) => result.product.id), [ai.id]);
  });

  it("labels a match strong only when the request's words appear too", () => {
    const vague = product({ name: "FitWear", tagline: "Premium activewear" });
    const exact = product({ name: "CalTrack", tagline: "Track calories and nutrition" });
    const { results } = rankMatches(request("track my calories"), [vague, exact]);
    assert.equal(results.find((result) => result.product.id === exact.id)?.level, "strong");
    assert.notEqual(results.find((result) => result.product.id === vague.id)?.level, "strong");
  });
});

describe("knowledgeAttributes", () => {
  it("derives filter flags from evidence only", () => {
    const flags = knowledgeAttributes(
      deriveKnowledge({
        id: "x",
        name: "Snap",
        tagline: "AI photo editor that runs entirely in your browser",
        description: "",
        category: "Design Tools",
        pricing_type: "freemium",
        tags: [],
        platform_links: { ios: "https://apps.apple.com/x" },
      }),
    );
    assert.deepEqual(flags.sort(), ["ai-first", "free-plan", "mobile", "privacy"]);
  });
});

describe("parseSignalPayload", () => {
  const id = "11111111-2222-4333-8444-555555555555";

  it("keeps valid events and drops the rest", () => {
    const parsed = parseSignalPayload({
      events: [
        { e: "view", p: id, s: "product" },
        { e: "view", p: id },
        { e: "hack", p: id },
        { e: "website_click", p: "not-a-uuid" },
        { e: "website_click", p: id.toUpperCase(), s: "<script>" },
      ],
    });
    assert.deepEqual(parsed, [
      { event: "view", productId: id, surface: "product" },
      { event: "website_click", productId: id, surface: null },
    ]);
  });

  it("caps a beacon and survives garbage", () => {
    const many = Array.from({ length: 40 }, (_, index) => ({
      e: "match_impression",
      p: `11111111-2222-4333-8444-${String(index).padStart(12, "0")}`,
    }));
    assert.equal(parseSignalPayload({ events: many }).length, MAX_EVENTS_PER_BEACON);
    assert.deepEqual(parseSignalPayload(null), []);
    assert.deepEqual(parseSignalPayload({ events: "x" }), []);
  });

  it("buckets by the hour", () => {
    assert.equal(dedupBucket(new Date("2026-10-03T10:59:59Z")), dedupBucket(new Date("2026-10-03T10:00:00Z")));
    assert.notEqual(dedupBucket(new Date("2026-10-03T11:00:00Z")), dedupBucket(new Date("2026-10-03T10:59:59Z")));
  });
});

describe("lists", () => {
  it("makes readable, unique, valid slugs", () => {
    const slug = listSlug("My AI Startup Stack!", () => 0);
    assert.equal(slug, "my-ai-startup-stack-aaaa");
    assert.match(listSlug("✨✨", () => 0.5), /^list-[a-z0-9]{4}$/);
    assert.ok(LIST_SLUG_PATTERN.test(listSlug("x".repeat(200))));
  });

  it("cleans titles", () => {
    assert.equal(cleanListTitle("  Tools   to try "), "Tools to try");
    assert.equal(cleanListTitle("   "), null);
    assert.equal(cleanListTitle(42), null);
  });
});

describe("comparison pages", async () => {
  const { pairSlug, pairSplits, qualifyPairs, MAX_PAIR_RANK } = await import("../lib/intelligence/compare-pairs.ts");
  const { describePair } = await import("../lib/intelligence/compare.ts");
  const side = (slug: string, indexable = true) => ({ id: `id-${slug}`, slug, name: slug.toUpperCase(), indexable });

  it("has one canonical URL per pair", () => {
    assert.equal(pairSlug("zeta", "alpha"), "alpha-vs-zeta");
    assert.equal(pairSlug("alpha", "zeta"), "alpha-vs-zeta");
  });

  it("splits ambiguous slugs every possible way", () => {
    assert.deepEqual(pairSplits("a-vs-b"), [["a", "b"]]);
    assert.deepEqual(pairSplits("x-vs-y-vs-z"), [["x", "y-vs-z"], ["x-vs-y", "z"]]);
    assert.deepEqual(pairSplits("nothing-here"), []);
  });

  it("qualifies only similar, same-job, indexable pairs — once each", () => {
    const edge = (from: string, to: string, extra: Partial<{ rank: number; score: number; shared: string[]; indexable: boolean }> = {}) => ({
      from: side(from),
      to: side(to, extra.indexable ?? true),
      rank: extra.rank ?? 1,
      score: extra.score ?? 0.4,
      sharedConcepts: extra.shared ?? ["pdf"],
    });
    const pairs = qualifyPairs([
      edge("lumo", "nexvert"),
      edge("nexvert", "lumo", { score: 0.5 }),
      edge("a", "b", { rank: MAX_PAIR_RANK + 1 }),
      edge("c", "d", { score: 0.1 }),
      edge("e", "f", { shared: ["ai"] }),
      edge("g", "h", { indexable: false }),
    ]);
    assert.deepEqual(pairs.map((pair) => [pair.slug, pair.score]), [["lumo-vs-nexvert", 0.5]]);
    assert.equal(pairs[0].path, "/compare/lumo-vs-nexvert");
  });

  it("introduces a pair from listing fields and never declares a winner", () => {
    const text = describePair(
      product({ name: "LumoPDF", tagline: "PDF tools", pricing_type: "free", launch_state: "IN-UP", launch_state_source: "maker" }),
      product({ name: "Nexvert", tagline: "Convert PDFs", pricing_type: "freemium" }),
      ["pdf", "ai"],
    );
    assert.equal(
      text,
      "LumoPDF and Nexvert are both listed on Bharat Hunt for PDF tools. LumoPDF is free to use and based in Uttar Pradesh; Nexvert is free to start, with paid plans. The table lines up what each listing says — Bharat Hunt doesn't pick a winner.",
    );
    assert.doesNotMatch(text, /\b(better|best|winner is|cheaper)\b/i);
  });
});
