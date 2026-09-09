import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  findStoryForArticle,
  isSourceDue,
  sourcePriorFor,
  type SourceRow,
  type StoryCandidate,
} from "../lib/ai-news/grouping.ts";
import { AI_RELEVANCE_MIN } from "../lib/ai-news/constants.ts";
import { storyKey } from "../lib/ai-news/normalize.ts";

/**
 * Story grouping — the single most consequential decision in this feature.
 *
 * A wrong answer here does not look like a bug. A missed merge shows one event
 * twice; a false merge silently deletes a story nobody knows is missing. Both
 * failure modes are asserted below.
 */

const NOW = new Date("2026-09-09T12:00:00Z");
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 60 * 60 * 1000);

function candidate(over: Partial<StoryCandidate> = {}): StoryCandidate {
  return {
    id: "story-1",
    story_key: "openai:launches-model-reasoning:2900",
    title: "OpenAI releases new model",
    primary_entity: "openai",
    first_seen_at: hoursAgo(6).toISOString(),
    last_seen_at: hoursAgo(2).toISOString(),
    category: "AI Models",
    region: "global",
    ...over,
  };
}

describe("findStoryForArticle — the section 12 pair", () => {
  it("groups 'OpenAI releases new model' with 'OpenAI launches latest AI model'", () => {
    const match = findStoryForArticle(
      [candidate()],
      {
        title: "OpenAI launches latest AI model",
        storyKey: "a-different-key",
        primaryEntity: "OpenAI",
        publishedAt: hoursAgo(1),
      },
      NOW,
    );
    assert.equal(match?.id, "story-1");
  });

  it("matches on the story key alone, however different the headline", () => {
    // Two runs, or two feeds, reaching the same conclusion. The exact case the
    // unique index exists to make safe.
    const key = "openai:launches-model-reasoning:2900";
    const match = findStoryForArticle(
      [candidate({ story_key: key })],
      {
        title: "Something else entirely about a different subject",
        storyKey: key,
        primaryEntity: "OpenAI",
        publishedAt: hoursAgo(1),
      },
      NOW,
    );
    assert.equal(match?.id, "story-1");
  });
});

describe("findStoryForArticle — what it must refuse", () => {
  it("does not merge two stories about the same company", () => {
    // Entity alone would merge every story OpenAI has ever been in.
    const match = findStoryForArticle(
      [candidate()],
      {
        title: "OpenAI opens an office in Bengaluru",
        storyKey: "openai:bengaluru-office-opens:2900",
        primaryEntity: "OpenAI",
        publishedAt: hoursAgo(1),
      },
      NOW,
    );
    assert.equal(match, null);
  });

  it("does not merge similar headlines about different companies", () => {
    // Headline similarity alone would merge two unrelated launches in one week.
    const match = findStoryForArticle(
      [candidate()],
      {
        title: "Anthropic releases new model",
        storyKey: "anthropic:model-releases-new:2900",
        primaryEntity: "Anthropic",
        publishedAt: hoursAgo(1),
      },
      NOW,
    );
    assert.equal(match, null);
  });

  it("does not merge across the time window", () => {
    // The window alone would merge everything published on a Tuesday; without
    // it, a company's annual launch would join last year's.
    const match = findStoryForArticle(
      [candidate()],
      {
        title: "OpenAI launches latest AI model",
        storyKey: "a-different-key",
        primaryEntity: "OpenAI",
        publishedAt: hoursAgo(24 * 10),
      },
      NOW,
    );
    assert.equal(match, null);
  });

  it("refuses to group an article with no entity at all", () => {
    // Half the grouping key is missing, so there is nothing to be confident
    // about. A new story is the safe answer.
    const match = findStoryForArticle(
      [candidate()],
      {
        title: "OpenAI releases new model",
        storyKey: "unknown:model-releases:2900",
        primaryEntity: null,
        publishedAt: hoursAgo(1),
      },
      NOW,
    );
    assert.equal(match, null);
  });
});

describe("findStoryForArticle — details", () => {
  it("measures distance from the story's span, not from a single instant", () => {
    // A slow feed catching up publishes *before* the earliest article we hold.
    // That is still the same event.
    const match = findStoryForArticle(
      [candidate({ first_seen_at: hoursAgo(4).toISOString(), last_seen_at: hoursAgo(1).toISOString() })],
      {
        title: "OpenAI launches latest AI model",
        storyKey: "another-key",
        primaryEntity: "OpenAI",
        publishedAt: hoursAgo(8),
      },
      NOW,
    );
    assert.equal(match?.id, "story-1");
  });

  it("normalises the entity on both sides", () => {
    const match = findStoryForArticle(
      [candidate({ primary_entity: "sarvam ai", title: "Sarvam AI launches new model" })],
      {
        title: "Sarvam AI releases new model",
        storyKey: "k",
        primaryEntity: "Sarvam AI Pvt Ltd",
        publishedAt: hoursAgo(1),
      },
      NOW,
    );
    assert.equal(match?.id, "story-1");
  });

  it("picks the most similar candidate when several qualify", () => {
    const match = findStoryForArticle(
      [
        candidate({ id: "loose", title: "OpenAI model news roundup and other releases" }),
        candidate({ id: "tight", title: "OpenAI releases new reasoning model" }),
      ],
      {
        title: "OpenAI releases new reasoning model today",
        storyKey: "k",
        primaryEntity: "OpenAI",
        publishedAt: hoursAgo(1),
      },
      NOW,
    );
    assert.equal(match?.id, "tight");
  });

  it("returns null against an empty candidate set", () => {
    assert.equal(
      findStoryForArticle([], { title: "x", storyKey: "k", primaryEntity: "OpenAI", publishedAt: NOW }, NOW),
      null,
    );
  });

  it("agrees with storyKey on the exact-match path", () => {
    // Belt and braces: the key the ingestion computes is the key grouping
    // compares, so a change to one has to break this.
    const key = storyKey({ primaryEntity: "OpenAI", title: "OpenAI releases new model", at: hoursAgo(3) });
    const match = findStoryForArticle(
      [candidate({ story_key: key })],
      { title: "Anything at all", storyKey: key, primaryEntity: "OpenAI", publishedAt: hoursAgo(1) },
      NOW,
    );
    assert.equal(match?.id, "story-1");
  });
});

describe("sourcePriorFor", () => {
  it("keeps the relevance filter alive for official sources", () => {
    // Below the bar on purpose: a lab blog post about datacentre networking
    // must still have to say something about AI.
    assert.ok(sourcePriorFor("official") < AI_RELEVANCE_MIN);
    assert.ok(sourcePriorFor("news") < AI_RELEVANCE_MIN);
    assert.ok(sourcePriorFor("blog") < AI_RELEVANCE_MIN);
  });

  it("carries a category-filtered research feed on its own", () => {
    // arXiv cs.AI is AI by definition, and its titles contain no lexicon terms.
    assert.ok(sourcePriorFor("research") >= AI_RELEVANCE_MIN);
  });

  it("gives an aggregator nothing", () => {
    assert.equal(sourcePriorFor("aggregator"), 0);
    assert.equal(sourcePriorFor(null), 0);
    assert.equal(sourcePriorFor("something new"), 0);
  });
});

describe("isSourceDue", () => {
  function source(over: Partial<SourceRow> = {}): SourceRow {
    return {
      id: "s1",
      name: "TechCrunch AI",
      source_type: "rss",
      feed_url: "https://example.com/feed",
      api_endpoint: null,
      publisher: "TechCrunch",
      source_category: "news",
      reliability_score: 0.85,
      region: "global",
      enabled: true,
      auto_publish: true,
      priority: 10,
      poll_interval_minutes: 15,
      consecutive_failures: 0,
      last_attempt_at: null,
      total_articles_seen: 0,
      ...over,
    };
  }

  it("fetches a source that has never been attempted", () => {
    assert.equal(isSourceDue(source(), NOW), true);
  });

  it("skips a source inside its poll interval — the politeness contract", () => {
    assert.equal(isSourceDue(source({ last_attempt_at: hoursAgo(0.1).toISOString() }), NOW), false);
    assert.equal(isSourceDue(source({ last_attempt_at: hoursAgo(1).toISOString() }), NOW), true);
  });

  it("never fetches a disabled source or the manual bucket", () => {
    assert.equal(isSourceDue(source({ enabled: false }), NOW), false);
    assert.equal(isSourceDue(source({ source_type: "manual" }), NOW), false);
  });

  it("backs off exponentially while a source keeps failing", () => {
    const failing = source({
      last_attempt_at: hoursAgo(1).toISOString(),
      consecutive_failures: 4,
    });
    // 15 minutes × 2^4 = four hours, so one hour ago is not yet due.
    assert.equal(isSourceDue(failing, NOW), false);
    assert.equal(isSourceDue({ ...failing, last_attempt_at: hoursAgo(5).toISOString() }, NOW), true);
  });

  it("caps the backoff rather than growing it forever", () => {
    const veryBroken = source({
      last_attempt_at: hoursAgo(5).toISOString(),
      consecutive_failures: 99,
    });
    // Still capped at 2^4, so a long-dead source is retried every four hours
    // instead of drifting to never.
    assert.equal(isSourceDue(veryBroken, NOW), true);
  });

  it("treats an unparseable timestamp as due rather than getting stuck", () => {
    assert.equal(isSourceDue(source({ last_attempt_at: "not a date" }), NOW), true);
  });
});
