import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { classifyArticle } from "../lib/ai-news/classify.ts";
import { AI_RELEVANCE_MIN, AUTO_PUBLISH_RELEVANCE } from "../lib/ai-news/constants.ts";
import { discoverOrganisation, extractEntities } from "../lib/ai-news/entities.ts";

/**
 * The relevance filter and the classifier.
 *
 * The first test is the brief's own example, verbatim, because it is the pair
 * that defines the whole filter: "New smartphone launched" is not AI coverage
 * and "New smartphone launches with on-device AI model" is.
 */

describe("AI relevance — the section 10 pair", () => {
  it("rejects a phone launch", () => {
    const result = classifyArticle({ title: "New smartphone launched" });
    assert.equal(result.isAiRelated, false);
    assert.ok(result.relevanceScore < AI_RELEVANCE_MIN);
    assert.ok(result.rejectedReason);
    // A rejection carries no category, so nothing downstream can file it.
    assert.equal(result.category, null);
  });

  it("keeps the same phone launch once it is about an on-device model", () => {
    const result = classifyArticle({
      title: "New smartphone launches with on-device AI model",
    });
    assert.equal(result.isAiRelated, true);
    assert.ok(result.relevanceScore >= AI_RELEVANCE_MIN);
    assert.ok(result.category);
  });
});

describe("AI relevance — the rest of a general tech feed", () => {
  const rejected = [
    "Best deals on wireless earbuds this week",
    "Bitcoin climbs past its previous high",
    "India beat Australia by six wickets",
    "Zomato launches a new delivery fee structure",
  ];

  for (const title of rejected) {
    it(`rejects: ${title}`, () => {
      assert.equal(classifyArticle({ title }).isAiRelated, false);
    });
  }

  const kept = [
    "Anthropic releases a new Claude model with a longer context window",
    "Sarvam AI raises $41M to build Indian language LLMs",
    "EU AI Act enforcement begins for general-purpose models",
    "Figure unveils a humanoid robot that learns from video",
  ];

  for (const title of kept) {
    it(`keeps: ${title}`, () => {
      assert.equal(classifyArticle({ title }).isAiRelated, true);
    });
  }
});

describe("the source prior", () => {
  it("cannot on its own certify an article as AI coverage", () => {
    // This is the property that keeps the relevance filter alive for official
    // sources: a lab's blog post about datacentre networking still has to say
    // *something* about AI. `sourcePriorFor("official")` is 0.30, below the
    // 0.35 bar, deliberately.
    const result = classifyArticle({ title: "Our new office in Dublin", sourcePrior: 0.3 });
    assert.equal(result.isAiRelated, false);
  });

  it("carries a research feed's untyped paper title, which has no lexicon terms", () => {
    // arXiv cs.AI is AI by definition, and "Sparse Attention with Linear
    // Complexity" contains none of the lexicon's phrases.
    const result = classifyArticle({
      title: "Sparse Attention with Linear Complexity",
      sourcePrior: 0.4,
    });
    assert.equal(result.isAiRelated, true);
  });

  it("stays inside 0..1 however high the prior and the text both are", () => {
    const result = classifyArticle({
      title: "Generative AI large language model artificial intelligence LLM agent",
      excerpt: "machine learning deep learning neural network",
      sourcePrior: 0.9,
    });
    assert.ok(result.relevanceScore <= 1);
  });
});

describe("categories", () => {
  const cases: [title: string, expected: string][] = [
    ["Sarvam AI raises $41M in a Series A led by Lightspeed", "AI Funding"],
    ["OpenAI open-sources its new model weights under Apache 2", "Open Source AI"],
    ["Cursor ships an agent that writes pull requests for developers", "AI Coding"],
    ["Nvidia's next GPU doubles inference throughput per chip", "AI Hardware"],
    ["EU regulators open an antitrust case over AI model licensing", "AI Regulation"],
    ["Figure's humanoid robot learns to fold laundry", "Robotics"],
    ["MeitY expands the IndiaAI Mission with new compute for startups", "AI in India"],
  ];

  for (const [title, expected] of cases) {
    it(`files "${title.slice(0, 40)}…" under ${expected}`, () => {
      assert.equal(classifyArticle({ title }).category, expected);
    });
  }

  it("falls back to the broad bucket rather than guessing a confident wrong label", () => {
    const result = classifyArticle({ title: "A quiet week for artificial intelligence" });
    assert.equal(result.isAiRelated, true);
    assert.equal(result.category, "AI Models");
  });
});

describe("region", () => {
  it("marks an Indian round as India even from a global publication", () => {
    const result = classifyArticle({
      title: "Bengaluru-based Sarvam AI raises ₹340 crore",
      sourceRegion: "global",
    });
    assert.equal(result.region, "india");
  });

  it("marks a global story as global even from an Indian publication", () => {
    const result = classifyArticle({
      title: "OpenAI launches a new reasoning model",
      sourceRegion: "india",
    });
    assert.equal(result.region, "global");
  });

  it("falls back to the source's own region when the text says nothing", () => {
    const result = classifyArticle({
      title: "A new benchmark for agentic evaluation",
      sourceRegion: "india",
    });
    assert.equal(result.region, "india");
  });
});

describe("entity extraction", () => {
  it("prefers the longest match, so DeepMind does not also yield Google", () => {
    const { entities } = extractEntities({ title: "Google DeepMind unveils a new model" });
    const names = entities.map((entity) => entity.name);
    assert.ok(names.includes("Google DeepMind"));
    assert.ok(!names.includes("Google"));
  });

  it("keeps two genuinely separate companies", () => {
    const { entities } = extractEntities({ title: "Google and Microsoft both ship agents" });
    const names = entities.map((entity) => entity.name);
    assert.ok(names.includes("Google"));
    assert.ok(names.includes("Microsoft"));
  });

  it("does not match a name inside a longer word", () => {
    // The failure that makes naive gazetteer matching useless: "meta" inside
    // "metadata", "ai" inside "said".
    const { entities } = extractEntities({ title: "He said the metadata was wrong" });
    assert.deepEqual(entities.map((entity) => entity.name), []);
  });

  it("picks a company over a model as the primary, so grouping is per company", () => {
    // Grouping on the model would merge every OpenAI model story ever written.
    const { primary } = extractEntities({ title: "OpenAI launches GPT-5" });
    assert.equal(primary?.name, "OpenAI");
    assert.equal(primary?.type, "company");
  });

  it("classifies a story whose only signal is a named tool", () => {
    // "Claude Code ships checkpoints" carries no lexicon term at all.
    const result = classifyArticle({ title: "Claude Code ships checkpoints for long sessions" });
    assert.equal(result.isAiRelated, true);
  });
});

describe("discovering an unknown company", () => {
  it("reads the subject of a headline in news style", () => {
    assert.equal(discoverOrganisation("Sarvam AI raises $41M in a Series A"), "Sarvam AI");
    assert.equal(discoverOrganisation("Ema Unlimited launches an agent platform"), "Ema Unlimited");
  });

  it("refuses when the subject is not a name", () => {
    // The precision budget: a wrong entity does not just mislabel a story, it
    // merges it with the wrong one.
    assert.equal(discoverOrganisation("The startup raises a round"), null);
    assert.equal(discoverOrganisation("India launches an AI mission"), null);
    assert.equal(discoverOrganisation("How AI changes hiring"), null);
  });

  it("only fires when the gazetteer found no company", () => {
    const { entities } = extractEntities({ title: "OpenAI raises at a higher valuation" });
    const discovered = entities.filter((entity) => !entity.curated);
    assert.deepEqual(discovered, []);
  });
});

describe("auto-publish", () => {
  it("puts a one-phrase article in the review queue rather than live", () => {
    // A single unambiguous term lands near 0.5 — relevant, and below the
    // auto-publish bar, which is the right place for thin evidence.
    const result = classifyArticle({ title: "A short note on artificial intelligence" });
    assert.ok(result.relevanceScore >= AI_RELEVANCE_MIN);
    assert.ok(result.relevanceScore < AUTO_PUBLISH_RELEVANCE);
  });

  it("publishes an article that is unmistakably AI coverage", () => {
    const result = classifyArticle({
      title: "OpenAI launches a new large language model for AI agents",
      excerpt: "The generative AI model is available to developers today.",
    });
    assert.ok(result.relevanceScore >= AUTO_PUBLISH_RELEVANCE);
  });
});
