import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  contentHash,
  decodeEntities,
  fundingEventKey,
  normalizeEntityName,
  normalizeTitle,
  normalizeUrl,
  slugify,
  splitPublisherSuffix,
  stripHtml,
  titleSimilarity,
} from "../lib/funding/normalize.ts";

/**
 * These functions decide whether running ingestion twice creates a second copy
 * of the news, which is not something anyone can check by looking at a page.
 * The assertions below are the check.
 */

describe("normalizeUrl — the primary duplicate key", () => {
  it("folds the cosmetic differences between two links to one article", () => {
    const canonical = "https://entrackr.com/news/some-startup-raises-22-cr";
    for (const variant of [
      "https://entrackr.com/news/some-startup-raises-22-cr",
      "https://www.entrackr.com/news/some-startup-raises-22-cr",
      "http://entrackr.com/news/some-startup-raises-22-cr",
      "https://ENTRACKR.com/news/some-startup-raises-22-cr",
      "https://entrackr.com/news/some-startup-raises-22-cr/",
      "https://entrackr.com/news/some-startup-raises-22-cr#top",
      "https://entrackr.com/news/some-startup-raises-22-cr?utm_source=twitter&utm_medium=social",
    ]) {
      assert.equal(normalizeUrl(variant), canonical, `failed for ${variant}`);
    }
  });

  it("strips the tracking parameter Google News stamps on every link", () => {
    assert.equal(
      normalizeUrl("https://news.google.com/rss/articles/CBMiabc?oc=5"),
      "https://news.google.com/rss/articles/CBMiabc",
    );
  });

  it("sorts surviving parameters so key order cannot fork the key", () => {
    assert.equal(
      normalizeUrl("https://example.com/a?b=2&a=1"),
      normalizeUrl("https://example.com/a?a=1&b=2"),
    );
  });

  it("keeps parameters that are part of the address", () => {
    // Stripping an unknown parameter is how two different pages become one.
    assert.equal(normalizeUrl("https://example.com/post?id=42"), "https://example.com/post?id=42");
  });

  it("distinguishes genuinely different paths", () => {
    assert.notEqual(
      normalizeUrl("https://example.com/a/one"),
      normalizeUrl("https://example.com/a/two"),
    );
  });

  it("returns null for anything that is not an http(s) URL", () => {
    for (const bad of ["", "not a url", "javascript:alert(1)", "mailto:a@b.com", null, undefined]) {
      assert.equal(normalizeUrl(bad), null, `expected null for ${String(bad)}`);
    }
  });
});

describe("decodeEntities and stripHtml", () => {
  it("resolves the entities RSS titles actually carry", () => {
    assert.equal(decodeEntities("Byju&#x27;s raises &amp; expands"), "Byju's raises & expands");
  });

  it("does not double-decode an escaped entity into a tag", () => {
    assert.equal(decodeEntities("&amp;lt;script&amp;gt;"), "&lt;script&gt;");
  });

  it("survives a malformed entity rather than throwing", () => {
    assert.equal(decodeEntities("&#xFFFFFFFF; ok"), "&#xFFFFFFFF; ok");
  });

  it("strips markup and collapses whitespace", () => {
    assert.equal(
      stripHtml('<p dir="ltr"><span>Raised   Rs 22 crore</span></p>'),
      "Raised Rs 22 crore",
    );
  });
});

describe("normalizeTitle", () => {
  it("makes two spellings of one headline comparable", () => {
    assert.equal(
      normalizeTitle("Byju&#x27;s Raises $10M!"),
      normalizeTitle("Byju’s raises $10M"),
    );
  });

  it("folds accents", () => {
    assert.equal(normalizeTitle("Café Coffee"), "cafe coffee");
  });

  it("returns an empty string for nothing usable", () => {
    assert.equal(normalizeTitle("!!! ???"), "");
    assert.equal(normalizeTitle(null), "");
  });
});

describe("normalizeEntityName", () => {
  it("removes legal suffixes so one company is one row", () => {
    assert.equal(normalizeEntityName("Acme Pvt Ltd"), "acme");
    assert.equal(normalizeEntityName("Acme Private Limited"), "acme");
    assert.equal(normalizeEntityName("Acme Inc."), "acme");
  });

  it("does NOT strip words that are part of a name", () => {
    // The failure this guards against is the worst one available here: merging
    // two different companies' funding rounds into one history.
    assert.equal(normalizeEntityName("ABC Technologies"), "abc technologies");
    assert.notEqual(normalizeEntityName("ABC Technologies"), normalizeEntityName("ABC"));
  });
});

describe("slugify", () => {
  it("produces slugs the schema's CHECK constraint accepts", () => {
    const pattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
    for (const name of ["DigitalPaani", "Re:Build", "3one4 Capital", "  Acme  Corp  "]) {
      const slug = slugify(name);
      assert.match(slug, pattern, `"${name}" produced "${slug}"`);
    }
  });

  it("returns an empty string when there is nothing to slug", () => {
    // Callers must treat this as a failure — the constraint would reject it.
    assert.equal(slugify("!!!"), "");
  });
});

describe("contentHash — the secondary duplicate key", () => {
  it("is stable for the same substance", async () => {
    assert.equal(
      await contentHash("Acme raises Rs 22 crore", "A seed round."),
      await contentHash("Acme raises Rs 22 crore", "A seed round."),
    );
  });

  it("collides for the same story republished with cosmetic differences", async () => {
    assert.equal(
      await contentHash("Acme Raises Rs 22 Crore!", "A seed round."),
      await contentHash("acme raises rs 22 crore", "A seed round."),
    );
  });

  it("differs for different stories", async () => {
    assert.notEqual(
      await contentHash("Acme raises Rs 22 crore"),
      await contentHash("Beta raises Rs 22 crore"),
    );
  });

  it("is a 32-character hex string", async () => {
    assert.match(await contentHash("Acme raises"), /^[0-9a-f]{32}$/);
  });
});

describe("fundingEventKey — the event identity", () => {
  it("is the same for two reports of one round", () => {
    // Different outlets, different words, different reported currency — one
    // event. This is why the amount is deliberately not in the key.
    const a = fundingEventKey({ startupName: "Acme", stage: "Series A", date: "2026-09-01" });
    const b = fundingEventKey({ startupName: "acme", stage: "Series A", date: "2026-09-28" });
    assert.equal(a, b);
  });

  it("separates two stages for one company", () => {
    assert.notEqual(
      fundingEventKey({ startupName: "Acme", stage: "Seed", date: "2026-09-01" }),
      fundingEventKey({ startupName: "Acme", stage: "Series A", date: "2026-09-01" }),
    );
  });

  it("separates two months", () => {
    assert.notEqual(
      fundingEventKey({ startupName: "Acme", stage: "Seed", date: "2026-09-01" }),
      fundingEventKey({ startupName: "Acme", stage: "Seed", date: "2026-10-01" }),
    );
  });

  it("separates two companies", () => {
    assert.notEqual(
      fundingEventKey({ startupName: "Acme", stage: "Seed", date: "2026-09-01" }),
      fundingEventKey({ startupName: "Beta", stage: "Seed", date: "2026-09-01" }),
    );
  });

  it("still produces a key for an unusable date", () => {
    // A null key would violate the NOT NULL constraint; "unknown" groups the
    // undateable together, which is the least bad option.
    assert.match(
      fundingEventKey({ startupName: "Acme", stage: "Seed", date: "not a date" }),
      /unknown$/,
    );
  });
});

describe("titleSimilarity — the tertiary signal", () => {
  it("scores the brief's own example above the ingestion threshold", () => {
    // "XYZ raises ₹20 crore" vs "XYZ secures Rs 20 crore funding" — the pair
    // section 8 names. DUPLICATE_TITLE_THRESHOLD is 0.4.
    const score = titleSimilarity("XYZ raises ₹20 crore", "XYZ secures Rs 20 crore funding");
    assert.ok(score >= 0.4, `expected >= 0.4, got ${score}`);
  });

  it("scores unrelated headlines low", () => {
    const score = titleSimilarity(
      "Acme raises Rs 22 crore in seed funding",
      "Government announces new semiconductor policy",
    );
    assert.ok(score < 0.2, `expected < 0.2, got ${score}`);
  });

  it("is 1 for identical headlines and 0 for empty input", () => {
    assert.equal(titleSimilarity("Acme raises", "Acme raises"), 1);
    assert.equal(titleSimilarity("", "Acme raises"), 0);
  });
});

describe("splitPublisherSuffix — Google News titles", () => {
  it("separates the masthead from the headline", () => {
    assert.deepEqual(
      splitPublisherSuffix(
        "OORJAA Raises Rs 9.7 Crore in Series A First Close - Indian Startup Times",
      ),
      {
        headline: "OORJAA Raises Rs 9.7 Crore in Series A First Close",
        publisher: "Indian Startup Times",
      },
    );
  });

  it("leaves a hyphenated headline intact", () => {
    // The tail here is a clause, not a masthead, and splitting would throw away
    // half the headline.
    const title = "Zepto raises $150M - here is what it means for quick commerce in India";
    assert.deepEqual(splitPublisherSuffix(title), { headline: title, publisher: null });
  });

  it("returns the whole string when there is no separator", () => {
    assert.deepEqual(splitPublisherSuffix("Acme raises Rs 5 crore"), {
      headline: "Acme raises Rs 5 crore",
      publisher: null,
    });
  });
});
