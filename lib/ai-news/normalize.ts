/**
 * The primitives deduplication and grouping are built on.
 *
 * Every function here is pure and dependency-free — no `next/*`, no Supabase, no
 * Node built-ins — so `tests/ai-news-normalize.test.ts` exercises the real
 * implementations rather than a copy of them. That matters more here than
 * usual: these decide whether running ingestion a second time creates a second
 * copy of the news, and that is not a property anyone can eyeball.
 *
 * Deliberately self-contained. `lib/funding/normalize.ts` solves a neighbouring
 * problem for a neighbouring pipeline and several of these functions rhyme with
 * its own, but the two feature sets are independent and neither should be able
 * to break the other by retuning a threshold for itself. There is no shared
 * data path between them, so there is no parity contract to maintain — unlike
 * `lib/search.ts` and `search_normalize()`, which genuinely must agree.
 */

/**
 * Query parameters that identify a *campaign*, not a document.
 *
 * Dropping them is what makes the same article shared from three places one
 * row. Kept short and explicit on purpose: stripping an unknown parameter is
 * how you turn two genuinely different pages into one, and `?id=` or `?p=` are
 * the whole address on plenty of sites.
 */
const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "utm_name",
  "utm_reader",
  "itm_source",
  "itm_medium",
  "itm_campaign",
  "fbclid",
  "gclid",
  "dclid",
  "msclkid",
  "twclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "ref",
  "referrer",
  "source",
  "amp",
  "at_medium",
  "at_campaign",
  "guccounter",
  // Google News stamps `?oc=5` on every link in its RSS output; GDELT and a few
  // wire feeds add `?feedType=` / `?feedName=`.
  "oc",
  "feedtype",
  "feedname",
  // arXiv's Atom feed links carry a version suffix in the path, not here, but
  // its API adds `?context=` when a paper is cross-listed.
  "context",
]);

/**
 * The canonical form of an article URL — the primary duplicate key.
 *
 * Lower-cased scheme and host, no `www.`, no fragment, no tracking parameters,
 * remaining parameters sorted, no trailing slash. `http` is folded to `https`:
 * a publication that moved to TLS mid-feed would otherwise re-import its whole
 * archive under new keys.
 *
 * Returns null for anything that is not an http(s) URL, and a null never
 * reaches the database — an article we cannot key is an article we cannot
 * promise not to duplicate, so ingestion drops it.
 */
export function normalizeUrl(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;

  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;

  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (!host) return null;

  const params = [...parsed.searchParams.entries()]
    .filter(([key]) => !TRACKING_PARAMS.has(key.toLowerCase()))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  const search = params.length ? `?${params.map(([k, v]) => `${k}=${v}`).join("&")}` : "";

  // A trailing slash on a path is decoration; on the root it is the path.
  const path = parsed.pathname.length > 1 ? parsed.pathname.replace(/\/+$/, "") : "";

  return `https://${host}${path}${search}`;
}

/** The registrable-ish host of a URL, for display and for source attribution. */
export function hostOf(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

/**
 * `String.fromCodePoint` throws on anything outside the Unicode range, and a
 * malformed entity in a stranger's RSS feed must not be able to abort an
 * ingestion run. An unusable code point is left as the literal text it was.
 */
function codePoint(value: number, fallback: string): string {
  if (!Number.isInteger(value) || value < 0 || value > 0x10ffff) return fallback;
  try {
    return String.fromCodePoint(value);
  } catch {
    return fallback;
  }
}

/** The handful of HTML entities that actually appear in RSS titles. */
export function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (match, hex: string) => codePoint(Number.parseInt(hex, 16), match))
    .replace(/&#(\d+);/g, (match, dec: string) => codePoint(Number(dec), match))
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    // Ampersand last, or `&amp;lt;` would decode twice into a tag.
    .replace(/&amp;/gi, "&");
}

/** Strips tags and collapses whitespace. RSS descriptions are full of markup. */
export function stripHtml(raw: string | null | undefined): string {
  if (!raw || typeof raw !== "string") return "";
  return decodeEntities(raw.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Comparable form of a headline: lower-cased, unaccented, punctuation folded to
 * spaces, whitespace collapsed.
 *
 * Also the input to `contentHash`, which is why entities and curly quotes are
 * resolved first — a title arriving as `Byju&#x27;s` in one feed and `Byju’s` in
 * another is the same word both times.
 */
export function normalizeTitle(raw: string | null | undefined): string {
  if (!raw || typeof raw !== "string") return "";

  return decodeEntities(raw)
    .normalize("NFKD")
    // Strip combining marks so "Café" and "Cafe" match. Written as escapes
    // rather than literal combining characters, which are invisible in a diff.
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Legal-form suffixes, removed before two company names are compared.
 *
 * Note what is *not* here: "labs", "technologies", "research", "ai". Those are
 * part of a name — "Stability AI" is not "Stability" — and an over-eager list
 * merges entities that are genuinely different, which is the worst failure this
 * file can produce.
 */
const LEGAL_SUFFIXES = [
  "private limited",
  "pvt ltd",
  "pvt limited",
  "pvt",
  "limited",
  "ltd",
  "llp",
  "llc",
  "inc",
  "incorporated",
  "corp",
  "corporation",
  "gmbh",
  "co",
];

/**
 * Comparable form of a company, model, person or tool name.
 *
 * This is what `ai_entities.normalized_name` stores, and it is unique per
 * entity type — so this function decides when a second story is about something
 * we already know rather than about something new.
 */
export function normalizeEntityName(raw: string | null | undefined): string {
  let name = normalizeTitle(raw);
  if (!name) return "";

  // Repeatedly, because "ABC Pvt Ltd" carries two of them.
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of LEGAL_SUFFIXES) {
      if (name.endsWith(` ${suffix}`)) {
        name = name.slice(0, -(suffix.length + 1)).trim();
        changed = true;
      }
    }
  }
  return name;
}

/**
 * URL-safe slug matching the `^[a-z0-9]+(-[a-z0-9]+)*$` CHECK constraint the
 * schema puts on every slug column.
 *
 * Returns "" for input with nothing slug-able in it; callers must treat that as
 * a failure rather than writing an empty slug, because the constraint would
 * reject it anyway — better to fail where the reason is legible.
 */
export function slugify(raw: string | null | undefined): string {
  return normalizeTitle(raw).replace(/\s+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * A story slug: readable, bounded, and cut on a word boundary.
 *
 * Capped at 70 characters because these are URLs people paste, and a headline
 * slug is the difference between `/ai/openai-launches-new-reasoning-model` and
 * eighteen words of subtitle. The cut lands on the last complete word so the
 * tail is never a fragment.
 */
export function storySlug(title: string, maxLength = 70): string {
  const full = slugify(title);
  if (full.length <= maxLength) return full;

  const cut = full.slice(0, maxLength);
  const lastDash = cut.lastIndexOf("-");
  return (lastDash > 20 ? cut.slice(0, lastDash) : cut).replace(/-+$/, "");
}

/**
 * Stable digest of an article's substance, for the secondary duplicate check.
 *
 * SHA-256 through Web Crypto rather than `node:crypto`, so the same code runs in
 * the Node dev server, in a Cloudflare Worker and in the test runner.
 * Truncated to 128 bits — this index only ever narrows a candidate set that a
 * comparison then confirms, so the full digest buys nothing.
 *
 * Built from the *normalised* title and excerpt, which is the point: the same
 * story republished with a different headline case, a smart quote or an extra
 * "| VentureBeat" hashes identically.
 */
export async function contentHash(title: string, excerpt?: string | null): Promise<string> {
  const material = `${normalizeTitle(title)}::${normalizeTitle(excerpt ?? "").slice(0, 400)}`;
  const bytes = new TextEncoder().encode(material);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Words that carry no signal about *which* story a headline is, and would
 * otherwise dominate the overlap score between any two AI headlines.
 *
 * "ai" and "model" are in here for that reason and it is worth being explicit
 * about it: on a page where every headline mentions AI, the word AI cannot be
 * evidence that two headlines are about the same event.
 */
const HEADLINE_STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "can", "could", "do", "does", "for",
  "from", "has", "have", "how", "in", "into", "is", "it", "its", "may", "more", "new", "now", "of",
  "on", "or", "over", "s", "says", "than", "that", "the", "their", "this", "to", "up", "was",
  "what", "when", "which", "who", "why", "will", "with", "you", "your",
  "ai", "artificial", "intelligence", "model", "models", "tech", "report", "latest",
]);

/**
 * Verbs that describe the same event, folded to one token before two headlines
 * are compared.
 *
 * This is what makes word overlap work on news headlines at all. Two
 * publications reporting one launch write "OpenAI releases new model" and
 * "OpenAI launches latest AI model": once stopwords are gone that is {openai,
 * releases} against {openai, launches}, which share exactly one token — the
 * company — and so score identically to "OpenAI opens an office in Bengaluru",
 * which is a completely different event. No ratio over those word sets can tell
 * the two cases apart, because the only thing they have in common is the thing
 * the grouping test already requires separately.
 *
 * Folding the verb fixes it in the right place. The true pair becomes {openai,
 * release} against {openai, release} — 1.0 — while the office story stays at
 * 0.2, because "opens an office in Bengaluru" is genuinely different words
 * about a genuinely different event.
 *
 * Deliberately short, and only verbs that are interchangeable *in a headline
 * about the same event*. "Announces" and "launches" are; "announces" and
 * "delays" are not, however similar their grammar.
 */
const EVENT_VERB_SYNONYMS: Record<string, string> = {
  releases: "release",
  release: "release",
  released: "release",
  launches: "release",
  launch: "release",
  launched: "release",
  unveils: "release",
  unveiled: "release",
  debuts: "release",
  introduces: "release",
  introduced: "release",
  announces: "release",
  announced: "release",
  ships: "release",
  shipped: "release",
  rolls: "release",

  raises: "raise",
  raised: "raise",
  secures: "raise",
  secured: "raise",
  bags: "raise",
  lands: "raise",
  closes: "raise",

  acquires: "acquire",
  acquired: "acquire",
  buys: "acquire",
  bought: "acquire",

  sues: "sue",
  sued: "sue",
  suing: "sue",

  bans: "ban",
  banned: "ban",
  blocks: "ban",
  blocked: "ban",
};

/**
 * The words in a headline that could distinguish it from another headline,
 * with interchangeable event verbs folded together.
 */
export function significantWords(title: string): string[] {
  return normalizeTitle(title)
    .split(" ")
    .filter((word) => word.length > 1 && !HEADLINE_STOPWORDS.has(word))
    .map((word) => EVENT_VERB_SYNONYMS[word] ?? word);
}

/**
 * Jaccard overlap of two headlines' significant-word sets, 0..1.
 *
 * The tertiary duplicate check. "OpenAI releases new model" against "OpenAI
 * launches latest AI model" is {openai, release} against {openai, release} once
 * stopwords are removed and the event verb is folded — the section 12 pair,
 * scoring 1.0. "OpenAI opens an office in Bengaluru" against the same headline
 * scores 0.2, because nothing but the company is shared.
 *
 * Still only a *candidate* signal, and `DUPLICATE_TITLE_THRESHOLD` is set well
 * below 1: `findStoryForArticle` treats a pair as one event only when a shared
 * primary entity and a publication window agree as well.
 */
export function titleSimilarity(a: string, b: string): number {
  const left = new Set(significantWords(a));
  const right = new Set(significantWords(b));
  if (left.size === 0 || right.size === 0) return 0;

  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;

  return shared / (left.size + right.size - shared);
}

/**
 * Feed titles often carry their publisher after a trailing " - " or " | ",
 * e.g. "Anthropic ships a new Claude - Ars Technica".
 *
 * Splitting on the *last* separator, and only when the tail is short enough to
 * be a masthead, keeps hyphenated headlines intact — "Nvidia's quarter - what it
 * means for AI" would otherwise lose half its headline to a publisher field.
 */
export function splitPublisherSuffix(title: string): {
  headline: string;
  publisher: string | null;
} {
  const clean = decodeEntities(title ?? "").trim();

  for (const separator of [" - ", " | ", " — "]) {
    const index = clean.lastIndexOf(separator);
    if (index <= 0) continue;

    const head = clean.slice(0, index).trim();
    const tail = clean.slice(index + separator.length).trim();

    // A masthead is a few words. Anything longer is part of the headline.
    const looksLikePublisher = tail.length > 0 && tail.length <= 40 && tail.split(/\s+/).length <= 5;
    if (looksLikePublisher && head.length >= 10) {
      return { headline: head, publisher: tail };
    }
  }

  return { headline: clean, publisher: null };
}

/** Milliseconds in a week — the story-key bucket below. */
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The identity of an *event*, as opposed to an article about one.
 *
 * Primary entity + the three most distinctive headline words + a seven-day
 * bucket. Unique in the schema, so two ingestion runs racing on the same feed
 * cannot both create the story.
 *
 * This is a *guard*, not the grouping algorithm. Grouping is
 * `findStoryForArticle` in ingest.ts, which looks for a recent story sharing an
 * entity and a similar headline — a real similarity search, which a string key
 * cannot be. The key exists so that when two workers reach the same conclusion
 * at the same moment, the second one's insert fails cleanly and it attaches to
 * the first one's story instead.
 *
 * The week bucket bounds the other direction: without it, a company's second
 * launch a year later with a similar headline would collide with the first
 * forever. Seven days is longer than `STORY_WINDOW_HOURS`, so the similarity
 * search always gets to decide first; the bucket only ever separates events far
 * enough apart that nothing else would have joined them anyway.
 */
export function storyKey(input: {
  primaryEntity: string | null;
  title: string;
  at: string | Date | null;
}): string {
  const entity = normalizeEntityName(input.primaryEntity ?? "").replace(/\s+/g, "-") || "unknown";

  const signature =
    significantWords(input.title)
      // Longest first: the distinctive word in a headline is almost never
      // "gets" or "said", and sorting alphabetically afterwards makes the key
      // independent of word order.
      .sort((a, b) => b.length - a.length)
      .slice(0, 3)
      .sort()
      .join("-") || "untitled";

  const at = input.at instanceof Date ? input.at : new Date(input.at ?? Date.now());
  const week = Number.isNaN(at.getTime()) ? 0 : Math.floor(at.getTime() / WEEK_MS);

  return `${entity}:${signature}:${week}`;
}

/**
 * A publication timestamp we are willing to believe.
 *
 * Feeds get this wrong in three ways that all have the same consequence for a
 * recency-weighted ranking: a missing date, an unparseable one, and a date in
 * the future (a scheduled post, a timezone bug, a publisher gaming freshness).
 * All three return null, and a null date means the story is ranked on what else
 * is known about it rather than on a number we invented — see
 * `computeTrendScore`, which returns a null score when recency is unavailable
 * and nothing else compensates.
 *
 * A small forward tolerance is allowed because clocks disagree by seconds and
 * rejecting an article for being three seconds early would be pedantry.
 */
export function parsePublishedAt(
  raw: string | null | undefined,
  now: Date = new Date(),
): Date | null {
  if (!raw) return null;

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;

  const FORWARD_TOLERANCE_MS = 5 * 60 * 1000;
  if (parsed.getTime() > now.getTime() + FORWARD_TOLERANCE_MS) return null;

  // Nothing in a news feed is from 1995. A date that old is a parsing artifact
  // (an epoch-zero default, a malformed year), not an old article.
  const TEN_YEARS_MS = 10 * 365 * 24 * 60 * 60 * 1000;
  if (parsed.getTime() < now.getTime() - TEN_YEARS_MS) return null;

  return parsed;
}
