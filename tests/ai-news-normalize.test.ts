import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DUPLICATE_TITLE_THRESHOLD } from "../lib/ai-news/constants.ts";
import {
  contentHash,
  hostOf,
  normalizeEntityName,
  normalizeTitle,
  normalizeUrl,
  parsePublishedAt,
  significantWords,
  splitPublisherSuffix,
  storyKey,
  storySlug,
  stripHtml,
  titleSimilarity,
} from "../lib/ai-news/normalize.ts";

/**
 * These functions decide whether running ingestion a second time creates a
 * second copy of the news. That is not a property anyone can eyeball on a live
 * page — a duplicate looks like two stories, not like a bug — so it is asserted
 * here against the exact cases the pipeline meets in the wild.
 */

describe("normalizeUrl — the primary duplicate key", () => {
  it("collapses the same article shared from three places into one key", () => {
    const canonical = "https://techcrunch.com/2026/09/09/openai-ships-a-thing";
    for (const variant of [
      "https://techcrunch.com/2026/09/09/openai-ships-a-thing",
      "http://www.techcrunch.com/2026/09/09/openai-ships-a-thing/",
      "https://TechCrunch.com/2026/09/09/openai-ships-a-thing?utm_source=twitter&utm_medium=social",
      "https://techcrunch.com/2026/09/09/openai-ships-a-thing#comments",
    ]) {
      assert.equal(normalizeUrl(variant), canonical, variant);
    }
  });

  it("folds http to https, so a publisher moving to TLS does not re-import its archive", () => {
    assert.equal(normalizeUrl("http://example.com/a"), normalizeUrl("https://example.com/a"));
  });

  it("keeps parameters that are part of the address, and sorts them", () => {
    // `?id=` is the whole document on plenty of sites; dropping it would merge
    // every article on the domain into one.
    assert.equal(normalizeUrl("https://x.com/read?id=5&a=1"), "https://x.com/read?a=1&id=5");
  });

  it("strips Google News's ?oc=5 but not an unknown parameter", () => {
    assert.equal(normalizeUrl("https://x.com/a?oc=5"), "https://x.com/a");
    assert.equal(normalizeUrl("https://x.com/a?page=2"), "https://x.com/a?page=2");
  });

  it("refuses anything that is not an http(s) URL", () => {
    // A null never reaches the database: an article we cannot key is an article
    // we cannot promise not to duplicate.
    for (const bad of ["", "not a url", "javascript:alert(1)", "ftp://x.com/a", null, undefined]) {
      assert.equal(normalizeUrl(bad), null, String(bad));
    }
  });

  it("keeps the root path's slash but drops a trailing one elsewhere", () => {
    assert.equal(normalizeUrl("https://x.com/"), "https://x.com");
    assert.equal(normalizeUrl("https://x.com/a/"), "https://x.com/a");
  });
});

describe("hostOf", () => {
  it("returns the host without www, which is what an aggregator is attributed to", () => {
    assert.equal(hostOf("https://www.theverge.com/2026/a"), "theverge.com");
    assert.equal(hostOf("nonsense"), null);
  });
});

describe("normalizeTitle and stripHtml", () => {
  it("resolves the entity forms the same headline arrives in", () => {
    assert.equal(normalizeTitle("Byju&#x27;s raises"), normalizeTitle("Byju’s raises"));
  });

  it("folds accents so Café and Cafe match", () => {
    assert.equal(normalizeTitle("Café"), "cafe");
  });

  it("strips markup, which RSS descriptions are full of", () => {
    assert.equal(stripHtml("<p>Hello <b>world</b></p>"), "Hello world");
  });

  it("decodes &amp; last, so &amp;lt; does not become a tag", () => {
    assert.equal(stripHtml("a &amp;lt; b"), "a &lt; b");
  });
});

describe("normalizeEntityName", () => {
  it("removes stacked legal suffixes", () => {
    assert.equal(normalizeEntityName("Sarvam AI Pvt Ltd"), "sarvam ai");
  });

  it("does NOT remove words that are part of a name", () => {
    // "Stability AI" is not "Stability", and an over-eager suffix list is the
    // worst failure this file can produce: it merges different companies.
    assert.equal(normalizeEntityName("Stability AI"), "stability ai");
    assert.equal(normalizeEntityName("Scale AI"), "scale ai");
  });
});

describe("storySlug", () => {
  it("cuts on a word boundary rather than mid-word", () => {
    const slug = storySlug(
      "OpenAI launches a brand new reasoning model with an extremely long headline attached",
      40,
    );
    assert.ok(slug.length <= 40);
    assert.ok(!slug.endsWith("-"));
    // The cut lands between words, so the last segment is a whole one.
    assert.ok("openai launches a brand new reasoning model with an extremely long headline attached".includes(slug.split("-").at(-1)!));
  });

  it("matches the slug CHECK constraint the schema applies", () => {
    assert.match(storySlug("OpenAI's GPT-5: what's new?"), /^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
});

describe("contentHash — the secondary duplicate check", () => {
  it("is identical for the same story republished with cosmetic differences", async () => {
    const a = await contentHash("OpenAI’s new model", "It is fast.");
    const b = await contentHash("OpenAI&#x2019;s New Model", "It is fast.");
    assert.equal(a, b);
  });

  it("differs for genuinely different stories", async () => {
    const a = await contentHash("OpenAI ships a model", null);
    const b = await contentHash("Anthropic ships a model", null);
    assert.notEqual(a, b);
  });
});

describe("significantWords and titleSimilarity", () => {
  it("drops 'ai' and 'model', which cannot distinguish two AI headlines", () => {
    // On a page where every headline mentions AI, the word AI is not evidence
    // that two headlines are about the same event.
    assert.deepEqual(significantWords("The new AI model"), []);
  });

  it("scores the section 12 pair at the top, once the event verb is folded", () => {
    const score = titleSimilarity("OpenAI releases new model", "OpenAI launches latest AI model");
    // {openai, release} vs {openai, release} — "releases" and "launches" are
    // the same event verb, and "new", "latest", "ai" and "model" are stopwords.
    assert.equal(score, 1);
    assert.ok(score >= DUPLICATE_TITLE_THRESHOLD);
  });

  it("keeps a different event about the same company well below the threshold", () => {
    // The pair the folding must NOT collapse: same subject, different event.
    const score = titleSimilarity("OpenAI releases new model", "OpenAI opens an office in Bengaluru");
    assert.ok(score < DUPLICATE_TITLE_THRESHOLD, `unexpected similarity ${score}`);
  });

  it("folds only the listed verbs, and leaves every other word alone", () => {
    // The fold is a closed list, not a stemmer: "announces" is on it and
    // "delays" is not, so "delays" survives as a distinguishing token.
    assert.deepEqual(significantWords("Nvidia announces a chip"), ["nvidia", "release", "chip"]);
    assert.deepEqual(significantWords("Nvidia delays a chip"), ["nvidia", "delays", "chip"]);
  });

  it("cannot tell opposite news about one subject apart — a known limit", () => {
    // "Nvidia announces a chip" and "Nvidia delays a chip" share {nvidia, chip}
    // of four words, which any overlap metric scores as similar. Word overlap
    // has no notion of negation, and this is true with or without the verb
    // fold — dropping "announces" from the list changes nothing here.
    //
    // Asserted rather than hidden, because it is the boundary of what
    // `findStoryForArticle` can be trusted to do on its own, and it is why the
    // admin merge/split controls exist rather than a looser threshold.
    assert.ok(titleSimilarity("Nvidia announces a chip", "Nvidia delays a chip") >= DUPLICATE_TITLE_THRESHOLD);
  });

  it("scores unrelated headlines near zero", () => {
    assert.ok(titleSimilarity("Nvidia earnings beat", "EU passes robotics rules") < 0.1);
  });
});

describe("splitPublisherSuffix", () => {
  it("removes a masthead after a trailing separator", () => {
    assert.deepEqual(splitPublisherSuffix("Anthropic ships a new Claude - Ars Technica"), {
      headline: "Anthropic ships a new Claude",
      publisher: "Ars Technica",
    });
  });

  it("leaves a hyphenated headline intact", () => {
    const { headline, publisher } = splitPublisherSuffix(
      "Nvidia's quarter - here is what it actually means for the AI buildout",
    );
    assert.equal(publisher, null);
    assert.ok(headline.includes("what it actually means"));
  });
});

describe("storyKey", () => {
  it("is independent of word order in the headline", () => {
    const at = new Date("2026-09-09T10:00:00Z");
    assert.equal(
      storyKey({ primaryEntity: "OpenAI", title: "Reasoning model launches today", at }),
      storyKey({ primaryEntity: "OpenAI", title: "Today launches reasoning model", at }),
    );
  });

  it("separates the same company's events a long way apart", () => {
    assert.notEqual(
      storyKey({ primaryEntity: "OpenAI", title: "Funding round closes", at: "2026-01-01T00:00:00Z" }),
      storyKey({ primaryEntity: "OpenAI", title: "Funding round closes", at: "2026-09-01T00:00:00Z" }),
    );
  });

  it("survives a missing entity rather than throwing", () => {
    assert.match(storyKey({ primaryEntity: null, title: "Something happened", at: null }), /^unknown:/);
  });
});

describe("parsePublishedAt — the dates we are willing to believe", () => {
  const now = new Date("2026-09-09T12:00:00Z");

  it("accepts a normal RSS date", () => {
    assert.equal(
      parsePublishedAt("Tue, 09 Sep 2026 09:30:00 GMT", now)?.toISOString(),
      "2026-09-09T09:30:00.000Z",
    );
  });

  it("refuses a future date, which would pin recency at 100 forever", () => {
    assert.equal(parsePublishedAt("2026-09-10T00:00:00Z", now), null);
  });

  it("allows a few minutes of clock disagreement", () => {
    assert.notEqual(parsePublishedAt("2026-09-09T12:02:00Z", now), null);
  });

  it("refuses an epoch-zero artifact", () => {
    assert.equal(parsePublishedAt("1970-01-01T00:00:00Z", now), null);
  });

  it("refuses garbage and absence", () => {
    assert.equal(parsePublishedAt("not a date", now), null);
    assert.equal(parsePublishedAt(null, now), null);
  });
});
