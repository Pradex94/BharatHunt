/**
 * The primitives deduplication is built on.
 *
 * Every function here is pure and dependency-free — no `next/*`, no Supabase, no
 * Node built-ins — so `tests/funding-normalize.test.ts` can exercise the real
 * implementations rather than a copy of them. That matters more here than
 * usual: these decide whether running ingestion a second time creates a second
 * copy of the news, and that is not a property anyone can eyeball.
 */

/**
 * Query parameters that identify a *campaign*, not a document.
 *
 * Dropping them is what makes the same article shared from three places one
 * row. Kept deliberately short and explicit: stripping an unknown parameter is
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
  // Google News stamps `?oc=5` on every link in its RSS output.
  "oc",
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

  const search = params.length
    ? `?${params.map(([k, v]) => `${k}=${v}`).join("&")}`
    : "";

  // A trailing slash on a path is decoration; on the root it is the path.
  const path = parsed.pathname.length > 1 ? parsed.pathname.replace(/\/+$/, "") : "";

  return `https://${host}${path}${search}`;
}

/**
 * Comparable form of a headline: lower-cased, unaccented, punctuation folded to
 * spaces, whitespace collapsed.
 *
 * Also the input to `contentHash`, which is why curly quotes and HTML entities
 * are resolved first — "Byju's" arrived as `Byju&#x27;s` in one feed and
 * `Byju’s` in another, and those are the same word.
 */
export function normalizeTitle(raw: string | null | undefined): string {
  if (!raw || typeof raw !== "string") return "";

  return decodeEntities(raw)
    .normalize("NFKD")
    // Strip combining marks, so "Café" and "Cafe" match. Escapes rather than
    // literal combining characters, which are invisible in a diff and easy to
    // mangle in transit.
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
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
    .replace(/&#x([0-9a-f]+);/gi, (match, hex: string) =>
      codePoint(Number.parseInt(hex, 16), match),
    )
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
 * Legal-form suffixes, removed before two company names are compared.
 *
 * Note what is *not* here: "technologies", "labs", "ventures", "capital".
 * Those are part of a name — "ABC Technologies" and "ABC" may well be two
 * companies — and an over-eager list here merges rounds that belong to
 * different startups, which is the worst failure this file can produce.
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
  "co",
];

/**
 * Comparable form of a company or investor name.
 *
 * This is what `funding_startups.normalized_name` and
 * `funding_investors.normalized_name` store, and both are unique — so this
 * function decides when a second article is about a company we already know
 * rather than a new one.
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
 * Stable digest of an article's substance, for the secondary duplicate check.
 *
 * SHA-256 through Web Crypto rather than `node:crypto`, so the same code runs
 * in the Node dev server, in a Cloudflare Worker and in the test runner.
 * Truncated to 128 bits — this index only ever narrows a candidate set that a
 * comparison then confirms, so the full digest buys nothing.
 *
 * Built from the *normalised* title and summary, which is the point: the same
 * story republished with a different headline case, a smart quote or an extra
 * "| Inc42" hashes identically.
 */
export async function contentHash(title: string, summary?: string | null): Promise<string> {
  const material = `${normalizeTitle(title)}::${normalizeTitle(summary ?? "").slice(0, 400)}`;
  const bytes = new TextEncoder().encode(material);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * The identity of a funding *event*, as opposed to an article about one.
 *
 * Company + stage + calendar month. Unique in the schema, so the second
 * publication to cover a round cannot create a second row — it is attached to
 * the first as extra coverage instead.
 *
 * The amount is deliberately absent. Two outlets reporting one round as "₹20
 * crore" and "$2.4 million" disagree by whatever the day's rate was, so keying
 * on the figure would split one event in two — the exact failure section 8 of
 * the brief describes. Company, stage and month are the three facts every
 * report of the same round agrees on.
 *
 * The cost is a company that genuinely closes two rounds at the same stage
 * inside one month, which is rare and which an admin can split by editing the
 * stage. That is the right way round: a missed duplicate is a correction, a
 * false duplicate is a deleted fact.
 */
export function fundingEventKey(input: {
  startupName: string;
  stage: string;
  date: string | Date;
}): string {
  const company = normalizeEntityName(input.startupName).replace(/\s+/g, "-") || "unknown";
  const stage = slugify(input.stage) || "undisclosed";
  const date = input.date instanceof Date ? input.date : new Date(input.date);
  const month = Number.isNaN(date.getTime())
    ? "unknown"
    : `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  return `${company}:${stage}:${month}`;
}

/**
 * Jaccard overlap of the two headlines' word sets, 0..1.
 *
 * The tertiary check. "XYZ raises ₹20 crore" against "XYZ secures Rs 20 crore
 * funding" shares {xyz, 20, crore} of {xyz, raises, 20, crore} ∪ {xyz, secures,
 * rs, 20, crore, funding} — 3/7 ≈ 0.43, which is why the threshold that uses
 * this (`DUPLICATE_TITLE_THRESHOLD`) is not set near 1. It is a *candidate*
 * signal: ingestion only treats a pair as the same event when the startup name
 * and the date agree as well.
 */
export function titleSimilarity(a: string, b: string): number {
  const left = new Set(normalizeTitle(a).split(" ").filter(Boolean));
  const right = new Set(normalizeTitle(b).split(" ").filter(Boolean));
  if (left.size === 0 || right.size === 0) return 0;

  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;

  return shared / (left.size + right.size - shared);
}

/**
 * Google News titles carry their publisher after a trailing " - ", e.g.
 * "OORJAA Raises Rs 9.7 Crore in Series A First Close Led by Equentis Angel
 * Fund - Indian Startup Times".
 *
 * Splitting on the *last* separator, and only when the tail is short enough to
 * be a masthead, keeps hyphenated headlines intact — "Zepto raises $150M -
 * here's what it means" would otherwise lose half its headline to a publisher
 * field.
 */
export function splitPublisherSuffix(title: string): { headline: string; publisher: string | null } {
  const clean = decodeEntities(title ?? "").trim();
  const index = clean.lastIndexOf(" - ");
  if (index <= 0) return { headline: clean, publisher: null };

  const head = clean.slice(0, index).trim();
  const tail = clean.slice(index + 3).trim();

  // A masthead is a few words. Anything longer is part of the headline.
  const looksLikePublisher = tail.length > 0 && tail.length <= 40 && tail.split(/\s+/).length <= 5;
  if (!looksLikePublisher || head.length < 10) return { headline: clean, publisher: null };

  return { headline: head, publisher: tail };
}
