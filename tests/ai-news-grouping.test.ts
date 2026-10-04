import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  findStoryForArticle,
  isSourceDue,
  sameEventByContent,
  sourcePriorFor,
  suggestStoryMerges,
  wordSpread,
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

/*
 * Real headlines from production, 2026-09-25 → 10-02, with the primary entity
 * the pipeline assigned each. The first group was published as separate
 * stories and must now be one event each; the second is a week of genuinely
 * different stories about one product, which must stay apart.
 */
type Headline = { entity: string; at: string; title: string };
const SAME_EVENT: [Headline, Headline][] = [
  [
    { entity: "Apple", at: "2026-10-02T23:03Z", title: "Apple changes full-disk access permissions to curb abuse from AI agents" },
    { entity: "Apple", at: "2026-10-02T18:11Z", title: "Apple says it’s tightening macOS ‘Full Disk Access’ controls due to new risks from AI agents" },
  ],
  [
    { entity: "Apple", at: "2026-10-02T20:08Z", title: "Apple will limit Mac disk access as AI agents ‘substantially’ increase risk" },
    { entity: "Apple", at: "2026-10-02T18:11Z", title: "Apple says it’s tightening macOS ‘Full Disk Access’ controls due to new risks from AI agents" },
  ],
  [
    { entity: "Gemini", at: "2026-10-01T09:21Z", title: "What is Gemini 4 Argon, Google’s new AI model to hunt security bugs?" },
    { entity: "Google", at: "2026-09-30T23:43Z", title: "Google releases Gemini 4 Argon, called its most powerful model yet" },
  ],
  [
    { entity: "Gemini", at: "2026-09-30T20:04Z", title: "Gemini 4 Argon" },
    { entity: "Gemini", at: "2026-09-30T20:01Z", title: "Gemini 4 Argon: our next era of frontier intelligence" },
  ],
  [
    { entity: "OpenAI", at: "2026-09-29T17:15Z", title: "OpenAI launches Dots, its Muse competitor" },
    { entity: "OpenAI", at: "2026-09-29T17:15Z", title: "OpenAI’s Dots Are Always-On AI Agents—and Its Answer to Meta’s Muse" },
  ],
  [
    { entity: "Meta", at: "2026-09-29T14:08Z", title: "Meta’s Muse AI sent a YouTuber’s address to a stranger" },
    { entity: "Meta", at: "2026-09-28T21:08Z", title: "Man Says Meta's Muse AI Gave His Home Address Out to Strangers" },
  ],
];
const DISTINCT_MUSE: Headline[] = [
  { entity: "Meta", at: "2026-10-02T21:08Z", title: "Meta open sources code to let you make Muse AI gadgets" },
  { entity: "Meta", at: "2026-09-30T15:18Z", title: "All the latest news on Meta’s cute, creepy Muse AI agent" },
  { entity: "Meta", at: "2026-09-29T14:08Z", title: "Meta’s Muse AI sent a YouTuber’s address to a stranger" },
  { entity: "Meta", at: "2026-09-29T11:05Z", title: "‘User should always be in control’: Meta’s VP of AI products Vishal Shah on Muse" },
  { entity: "Meta", at: "2026-09-29T11:01Z", title: "Meta is expanding its AI agent Muse to small businesses" },
  { entity: "Meta", at: "2026-09-27T19:57Z", title: "Can Muse overcome Meta’s trust issues?" },
  { entity: "Meta", at: "2026-09-25T18:22Z", title: "Meta’s Muse just stole the AI spotlight from OpenAI and Anthropic" },
];
const asEvent = (headline: Headline) => ({ title: headline.title, entity: headline.entity, at: new Date(headline.at) });

describe("sameEventByContent — production headlines", () => {
  for (const [a, b] of SAME_EVENT) {
    it(`joins “${a.title.slice(0, 40)}…” and “${b.title.slice(0, 40)}…”`, () => {
      assert.notEqual(sameEventByContent(asEvent(a), asEvent(b)), null);
    });
  }

  it("keeps a week of different Muse stories apart", () => {
    for (let i = 0; i < DISTINCT_MUSE.length; i++) {
      for (let j = i + 1; j < DISTINCT_MUSE.length; j++) {
        assert.equal(
          sameEventByContent(asEvent(DISTINCT_MUSE[i]), asEvent(DISTINCT_MUSE[j])),
          null,
          `${DISTINCT_MUSE[i].title} / ${DISTINCT_MUSE[j].title}`,
        );
      }
    }
  });

  it("never matches research papers or topic entities", () => {
    const at = new Date("2026-10-02T10:00Z");
    const paperA = { title: "Diagnosing and Improving Probabilistic Reasoning in Large Language Models", entity: "OpenAI", at, category: "AI Research" };
    const paperB = { title: "Diagnosing and Repairing Mathematical Reasoning in Large Language Models", entity: "OpenAI", at };
    assert.equal(sameEventByContent(paperA, paperB), null);
    const topicA = { title: "Storage Is Not Strategy: Support Control for LLM Unlearning", entity: "Benchmarks", at };
    const topicB = { title: "Linguistic Loopholes in LLM Unlearning: a 174-Language Benchmark", entity: "Benchmarks", at };
    assert.equal(sameEventByContent(topicA, topicB, { mode: "suggest" }), null);
  });

  it("ignores words spread across many companies' headlines", () => {
    // From production: two different seed rounds, both mis-filed under Google.
    const at = new Date("2026-10-02T10:00Z");
    const a = { title: "Antler, Nikhil Kamath back healthtech startup Aignosis with Rs 4 Cr seed round", entity: "Google", at };
    const b = { title: "Unveilr AI raises pre-seed round from AJVC at Rs 16.7 Cr valuation", entity: "Google", at };
    const pool = ["Acme", "Zeta", "Orbit", "Lumen"].map((entity) => ({ title: `${entity} raises Rs 5 Cr seed round`, entity }));
    const spread = wordSpread([...pool, a, b]);
    assert.equal(sameEventByContent(a, b, { spread, mode: "suggest" }), null);
  });

  it("needs two rare words to merge on its own, one to suggest", () => {
    const at = new Date("2026-10-02T10:00Z");
    const a = { title: "OpenAI scraps planned October launch of GPT-6.1 Astra over safety concerns", entity: "OpenAI", at };
    const b = { title: "OpenAI launches GPT-6.1 Sol, says it nearly matches GPT-6 Astra and costs less", entity: "OpenAI", at };
    const pool = ["Anthropic", "Google", "Meta"].map((entity) => ({ title: `${entity} GPT 6 1 rival`, entity }));
    const spread = wordSpread([...pool, a, b]);
    assert.equal(sameEventByContent(a, b, { spread, mode: "ingest" }), null);
    assert.notEqual(sameEventByContent(a, b, { spread, mode: "suggest" }), null);
  });

  it("needs the entity in both headlines, not only on the story", () => {
    // From production: two posts in a series, filed under Amazon from body text.
    const at = new Date("2026-10-02T10:00Z");
    const a = { title: "Generate images and video with vLLM-Omni on SageMaker AI – Part 2", entity: "Amazon", at };
    const b = { title: "Build real-time voice applications with vLLM-Omni on SageMaker AI – Part 1", entity: "Amazon", at };
    assert.equal(sameEventByContent(a, b, { mode: "suggest" }), null);
  });

  it("needs the entities to agree or name each other", () => {
    const apple = { title: "Apple tightens full disk access for agents", entity: "Apple", at: new Date("2026-10-02T10:00Z") };
    const other = { title: "Microsoft tightens full disk access for agents", entity: "Microsoft", at: new Date("2026-10-02T11:00Z") };
    assert.equal(sameEventByContent(apple, other), null);
  });

  it("does not reach past its 48-hour window", () => {
    const [a, b] = SAME_EVENT[0];
    assert.equal(sameEventByContent(asEvent(a), { ...asEvent(b), at: new Date("2026-09-29T00:00Z") }), null);
  });

  it("suggests one merge per event, keeping the best-covered story", () => {
    const stories = [...SAME_EVENT.flat(), ...DISTINCT_MUSE]
      // Deduplicate the headlines the fixtures reuse.
      .filter((headline, index, all) => all.findIndex((other) => other.title === headline.title) === index)
      .map((headline, index) => ({
        id: `s${index}`,
        title: headline.title,
        primary_entity: headline.entity,
        first_seen_at: headline.at,
        last_seen_at: headline.at,
        source_count: headline.title.startsWith("Apple says") ? 3 : 1,
      }));
    const suggestions = suggestStoryMerges(stories);
    const titles = suggestions.map((s) => [s.keep.title, ...s.duplicates.map((d) => d.title)].sort());
    // Apple ×3, Gemini 4 Argon ×4, OpenAI Dots ×2, the Muse address leak ×2.
    assert.equal(suggestions.length, 4);
    assert.deepEqual(titles.map((cluster) => cluster.length).sort(), [2, 2, 3, 4]);
    const apple = suggestions.find((s) => s.keep.primary_entity === "Apple");
    assert.ok(apple?.keep.title.startsWith("Apple says"), "the three-source story is kept");
  });

  it("is what findStoryForArticle falls back to", () => {
    const [a, b] = SAME_EVENT[0];
    const match = findStoryForArticle(
      [candidate({ title: b.title, primary_entity: b.entity, story_key: "apple:x", first_seen_at: b.at, last_seen_at: b.at })],
      { title: a.title, storyKey: "apple:y", primaryEntity: a.entity, publishedAt: new Date(a.at) },
      new Date(a.at),
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
