/**
 * Reading a source. One adapter per `ai_news_sources.source_type`, all of them
 * returning the same `FetchedArticle[]`.
 *
 * What this file will and will not do
 * -----------------------------------
 * It fetches the URL configured on the source row — an RSS or Atom feed, arXiv's
 * documented export API, Algolia's public Hacker News search API, or GDELT's
 * public document API — parses what comes back, and stops. It does **not**
 * follow the article link, render the page, extract the body, work around a
 * paywall, present false credentials or retry through a block. Everything it
 * keeps is what the publisher chose to put in a feed they publish for readers,
 * and every reader is sent to the publisher's own URL.
 *
 * Politeness is enforced in three places: `poll_interval_minutes` on the source
 * decides whether a fetch happens at all, `REQUEST_TIMEOUT_MS` bounds how long
 * we hold a connection, and `MAX_RESPONSE_BYTES` bounds how much we will read.
 * A source that fails is backed off by `lib/ai-news/ingest.ts` rather than
 * retried tightly.
 *
 * Deliberately dependency-free. Bringing in an XML parser for this would add a
 * runtime dependency to a project that has kept its parsing in-repo (see
 * `lib/metadata-extract.ts`), and feed XML is a small, well-known subset. The
 * parsing here is defensive rather than complete: anything it cannot understand
 * becomes a skipped item, never a thrown error, because one malformed entry
 * must not cost the other forty.
 */

import { hostOf, parsePublishedAt, stripHtml } from "./normalize.ts";

/** One item as a feed gave it to us, before any classification. */
export type FetchedArticle = {
  title: string;
  url: string;
  /** The feed's own snippet. Stored for classification; never rendered. */
  excerpt: string | null;
  author: string | null;
  imageUrl: string | null;
  publishedAt: Date | null;
  /**
   * A public interaction count the source's API reports — Hacker News points
   * plus comments, today. Real engagement data from an API that offers it,
   * which is why the trend score has a term for it; null everywhere else,
   * because inventing one would be worse than not having it.
   */
  externalEngagement: number | null;
};

export type SourceConfig = {
  id?: string;
  name: string;
  source_type: string;
  feed_url: string | null;
  api_endpoint: string | null;
  publisher: string | null;
};

/**
 * How long one source may take before we give up on it.
 *
 * Twelve seconds. A run walks several sources in sequence inside a request
 * budget, so a single unresponsive feed must not be able to spend the whole of
 * it — the same argument `lib/supabase/resilient-fetch.ts` makes about a stalled
 * database connection, for the same reason.
 */
export const REQUEST_TIMEOUT_MS = 12_000;

/**
 * The most we will read from one source.
 *
 * Four megabytes is several times the largest well-formed feed and small enough
 * that a misconfigured endpoint returning a video cannot exhaust the worker.
 * Enforced by reading the stream rather than by trusting `content-length`,
 * which is absent on chunked responses and is attacker-controlled anyway.
 */
export const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

/**
 * The identity we present.
 *
 * A real product name and a URL a publisher can visit to see who is polling
 * them and how to reach us. That is the minimum courtesy for automated reading,
 * and it is also self-interested: an anonymous or spoofed agent is the first
 * thing a publisher blocks.
 */
const USER_AGENT = "BharatHuntAINewsBot/1.0 (+https://bharathunt.org/ai; AI news aggregation)";

export class SourceFetchError extends Error {
  /**
   * The HTTP status, when there was one. Assigned in the body rather than
   * declared as a constructor parameter property: Node's built-in TypeScript
   * support is strip-only, and a parameter property is syntax that would have
   * to be *transformed*, so `node --test` and `scripts/ai-news-dry-run.mjs`
   * refuse to load a module containing one.
   */
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "SourceFetchError";
    this.status = status;
  }
}

/** Reads at most `MAX_RESPONSE_BYTES` of a response body as UTF-8 text. */
async function readCapped(response: Response): Promise<string> {
  const body = response.body;
  if (!body) return "";

  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: false });
  const chunks: string[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        throw new SourceFetchError(
          `Response exceeded ${MAX_RESPONSE_BYTES} bytes; source is not a feed or is misconfigured`,
        );
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
  } finally {
    // Releases the connection whether we finished or bailed out.
    await reader.cancel().catch(() => {});
  }

  chunks.push(decoder.decode());
  return chunks.join("");
}

/** One HTTP GET, bounded and identified. */
async function fetchText(url: string, accept: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { accept, "user-agent": USER_AGENT },
      signal: controller.signal,
      redirect: "follow",
      // Never serve a feed from a cache layer: the whole point of the poll is
      // to see what changed since the last one.
      cache: "no-store",
    });

    if (!response.ok) {
      throw new SourceFetchError(`HTTP ${response.status} ${response.statusText}`, response.status);
    }

    return await readCapped(response);
  } catch (error) {
    if (error instanceof SourceFetchError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new SourceFetchError(`Timed out after ${REQUEST_TIMEOUT_MS}ms`);
    }
    throw new SourceFetchError(error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(timer);
  }
}

// ── Minimal XML reading ──────────────────────────────────────────────────

/**
 * The blocks for one repeated element (`item`, `entry`).
 *
 * Written as an explicit scan rather than one global regex: a lazy
 * `<item>[\s\S]*?</item>` is fine until a feed nests a CDATA section containing
 * the literal text `</item>`, at which point it truncates every remaining item.
 * Scanning for the opening tag and then the matching close from that point is
 * both simpler to reason about and immune to that.
 */
function blocksOf(xml: string, tag: string): string[] {
  const blocks: string[] = [];
  const open = new RegExp(`<${tag}(?:\\s[^>]*)?>`, "gi");
  const close = `</${tag}>`;

  let match: RegExpExecArray | null;
  while ((match = open.exec(xml)) !== null) {
    const start = match.index + match[0].length;
    const end = xml.indexOf(close, start);
    if (end === -1) break;
    blocks.push(xml.slice(start, end));
    open.lastIndex = end + close.length;
    // A feed with tens of thousands of items is not a feed we should be
    // ingesting in one pass.
    if (blocks.length >= 200) break;
  }

  return blocks;
}

/** The text of the first `<tag>` in `block`, CDATA unwrapped, tags stripped. */
function tagText(block: string, ...tags: string[]): string | null {
  for (const tag of tags) {
    const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i").exec(block);
    if (!match) continue;
    const raw = match[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/i, "$1");
    const text = stripHtml(raw);
    if (text) return text;
  }
  return null;
}

/** The value of `attribute` on the first `<tag …>` in `block`. */
function tagAttribute(block: string, tag: string, attribute: string): string | null {
  const match = new RegExp(`<${tag}\\b[^>]*\\b${attribute}\\s*=\\s*["']([^"']+)["'][^>]*>`, "i").exec(
    block,
  );
  return match ? stripHtml(match[1]) : null;
}

/**
 * The article URL for an Atom entry.
 *
 * Atom puts the link in an attribute and may carry several — `alternate` is the
 * human-readable page, while `self`, `replies` and `enclosure` are not. Prefer
 * the explicit alternate, fall back to the first link with no `rel` at all
 * (which the spec defines as alternate), and only then to any link.
 */
function atomLink(block: string): string | null {
  const links = block.match(/<link\b[^>]*>/gi) ?? [];

  const hrefOf = (tag: string) => /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1] ?? null;
  const relOf = (tag: string) => /\brel\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase() ?? null;

  return (
    links.filter((tag) => relOf(tag) === "alternate").map(hrefOf).find(Boolean) ??
    links.filter((tag) => relOf(tag) === null).map(hrefOf).find(Boolean) ??
    links.map(hrefOf).find(Boolean) ??
    null
  );
}

/** An image for the item, from wherever this particular feed puts one. */
function itemImage(block: string): string | null {
  const candidate =
    tagAttribute(block, "media:content", "url") ??
    tagAttribute(block, "media:thumbnail", "url") ??
    // `<enclosure>` is also used for audio and video; only take it if the type
    // says image, or if there is no type and the extension does.
    (() => {
      const enclosure = /<enclosure\b[^>]*>/i.exec(block)?.[0];
      if (!enclosure) return null;
      const type = /\btype\s*=\s*["']([^"']+)["']/i.exec(enclosure)?.[1] ?? "";
      const url = /\burl\s*=\s*["']([^"']+)["']/i.exec(enclosure)?.[1] ?? null;
      if (!url) return null;
      if (type.startsWith("image/")) return url;
      return /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(url) ? url : null;
    })() ??
    // Last resort: the first <img> inside the description. Common on WordPress
    // feeds, which inline the featured image there and nowhere else.
    /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i.exec(block)?.[1] ??
    null;

  if (!candidate) return null;
  // Only ever an absolute http(s) image. A protocol-relative or relative src
  // cannot be resolved without the publisher's base URL, and guessing one is
  // how you end up hotlinking the wrong host.
  return /^https?:\/\//i.test(candidate) ? candidate : null;
}

// ── Adapters ─────────────────────────────────────────────────────────────

/**
 * RSS 2.0 and Atom, which in practice arrive interchangeably: plenty of feeds
 * advertised as RSS are Atom and vice versa, so both element names are tried
 * rather than trusting the `source_type` column.
 */
export function parseFeed(xml: string): FetchedArticle[] {
  const items = blocksOf(xml, "item");
  const entries = items.length > 0 ? items : blocksOf(xml, "entry");
  const isAtom = items.length === 0;

  const articles: FetchedArticle[] = [];

  for (const block of entries) {
    const title = tagText(block, "title");
    const url = isAtom ? (atomLink(block) ?? tagText(block, "link")) : tagText(block, "link", "guid");

    // An item with no headline or no link is not an article. Skipped silently:
    // feeds legitimately carry non-article entries, and logging each one would
    // bury the failures that matter.
    if (!title || !url || !/^https?:\/\//i.test(url)) continue;

    articles.push({
      title,
      url,
      excerpt: tagText(block, "description", "summary", "content:encoded", "content"),
      author: tagText(block, "dc:creator", "author", "name"),
      imageUrl: itemImage(block),
      publishedAt: parsePublishedAt(
        // `updated` last: a feed that re-stamps every entry on every edit would
        // otherwise make its whole archive look new on each poll.
        tagText(block, "pubDate", "published", "dc:date", "updated"),
      ),
      externalEngagement: null,
    });
  }

  return articles;
}

/**
 * arXiv's export API, which returns Atom with the abstract in `<summary>` and
 * the abstract page as `<id>`.
 *
 * The `id` is preferred over the alternate link because arXiv's alternate is
 * versioned (`…v2`) and the id is not — otherwise every revision of a paper
 * would arrive as a new article.
 */
export function parseArxiv(xml: string): FetchedArticle[] {
  const articles: FetchedArticle[] = [];

  for (const block of blocksOf(xml, "entry")) {
    const title = tagText(block, "title");
    const id = tagText(block, "id");
    const url = id && /^https?:\/\//i.test(id) ? id.replace(/v\d+$/, "") : atomLink(block);
    if (!title || !url) continue;

    articles.push({
      title,
      url,
      excerpt: tagText(block, "summary"),
      author: tagText(block, "name"),
      imageUrl: null,
      publishedAt: parsePublishedAt(tagText(block, "published", "updated")),
      externalEngagement: null,
    });
  }

  return articles;
}

/** One hit from Algolia's Hacker News search API. */
type HnHit = {
  objectID?: string;
  title?: string | null;
  story_title?: string | null;
  url?: string | null;
  story_url?: string | null;
  author?: string | null;
  points?: number | null;
  num_comments?: number | null;
  created_at?: string | null;
};

/**
 * Hacker News through Algolia's public search API.
 *
 * The only source that carries a genuine public engagement figure, which is why
 * `externalEngagement` exists at all: points plus comments is a count of things
 * real people did, published by an API that offers it for this purpose. A
 * submission with no outbound URL (a text post) points at its HN discussion,
 * which is then the primary document.
 */
export function parseHackerNews(json: string): FetchedArticle[] {
  const payload = JSON.parse(json) as { hits?: HnHit[] };
  const hits = Array.isArray(payload.hits) ? payload.hits : [];
  const articles: FetchedArticle[] = [];

  for (const hit of hits) {
    const title = (hit.title ?? hit.story_title ?? "").trim();
    const url =
      hit.url ??
      hit.story_url ??
      (hit.objectID ? `https://news.ycombinator.com/item?id=${hit.objectID}` : null);
    if (!title || !url || !/^https?:\/\//i.test(url)) continue;

    const points = typeof hit.points === "number" ? hit.points : 0;
    const comments = typeof hit.num_comments === "number" ? hit.num_comments : 0;

    articles.push({
      title,
      url,
      // No excerpt: HN carries a title and a link, and the story text on an Ask
      // HN post is a user's writing, not a publisher's summary.
      excerpt: null,
      author: hit.author ?? null,
      imageUrl: null,
      publishedAt: parsePublishedAt(hit.created_at),
      externalEngagement: points + comments,
    });
  }

  return articles;
}

/** One record from GDELT's document API. */
type GdeltArticle = {
  url?: string | null;
  title?: string | null;
  seendate?: string | null;
  socialimage?: string | null;
  domain?: string | null;
  language?: string | null;
};

/**
 * GDELT's document API.
 *
 * Its `seendate` is `YYYYMMDDTHHMMSSZ`, which `new Date()` will not parse, so it
 * is expanded to ISO-8601 first. Non-English records are dropped: the
 * classifier's lexicon is English, and scoring a Portuguese headline against it
 * produces a confident-looking zero rather than an honest one.
 */
export function parseGdelt(json: string): FetchedArticle[] {
  const payload = JSON.parse(json) as { articles?: GdeltArticle[] };
  const records = Array.isArray(payload.articles) ? payload.articles : [];
  const articles: FetchedArticle[] = [];

  for (const record of records) {
    const title = (record.title ?? "").trim();
    const url = record.url ?? null;
    if (!title || !url || !/^https?:\/\//i.test(url)) continue;
    if (record.language && record.language.toLowerCase() !== "english") continue;

    const seen = record.seendate ?? "";
    const iso = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(seen);

    articles.push({
      title,
      url,
      excerpt: null,
      author: null,
      imageUrl: record.socialimage && /^https?:\/\//i.test(record.socialimage) ? record.socialimage : null,
      publishedAt: iso
        ? parsePublishedAt(`${iso[1]}-${iso[2]}-${iso[3]}T${iso[4]}:${iso[5]}:${iso[6]}Z`)
        : null,
      externalEngagement: null,
    });
  }

  return articles;
}

/**
 * Fetch and parse one source.
 *
 * Throws `SourceFetchError` on anything that went wrong; the caller records it
 * against the source and moves to the next one (section 32 — one broken source
 * must not stop the others).
 */
export async function fetchSourceArticles(source: SourceConfig): Promise<FetchedArticle[]> {
  const endpoint = source.feed_url ?? source.api_endpoint;
  if (!endpoint) throw new SourceFetchError("Source has no feed_url or api_endpoint");
  if (!/^https?:\/\//i.test(endpoint)) throw new SourceFetchError("Endpoint is not an http(s) URL");

  switch (source.source_type) {
    case "hn":
      return parseHackerNews(await fetchText(endpoint, "application/json"));
    case "gdelt":
      return parseGdelt(await fetchText(endpoint, "application/json"));
    case "arxiv":
      return parseArxiv(await fetchText(endpoint, "application/atom+xml, application/xml;q=0.9"));
    case "rss":
    case "atom":
      return parseFeed(
        await fetchText(endpoint, "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8"),
      );
    case "manual":
      // Never fetched; the row exists so hand-added articles have a source to
      // be attributed to.
      return [];
    default:
      throw new SourceFetchError(`Unsupported source_type "${source.source_type}"`);
  }
}

/**
 * The publication name to stamp on an article from this source.
 *
 * The configured publisher wins, because it is what an operator typed. For
 * aggregators there is no single publisher — a GDELT record can come from any
 * outlet on earth — so the article's own host is used instead, which is both
 * more accurate and what makes `source_count` mean "distinct publications"
 * rather than "distinct feeds".
 */
export function attributionFor(source: SourceConfig, articleUrl: string): string {
  const aggregator = source.source_type === "gdelt" || source.source_type === "hn";
  if (aggregator) {
    const host = hostOf(articleUrl);
    if (host) return host;
  }
  return source.publisher?.trim() || source.name;
}
