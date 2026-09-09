import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  attributionFor,
  parseArxiv,
  parseFeed,
  parseGdelt,
  parseHackerNews,
} from "../lib/ai-news/sources.ts";

/**
 * The feed adapters.
 *
 * These parse XML and JSON written by two dozen strangers, none of whom is
 * obliged to be well-formed, and one malformed entry must never cost the other
 * thirty-nine. So every case here is either a real feed shape or a specific way
 * a feed has been observed to be broken.
 *
 * Nothing here reaches the network — `scripts/ai-news-dry-run.mjs` is what
 * checks the live endpoints, because "is this URL still alive" is not a
 * question a unit test can answer honestly.
 */

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Example AI</title>
    <item>
      <title><![CDATA[OpenAI launches a new model]]></title>
      <link>https://example.com/openai-new-model</link>
      <description><![CDATA[<p>The company said the model is <b>faster</b>.</p>]]></description>
      <pubDate>Tue, 09 Sep 2026 09:30:00 GMT</pubDate>
      <dc:creator>Jane Roe</dc:creator>
      <media:content url="https://cdn.example.com/a.jpg" />
    </item>
    <item>
      <title>Anthropic ships something &amp; more</title>
      <link>https://example.com/anthropic</link>
      <description>Short summary.</description>
      <pubDate>Tue, 09 Sep 2026 08:00:00 GMT</pubDate>
      <enclosure url="https://cdn.example.com/b.png" type="image/png" length="1000" />
    </item>
  </channel>
</rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>The Verge covers an agent</title>
    <link rel="self" href="https://www.theverge.com/self" />
    <link rel="alternate" href="https://www.theverge.com/2026/9/9/agent" />
    <summary>A summary of the piece.</summary>
    <published>2026-09-09T07:00:00Z</published>
    <author><name>A Writer</name></author>
  </entry>
</feed>`;

describe("parseFeed — RSS", () => {
  const articles = parseFeed(RSS);

  it("reads every item", () => {
    assert.equal(articles.length, 2);
  });

  it("unwraps CDATA and strips markup from the excerpt", () => {
    assert.equal(articles[0].title, "OpenAI launches a new model");
    assert.equal(articles[0].excerpt, "The company said the model is faster .");
  });

  it("decodes entities in a plain title", () => {
    assert.equal(articles[1].title, "Anthropic ships something & more");
  });

  it("parses the publication date", () => {
    assert.equal(articles[0].publishedAt?.toISOString(), "2026-09-09T09:30:00.000Z");
  });

  it("reads an image from media:content and from an image enclosure", () => {
    assert.equal(articles[0].imageUrl, "https://cdn.example.com/a.jpg");
    assert.equal(articles[1].imageUrl, "https://cdn.example.com/b.png");
  });

  it("reads the author from dc:creator", () => {
    assert.equal(articles[0].author, "Jane Roe");
  });

  it("carries no external engagement — RSS publishes none", () => {
    // A zero and an unknown are different facts, and only one of them may be
    // fed to the engagement term of the trend score.
    assert.equal(articles[0].externalEngagement, null);
  });
});

describe("parseFeed — Atom", () => {
  const articles = parseFeed(ATOM);

  it("falls back to <entry> when there are no <item>s", () => {
    assert.equal(articles.length, 1);
  });

  it("takes the alternate link, not rel=self", () => {
    assert.equal(articles[0].url, "https://www.theverge.com/2026/9/9/agent");
  });

  it("reads the author's name", () => {
    assert.equal(articles[0].author, "A Writer");
  });
});

describe("parseFeed — malformed input", () => {
  it("returns nothing for input that is not a feed at all", () => {
    // The observed failure: a publisher's /feed/ path starts serving the HTML
    // site. It must produce zero articles, not an exception.
    assert.deepEqual(parseFeed("<!doctype html><html><body>Not a feed</body></html>"), []);
    assert.deepEqual(parseFeed(""), []);
  });

  it("skips an item with no link or no title, and keeps the rest", () => {
    const feed = `<rss><channel>
      <item><title>No link here</title></item>
      <item><link>https://example.com/no-title</link></item>
      <item><title>Good one</title><link>https://example.com/good</link></item>
    </channel></rss>`;
    const articles = parseFeed(feed);
    assert.equal(articles.length, 1);
    assert.equal(articles[0].url, "https://example.com/good");
  });

  it("does not truncate the feed when an item contains the literal closing tag", () => {
    // A lazy `<item>[\s\S]*?</item>` regex loses every item after this one.
    const feed = `<rss><channel>
      <item><title><![CDATA[A post about </item> in XML]]></title><link>https://example.com/a</link></item>
      <item><title>Second</title><link>https://example.com/b</link></item>
    </channel></rss>`;
    const urls = parseFeed(feed).map((article) => article.url);
    assert.ok(urls.includes("https://example.com/b"), `only got ${urls.join(", ")}`);
  });

  it("ignores a relative or protocol-relative image", () => {
    // Resolving one needs the publisher's base URL, and guessing is how you
    // hotlink the wrong host.
    const feed = `<rss><channel><item>
      <title>Story</title><link>https://example.com/s</link>
      <media:content url="/local/image.jpg" />
    </item></channel></rss>`;
    assert.equal(parseFeed(feed)[0].imageUrl, null);
  });

  it("does not treat an audio enclosure as an image", () => {
    const feed = `<rss><channel><item>
      <title>Podcast episode about AI</title><link>https://example.com/p</link>
      <enclosure url="https://cdn.example.com/ep.mp3" type="audio/mpeg" />
    </item></channel></rss>`;
    assert.equal(parseFeed(feed)[0].imageUrl, null);
  });

  it("gives a missing date null rather than an invalid Date", () => {
    const feed = `<rss><channel><item>
      <title>Undated story</title><link>https://example.com/u</link>
      <pubDate>who knows</pubDate>
    </item></channel></rss>`;
    assert.equal(parseFeed(feed)[0].publishedAt, null);
  });
});

describe("parseArxiv", () => {
  const ATOM_ARXIV = `<feed xmlns="http://www.w3.org/2005/Atom">
    <entry>
      <id>http://arxiv.org/abs/2609.01234v2</id>
      <title>Sparse Attention with Linear Complexity</title>
      <summary>We present a method.</summary>
      <published>2026-09-08T00:00:00Z</published>
      <author><name>R. Searcher</name></author>
      <link rel="alternate" href="http://arxiv.org/abs/2609.01234v2" />
    </entry>
  </feed>`;

  it("strips the version suffix, so a revision is not a new article", () => {
    const [paper] = parseArxiv(ATOM_ARXIV);
    assert.equal(paper.url, "http://arxiv.org/abs/2609.01234");
  });

  it("keeps the abstract as the excerpt and the author", () => {
    const [paper] = parseArxiv(ATOM_ARXIV);
    assert.equal(paper.excerpt, "We present a method.");
    assert.equal(paper.author, "R. Searcher");
  });
});

describe("parseHackerNews", () => {
  const HN = JSON.stringify({
    hits: [
      {
        objectID: "1",
        title: "Show HN: an AI thing",
        url: "https://example.com/ai-thing",
        author: "someone",
        points: 120,
        num_comments: 45,
        created_at: "2026-09-09T06:00:00Z",
      },
      { objectID: "2", title: "Ask HN: about agents", url: null, points: 30, num_comments: 12, created_at: "2026-09-09T05:00:00Z" },
      { objectID: "3", title: "", url: "https://example.com/x" },
    ],
  });

  it("sums points and comments into a real engagement figure", () => {
    // The one source that publishes an interaction count for this purpose, and
    // therefore the only non-first-party input to the engagement term.
    assert.equal(parseHackerNews(HN)[0].externalEngagement, 165);
  });

  it("points a text post at its own discussion", () => {
    assert.equal(parseHackerNews(HN)[1].url, "https://news.ycombinator.com/item?id=2");
  });

  it("skips a hit with no title", () => {
    assert.equal(parseHackerNews(HN).length, 2);
  });

  it("never carries a user's story text as an excerpt", () => {
    // That text is a person's writing, not a publisher's summary.
    assert.equal(parseHackerNews(HN)[0].excerpt, null);
  });
});

describe("parseGdelt", () => {
  const GDELT = JSON.stringify({
    articles: [
      {
        url: "https://example.com/story",
        title: "An AI story",
        seendate: "20260909T090000Z",
        socialimage: "https://cdn.example.com/g.jpg",
        language: "English",
      },
      { url: "https://example.pt/story", title: "Uma notícia", seendate: "20260909T090000Z", language: "Portuguese" },
      { url: null, title: "No URL", seendate: "20260909T090000Z", language: "English" },
    ],
  });

  it("expands its non-ISO seendate", () => {
    assert.equal(parseGdelt(GDELT)[0].publishedAt?.toISOString(), "2026-09-09T09:00:00.000Z");
  });

  it("drops non-English records the English lexicon cannot score honestly", () => {
    const urls = parseGdelt(GDELT).map((article) => article.url);
    assert.deepEqual(urls, ["https://example.com/story"]);
  });
});

describe("attributionFor", () => {
  const rss = {
    name: "TechCrunch AI",
    source_type: "rss",
    feed_url: "https://techcrunch.com/feed",
    api_endpoint: null,
    publisher: "TechCrunch",
  };

  it("uses the configured publisher for a normal feed", () => {
    assert.equal(attributionFor(rss, "https://techcrunch.com/2026/x"), "TechCrunch");
  });

  it("uses the article's own host for an aggregator", () => {
    // Otherwise every GDELT record would be attributed to "GDELT", and
    // `source_count` would stop meaning "distinct publications".
    const gdelt = { ...rss, name: "GDELT (AI)", source_type: "gdelt", publisher: "GDELT" };
    assert.equal(attributionFor(gdelt, "https://www.reuters.com/tech/a"), "reuters.com");
  });

  it("falls back to the source name when there is no publisher", () => {
    assert.equal(attributionFor({ ...rss, publisher: null }, "https://x.com/a"), "TechCrunch AI");
  });
});
