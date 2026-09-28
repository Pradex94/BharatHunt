import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { composeSummary } from "../lib/ai-news/summarize.ts";
import {
  buildBrief,
  buildHighlights,
  cardSummary,
  momentum,
  whyItMatters,
  type SignalStory,
} from "../lib/ai-news/signals.ts";
import {
  resolveCategoryFilter,
  sinceHoursFor,
  storyTypeFromSlug,
  companyFromParam,
  AI_CATEGORIES,
  AI_TOPIC_EXPLORER,
} from "../lib/ai-news/constants.ts";

/**
 * The AI hub's derived statements.
 *
 * The property under test throughout is restraint: each helper must say
 * *nothing* when the data does not support a claim — no direction without a
 * previous window, no "why it matters" for a single-source mid-table story, no
 * "today" brief padded with last week's news.
 */

const NOW = new Date("2026-09-29T12:00:00Z");
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();

function story(overrides: Partial<SignalStory> & { id: string }): SignalStory {
  return {
    slug: overrides.id,
    title: `Story ${overrides.id}`,
    summary: null,
    category: "AI Models",
    region: "global",
    trend_score: 50,
    source_count: 1,
    last_seen_at: hoursAgo(2),
    ...overrides,
  };
}

describe("cardSummary", () => {
  it("drops the restated headline and the filing sentence", () => {
    const title = "OpenAI launches a cheaper reasoning model";
    const summary = composeSummary({
      headline: title,
      category: "AI Models",
      entities: ["OpenAI"],
      sources: ["TechCrunch", "The Verge", "Reuters"],
    });
    assert.ok(summary);

    const card = cardSummary(summary, title);
    assert.ok(card);
    assert.ok(!card.toLowerCase().startsWith(title.toLowerCase()), card);
    assert.ok(!card.includes("files it under"), card);
    assert.match(card, /OpenAI/);
    assert.match(card, /3 sources/);
  });

  it("returns null when nothing is left but the headline", () => {
    assert.equal(cardSummary("Google ships Gemini 3.", "Google ships Gemini 3"), null);
    assert.equal(cardSummary(null, "anything"), null);
  });
});

describe("whyItMatters", () => {
  it("says nothing for a single-source story outside the top three", () => {
    assert.equal(whyItMatters({ source_count: 1, category: "AI Tools", region: "global", trend_score: 40 }, 9), null);
  });

  it("leads with coverage breadth when there is some", () => {
    const why = whyItMatters({ source_count: 6, category: "AI Models", region: "global", trend_score: 80 });
    assert.ok(why);
    assert.match(why.signal, /6 independent publications/);
    assert.match(why.audience ?? "", /foundation models/);
  });

  it("uses rank only when the story actually has a score", () => {
    assert.match(
      whyItMatters({ source_count: 1, category: "AI Coding", region: "global", trend_score: 70 }, 2)?.signal ?? "",
      /#2/,
    );
    assert.equal(
      whyItMatters({ source_count: 1, category: "AI Coding", region: "global", trend_score: null }, 1),
      null,
    );
  });

  it("flags India coverage", () => {
    const why = whyItMatters({ source_count: 3, category: "AI Startups", region: "india", trend_score: 60 });
    assert.match(why?.signal ?? "", /India-specific/);
  });
});

describe("momentum", () => {
  it("claims no direction without a comparison", () => {
    assert.equal(momentum(null), null);
    assert.equal(momentum(undefined), null);
    assert.equal(momentum(Number.NaN), null);
  });

  it("buckets real changes", () => {
    assert.equal(momentum(40), "rising");
    assert.equal(momentum(5), "steady");
    assert.equal(momentum(-30), "cooling");
  });
});

describe("buildBrief", () => {
  it("takes the top stories of the last day, in pool order", () => {
    const pool = [
      story({ id: "a", last_seen_at: hoursAgo(3) }),
      story({ id: "old", last_seen_at: hoursAgo(50) }),
      story({ id: "b", last_seen_at: hoursAgo(10) }),
      story({ id: "c", last_seen_at: hoursAgo(20) }),
    ];
    const brief = buildBrief(pool, NOW, { max: 5, min: 3 });
    assert.equal(brief.windowHours, 24);
    assert.deepEqual(brief.stories.map((s) => s.id), ["a", "b", "c"]);
  });

  it("widens to three days on a quiet day, and says so", () => {
    const pool = [
      story({ id: "a", last_seen_at: hoursAgo(3) }),
      story({ id: "b", last_seen_at: hoursAgo(40) }),
      story({ id: "c", last_seen_at: hoursAgo(60) }),
      story({ id: "ancient", last_seen_at: hoursAgo(200) }),
    ];
    const brief = buildBrief(pool, NOW, { max: 5, min: 3 });
    assert.equal(brief.windowHours, 72);
    assert.deepEqual(brief.stories.map((s) => s.id), ["a", "b", "c"]);
  });
});

describe("buildHighlights", () => {
  it("never repeats a story across groups and drops groups of one", () => {
    const pool = [
      story({ id: "m1", category: "AI Models", source_count: 5 }),
      story({ id: "m2", category: "AI Models", source_count: 4 }),
      story({ id: "m3", category: "Open Source AI" }),
      story({ id: "m4", category: "AI Models" }),
      story({ id: "f1", category: "AI Funding" }),
    ];
    const groups = buildHighlights(pool);
    const ids = groups.flatMap((group) => group.stories.map((s) => s.id));
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(!groups.some((group) => group.key === "funding"), "one funding story is not a roundup");
    assert.equal(groups[0].key, "most-covered");
    assert.deepEqual(groups[0].stories.map((s) => s.id), ["m1", "m2"]);
  });

  it("respects excluded ids", () => {
    const pool = [
      story({ id: "a", category: "AI Research" }),
      story({ id: "b", category: "AI Regulation" }),
      story({ id: "c", category: "AI Research" }),
    ];
    const groups = buildHighlights(pool, { exclude: ["a"] });
    assert.deepEqual(groups.flatMap((g) => g.stories.map((s) => s.id)), ["b", "c"]);
  });
});

describe("filter vocabulary", () => {
  it("intersects a topic with a type, and reports a contradiction as empty", () => {
    const research = storyTypeFromSlug("research");
    assert.deepEqual(resolveCategoryFilter("AI Research", research), ["AI Research"]);
    assert.deepEqual(resolveCategoryFilter("AI Funding", research), []);
    assert.deepEqual(resolveCategoryFilter(undefined, research), ["AI Research"]);
    assert.equal(resolveCategoryFilter(undefined, undefined), undefined);
  });

  it("resolves date windows to whole hours, with 'today' in IST", () => {
    assert.equal(sinceHoursFor("24h", NOW), 24);
    assert.equal(sinceHoursFor("7d", NOW), 168);
    assert.equal(sinceHoursFor(undefined, NOW), undefined);
    // 12:00 UTC is 17:30 IST: 17.5 hours since IST midnight, rounded up.
    assert.equal(sinceHoursFor("today", NOW), 18);
    // 18:40 UTC is 00:10 IST the next day: at least one hour, never zero.
    assert.equal(sinceHoursFor("today", new Date("2026-09-29T18:40:00Z")), 1);
  });

  it("accepts only slug-shaped company params", () => {
    assert.equal(companyFromParam("openai"), "openai");
    assert.equal(companyFromParam(" Meta-AI "), "meta-ai");
    assert.equal(companyFromParam("x'; drop table"), undefined);
    assert.equal(companyFromParam(""), undefined);
  });

  it("shows every stored category in the topic explorer exactly once", () => {
    assert.equal(AI_TOPIC_EXPLORER.length, AI_CATEGORIES.length);
    assert.equal(new Set(AI_TOPIC_EXPLORER.map((c) => c.value)).size, AI_CATEGORIES.length);
  });
});
