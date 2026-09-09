import { decodeEntities, stripHtml } from "./normalize.ts";

/**
 * Parsing feeds into items — the pure half of `lib/funding/sources.ts`.
 *
 * Split out so it can be tested against real feed XML in plain Node.
 * `sources.ts` is `server-only` because it makes network calls; nothing here
 * does, and the parsing is the part with edge cases worth pinning down (CDATA,
 * Atom's attribute links, `<media:content>`, RFC-822 dates, a publisher's clock
 * running fast).
 *
 * A deliberately small parser rather than an XML dependency. The shape being
 * read is tiny and fully specified — a handful of child elements of `<item>` or
 * `<entry>` — and a general parser would buy correctness on XML this code never
 * looks at, in exchange for a dependency to audit and ship into a Worker
 * bundle. The one thing it must get right is CDATA, because every WordPress
 * feed wraps its titles and descriptions in it.
 */

export type FeedItem = {
  title: string;
  url: string;
  /** The feed's own snippet, HTML stripped. Never rendered; extraction reads it. */
  summary: string | null;
  publishedAt: string | null;
  author: string | null;
  imageUrl: string | null;
  /**
   * The publication, when the item names one that differs from the source —
   * Google News items carry the original outlet in `<source>`.
   */
  publisher: string | null;
  /**
   * True when the item body is not real article text, so extraction has only
   * the headline to work from and must score itself lower.
   */
  headlineOnly: boolean;
};

/**
 * A summary shorter than this is not article text.
 *
 * Google News `<description>` is a single anchor tag pointing back at the item,
 * so once markup is stripped what remains is the headline again. Detecting that
 * is what lets the extractor score those items honestly instead of treating a
 * repeated headline as corroboration.
 */
const MIN_BODY_LENGTH = 80;

export function parseFeed(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  // RSS `<item>` and Atom `<entry>` in one pass; feeds in the wild are one or
  // the other and never both.
  const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) ?? [];

  for (const block of blocks) {
    const title = text(block, "title");
    const url = link(block);
    if (!title || !url) continue;

    const description =
      text(block, "content:encoded") ?? text(block, "description") ?? text(block, "summary");
    const summary = description ? stripHtml(description) : null;

    items.push({
      title: decodeEntities(title).trim(),
      url,
      summary,
      publishedAt: feedDate(
        text(block, "pubDate") ??
          text(block, "published") ??
          text(block, "updated") ??
          text(block, "dc:date"),
      ),
      author: text(block, "dc:creator") ?? text(block, "author") ?? null,
      imageUrl: image(block, description),
      publisher: text(block, "source"),
      headlineOnly: !summary || summary.length < MIN_BODY_LENGTH,
    });
  }

  return items;
}

/** The text of the first matching child element, CDATA unwrapped. */
function text(block: string, tag: string): string | null {
  const escaped = tag.replace(/[:]/g, "\\:");
  const match = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)</${escaped}>`, "i").exec(block);
  if (!match) return null;

  const inner = match[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/i, "$1").trim();
  return inner.length > 0 ? inner : null;
}

/**
 * The item's URL.
 *
 * Atom puts it in an attribute (`<link href="…"/>`) while RSS puts it in the
 * element body, and a few feeds carry both — so the element is tried first and
 * `<guid isPermaLink="true">` is the last resort, which is what Entrackr's feed
 * provides most reliably (and with a leading space inside the CDATA, which the
 * trim above removes).
 */
function link(block: string): string | null {
  const body = text(block, "link");
  if (body && /^https?:\/\//i.test(body)) return decodeEntities(body);

  const href = /<link[^>]*\shref=["']([^"']+)["']/i.exec(block);
  if (href && /^https?:\/\//i.test(href[1])) return decodeEntities(href[1]);

  const guid = text(block, "guid");
  if (guid && /^https?:\/\//i.test(guid.trim())) return decodeEntities(guid.trim());

  return null;
}

/** `<media:content url>`, `<enclosure url>`, or the first image in the body. */
function image(block: string, description: string | null): string | null {
  const media = /<media:(?:content|thumbnail)[^>]*\surl=["']([^"']+)["']/i.exec(block);
  if (media) return decodeEntities(media[1]);

  const enclosure = /<enclosure[^>]*\surl=["']([^"']+)["'][^>]*type=["']image\//i.exec(block);
  if (enclosure) return decodeEntities(enclosure[1]);

  if (description) {
    const embedded = /<img[^>]*\ssrc=["']([^"']+)["']/i.exec(description);
    if (embedded) return decodeEntities(embedded[1]);
  }
  return null;
}

/**
 * RFC-822 or ISO, normalised to ISO. Null for anything unparseable.
 *
 * `now` is injectable so the future-date guard is testable without waiting.
 */
export function feedDate(value: string | null, now: Date = new Date()): string | null {
  if (!value) return null;
  const parsed = new Date(value.trim());
  if (Number.isNaN(parsed.getTime())) return null;

  // A feed whose clock is badly wrong would otherwise date an article into the
  // next decade and pin it to the top of the feed forever.
  if (parsed.getTime() > now.getTime() + 48 * 3600 * 1000) return null;
  return parsed.toISOString();
}

type GdeltArticle = {
  title?: unknown;
  url?: unknown;
  seendate?: unknown;
  domain?: unknown;
  socialimage?: unknown;
};

/**
 * GDELT's DOC 2.0 `ArtList` payload.
 *
 * Its articles have no body text at all — only a headline, a domain and a
 * timestamp — so every item is flagged `headlineOnly`.
 */
export function parseGdeltPayload(payload: unknown, limit: number): FeedItem[] {
  const articles =
    payload && typeof payload === "object" && Array.isArray((payload as { articles?: unknown }).articles)
      ? ((payload as { articles: GdeltArticle[] }).articles)
      : [];

  const items: FeedItem[] = [];

  for (const article of articles) {
    const title = typeof article.title === "string" ? article.title.trim() : "";
    const url = typeof article.url === "string" ? article.url.trim() : "";
    if (!title || !/^https?:\/\//i.test(url)) continue;

    items.push({
      title: decodeEntities(title),
      url,
      summary: null,
      publishedAt: gdeltDate(article.seendate),
      author: null,
      imageUrl: typeof article.socialimage === "string" ? article.socialimage : null,
      publisher: typeof article.domain === "string" ? article.domain : null,
      headlineOnly: true,
    });
  }

  return items.slice(0, limit);
}

/** GDELT stamps `seendate` as `YYYYMMDDTHHMMSSZ`, which `new Date()` rejects. */
export function gdeltDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value.trim());
  if (!match) return feedDate(value);

  const [, year, month, day, hour, minute, second] = match;
  const parsed = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
