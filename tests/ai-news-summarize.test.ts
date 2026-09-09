import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  composeSummary,
  summaryWordCount,
  SUMMARY_MAX_WORDS,
} from "../lib/ai-news/summarize.ts";

/**
 * The composed summary.
 *
 * The property that matters most is negative and is asserted first: **no
 * sentence a publisher wrote ever reaches the output.** The feed's excerpt is
 * not a parameter of `composeSummary` at all, which is the strongest possible
 * form of that guarantee, and the test below pins it by passing prose that must
 * not appear.
 */

const PUBLISHER_PROSE =
  "In a sweeping announcement on Tuesday morning, the company revealed that its newest system would be made available to enterprise customers in a staged rollout beginning next quarter.";

describe("originality", () => {
  it("never contains the publisher's own prose", () => {
    const summary = composeSummary({
      headline: "OpenAI launches a new reasoning model",
      category: "AI Models",
      entities: ["OpenAI"],
      sources: ["TechCrunch"],
      // Not a parameter — passing it through an object spread proves it has
      // nowhere to go even if a caller tried.
      ...({ excerpt: PUBLISHER_PROSE } as Record<string, unknown>),
    });

    assert.ok(summary);
    for (const phrase of ["sweeping announcement", "staged rollout", "enterprise customers"]) {
      assert.ok(!summary!.includes(phrase), `leaked: ${phrase}`);
    }
  });

  it("restates the headline rather than paraphrasing it", () => {
    // Paraphrasing is how a summary acquires a claim the article never made,
    // and nothing here can check one.
    const summary = composeSummary({
      headline: "Anthropic ships a longer context window",
      category: "AI Models",
      sources: ["Ars Technica"],
    });
    assert.ok(summary!.startsWith("Anthropic ships a longer context window."));
  });
});

describe("the coverage sentence — what an RSS reader cannot say", () => {
  it("names the single publication rather than counting to one", () => {
    const summary = composeSummary({
      headline: "OpenAI launches a new reasoning model",
      category: "AI Models",
      sources: ["TechCrunch"],
    });
    assert.ok(summary!.includes("Reported by TechCrunch."));
    assert.ok(!summary!.includes("1 source"));
  });

  it("counts both when two cover it", () => {
    const summary = composeSummary({
      headline: "OpenAI launches a new reasoning model",
      category: "AI Models",
      sources: ["TechCrunch", "The Verge"],
    });
    assert.ok(summary!.includes("TechCrunch and The Verge have both covered it."));
  });

  it("counts sources, not articles, and never double-counts one", () => {
    const summary = composeSummary({
      headline: "OpenAI launches a new reasoning model",
      category: "AI Models",
      sources: ["TechCrunch", "TechCrunch", "The Verge", "Reuters", "Wired"],
    });
    // Four distinct publications from five article rows.
    assert.ok(summary!.includes("4 sources have covered it so far"));
  });
});

describe("entities", () => {
  it("names one subject in the singular", () => {
    const summary = composeSummary({
      headline: "OpenAI launches a new reasoning model",
      category: "AI Models",
      entities: ["OpenAI"],
      sources: ["TechCrunch"],
    });
    assert.ok(summary!.includes("The story centres on OpenAI."));
  });

  it("lists the rest in readable English", () => {
    const summary = composeSummary({
      headline: "OpenAI and Microsoft extend their agreement",
      category: "AI Models",
      entities: ["OpenAI", "Microsoft", "Sam Altman"],
      sources: ["Reuters"],
    });
    assert.ok(summary!.includes("It centres on OpenAI, and also names Microsoft and Sam Altman."));
  });

  it("says nothing about entities when none were extracted", () => {
    const summary = composeSummary({
      headline: "A new benchmark for agentic evaluation appears",
      category: "AI Research",
      sources: ["arXiv"],
    });
    assert.ok(!summary!.includes("centres on"));
  });
});

describe("filing and region", () => {
  it("says how the story was filed", () => {
    const summary = composeSummary({
      headline: "Sarvam AI raises a Series A round from Indian investors",
      category: "AI Funding",
      entities: ["Sarvam AI"],
      sources: ["Inc42", "Entrackr", "YourStory"],
    });
    assert.ok(summary!.includes("Bharat Hunt files it under AI Funding"));
  });

  it("marks India coverage as such", () => {
    const summary = composeSummary({
      headline: "Sarvam AI raises a Series A round from Indian investors",
      category: "AI Funding",
      region: "india",
      entities: ["Sarvam AI"],
      sources: ["Inc42", "Entrackr", "YourStory"],
    });
    assert.ok(summary!.includes("India coverage"));
  });

  it("includes both categories when a sub-category was assigned", () => {
    const summary = composeSummary({
      headline: "Meta open-sources a coding model for developers",
      category: "AI Coding",
      subCategory: "Open Source AI",
      entities: ["Meta"],
      sources: ["The Verge"],
    });
    assert.ok(summary!.includes("AI Coding and Open Source AI"));
  });
});

describe("length", () => {
  it("never exceeds the 80-word ceiling", () => {
    const summary = composeSummary({
      headline:
        "OpenAI, Microsoft, Anthropic and Google DeepMind jointly announce an unusually long headline about a new interoperability standard for autonomous agents across enterprise deployments",
      category: "AI Agents",
      subCategory: "Enterprise AI",
      region: "india",
      entities: ["OpenAI", "Microsoft", "Anthropic"],
      sources: ["Reuters", "TechCrunch", "The Verge", "Bloomberg", "Wired"],
    });
    assert.ok(
      summaryWordCount(summary) <= SUMMARY_MAX_WORDS,
      `${summaryWordCount(summary)} words`,
    );
  });

  it("drops whole sentences rather than truncating one mid-claim", () => {
    const summary = composeSummary({
      headline:
        "OpenAI, Microsoft, Anthropic and Google DeepMind jointly announce an unusually long headline about a new interoperability standard for autonomous agents across enterprise deployments",
      category: "AI Agents",
      entities: ["OpenAI", "Microsoft", "Anthropic"],
      sources: ["Reuters", "TechCrunch", "The Verge"],
    });
    assert.ok(summary!.trimEnd().endsWith("."));
    assert.ok(!summary!.includes("…"));
  });

  it("adds the category's definition when a thin story needs substance", () => {
    // Real substance, not filler: the hint is the definition the classifier
    // implements, so it says something true rather than something invented.
    const summary = composeSummary({
      headline: "Muse is Meta's personal AI agent",
      category: "AI Agents",
      entities: ["Meta"],
      sources: ["Meta"],
    });
    assert.ok(summary!.includes("the section covering"));
  });

  it("leaves a rich story alone rather than padding it", () => {
    const summary = composeSummary({
      headline: "OpenAI and Microsoft extend their agreement through the end of the decade",
      category: "AI Models",
      subCategory: "Enterprise AI",
      entities: ["OpenAI", "Microsoft", "Sam Altman"],
      sources: ["Reuters", "TechCrunch", "The Verge", "Bloomberg"],
    });
    assert.ok(!summary!.includes("the section covering"));
    assert.ok(!summary!.includes("Open the original report"));
  });
});

describe("degradation", () => {
  it("returns null rather than inventing a summary from nothing", () => {
    assert.equal(composeSummary({ headline: "" }), null);
    assert.equal(composeSummary({ headline: "Short" }), null);
  });

  it("survives a headline with no category, entities or sources", () => {
    const summary = composeSummary({ headline: "Something notable happened in AI today" });
    assert.ok(summary);
    assert.ok(summary!.startsWith("Something notable happened in AI today."));
  });

  it("strips a masthead the feed appended to the headline", () => {
    const summary = composeSummary({
      headline: "Anthropic ships a new Claude - Ars Technica",
      category: "AI Models",
      sources: ["Ars Technica"],
    });
    assert.ok(summary!.startsWith("Anthropic ships a new Claude."));
  });
});
