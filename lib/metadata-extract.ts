/**
 * Pure HTML → product-metadata parsing for the URL importer.
 *
 * Deliberately separate from `lib/actions/fetch-metadata.ts`: that module is a
 * `"use server"` boundary (auth, SSRF guards, network I/O) and may only export
 * async functions, which makes everything in it untestable. These are plain
 * functions over a string, so they can be exercised directly.
 */

export type ProductMetadata = {
  url: string;
  name: string;
  title: string;
  description: string;
  /** One-liner for the tagline field, derived from the title when there's no description. */
  tagline: string;
  /** Best-guess PRODUCT_CATEGORIES entry, or null to leave the picker untouched. */
  category: string | null;
  /** Square logo/favicon for the product avatar (→ hero_image_url). */
  icon: string | null;
  /**
   * Measured width of `icon` in pixels, or `null` when it could not be read.
   *
   * Carried through so the form can say plainly that the logo it found is too
   * small, instead of handing the maker a blurry avatar and staying quiet about
   * it. Some sites genuinely publish nothing better — paytm.com's only logo is
   * a 32px favicon — and in that case the honest move is to ask for an upload,
   * not to pretend the import succeeded.
   */
  iconPixels: number | null;
  /** Wide preview image(s) for the product gallery (→ screenshot_urls). */
  images: string[];
  siteName: string | null;
};

/**
 * Result of an import attempt. `notice` means the page couldn't be read and
 * the data is a URL/favicon fallback rather than a real scrape.
 *
 * Lives here rather than in the `"use server"` action: that module may only
 * export async functions, and re-exporting a type from it makes Turbopack emit
 * a runtime re-export that crashes on module evaluation.
 */
export type FetchMetadataResult =
  | { ok: true; data: ProductMetadata; notice?: string }
  | { ok: false; error: string };

/** What `extractMetadata` knows before we've HTTP-checked anything. */
export type ExtractedMetadata = ProductMetadata & {
  /** Ordered best-first; `resolveIcon` picks the first that actually loads. */
  iconCandidates: string[];
  /** `<link rel="manifest">`, where PWAs keep their big square icons. */
  manifestUrl: string | null;
};

/** `sizes="180x180"` → 180, so we can prefer the biggest declared icon. */
export function parseIconSize(sizes: string | undefined): number {
  if (!sizes) return 0;
  const match = /(\d+)\s*[x×]\s*(\d+)/i.exec(sizes);
  return match ? Number(match[1]) : 0;
}

export function bySizeDesc(a: { size: number }, b: { size: number }): number {
  return b.size - a.size;
}

export function extractMetadata(html: string, baseUrl: string): ExtractedMetadata {
  const og: Record<string, string> = {};
  const tw: Record<string, string> = {};
  const named: Record<string, string> = {};

  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs = parseAttributes(tag);
    const content = attrs["content"];
    if (content === undefined) continue;
    const property = attrs["property"]?.toLowerCase();
    const name = attrs["name"]?.toLowerCase();
    const key = property ?? name;
    if (!key) continue;
    if (key.startsWith("og:")) og[key.slice(3)] ??= content;
    else if (key.startsWith("twitter:")) tw[key.slice(8)] ??= content;
    else if (name) named[name] ??= content;
  }

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const rawTitle = titleMatch ? decodeEntities(collapse(titleMatch[1])) : "";

  const appleIcons: Array<{ href: string; size: number }> = [];
  const linkIcons: Array<{ href: string; size: number }> = [];
  let manifestHref = "";
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const attrs = parseAttributes(tag);
    const rel = (attrs["rel"] ?? "").toLowerCase();
    const href = attrs["href"];
    if (!href) continue;
    const size = parseIconSize(attrs["sizes"]);
    if (rel.includes("apple-touch-icon")) appleIcons.push({ href, size });
    else if (rel.includes("manifest")) manifestHref ||= href;
    else if (rel.includes("icon")) linkIcons.push({ href, size });
  }
  appleIcons.sort(bySizeDesc);
  linkIcons.sort(bySizeDesc);

  const title = og["title"] || tw["title"] || rawTitle;
  const siteName = og["site_name"] || null;

  // Meta descriptions are the happy path, but plenty of sites ship without one.
  // Fall back to JSON-LD, then to the first real paragraph of the page, so the
  // maker gets something to edit instead of an empty form.
  const description = collapse(
    og["description"] ||
      tw["description"] ||
      named["description"] ||
      jsonLdDescription(html) ||
      firstParagraph(html) ||
      "",
  ).slice(0, 1000);

  // "Acme — the fastest way to ship" carries both the name and the pitch.
  const { name: titleName, tagline: titleTagline } = splitTitle(title, siteName);

  // Gallery: the social-preview image(s), absolute + deduped.
  const declaredIcons = new Set<string>();
  for (const { href } of [...appleIcons, ...linkIcons]) {
    const abs = toAbsolute(href, baseUrl);
    if (abs) declaredIcons.add(abs);
  }
  const images: string[] = [];
  for (const raw of [og["image"], og["image:url"], og["image:secure_url"], tw["image"], tw["image:src"]]) {
    const abs = toAbsolute(raw, baseUrl);
    if (abs && !declaredIcons.has(abs) && !images.includes(abs)) images.push(abs);
  }

  // Icon candidates, best first. The maker's real square logo lives in the
  // apple-touch-icon or the PWA manifest; a raster <link rel="icon"> is next.
  // Only after all of those do we accept a bare .ico, then a social image as a
  // stand-in logo — which is what "fetch some other image" means in practice.
  const raster = linkIcons.filter(({ href }) => /\.(png|svg|webp|jpe?g|avif)(\?|#|$)/i.test(href));
  const legacy = linkIcons.filter(({ href }) => !raster.some((r) => r.href === href));
  const origin = safeOrigin(baseUrl);
  const iconCandidates = [
    ...appleIcons.map(({ href }) => href),
    ...raster.map(({ href }) => href),
    named["msapplication-tileimage"],
    ...legacy.map(({ href }) => href),
    og["logo"],
    origin ? `${origin}/favicon.ico` : undefined, // undeclared but conventional
    ...images,
  ]
    .map((href) => toAbsolute(href, baseUrl))
    .filter((href): href is string => Boolean(href))
    .filter((href, index, all) => all.indexOf(href) === index);

  // Capped, because a title with no separator at all becomes the name wholesale
  // and the server rejects anything past 60 characters. Truncating at a word
  // boundary gives the maker something to edit rather than a hard refusal.
  const name = clampName(siteName || titleName || title || "");

  return {
    url: baseUrl,
    name,
    title: title.trim(),
    description,
    // Prefer the page's own one-liner from the title; fall back to the
    // description. Either way the maker gets a filled tagline.
    tagline: titleTagline || description,
    category: inferCategory([name, titleTagline, description, named["keywords"] ?? ""].join(" ")),
    icon: null, // resolved by resolveIcon() once we can make requests
    iconPixels: null,
    images,
    siteName,
    iconCandidates,
    manifestUrl: toAbsolute(manifestHref, baseUrl),
  };
}

/** The longest a product name may be — matches the server check in lib/actions/products.ts. */
export const MAX_NAME_LENGTH = 60;

/**
 * Separators sites use between a product name and its pitch in <title>.
 *
 * The colon is deliberately allowed to sit flush against the brand. Every other
 * separator here needs whitespace on both sides, and requiring it of the colon
 * too missed the single most common title format there is -- "Paytm: Secure &
 * Fast UPI Payments, Recharge Mobile & Pay Bills" never split, so the whole
 * 62-character title became the product name and the server rejected the launch
 * with "Name is required and must be 60 characters or fewer."
 *
 * Trailing whitespace is still required, which is what keeps `https://` and
 * clock times like `10:30` from being treated as separators.
 *
 * The hyphen keeps both spaces on purpose: a bare `-` is far more often part of
 * a word ("e-commerce", "all-in-one") than a separator.
 */
const TITLE_SEPARATOR = /\s+[|–—·]\s+|\s*:\s+|\s+-\s+/;

/**
 * Splits "Acme | The fastest way to ship" into a name and a tagline.
 *
 * When og:site_name is present we trust it and treat the rest as the pitch.
 * Otherwise the shorter side is almost always the brand — "Catch bugs before
 * your teammates do | AI Review" puts the pitch first just as often as last.
 */
export function splitTitle(
  title: string,
  siteName: string | null,
): { name: string; tagline: string } {
  const clean = collapse(title);
  if (!clean) return { name: "", tagline: "" };

  const parts = clean.split(TITLE_SEPARATOR).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return { name: clean, tagline: "" };

  if (siteName) {
    const brand = siteName.trim().toLowerCase();
    const rest = parts.filter((part) => part.toLowerCase() !== brand);
    if (rest.length && rest.length < parts.length) {
      return { name: siteName.trim(), tagline: rest.join(" - ") };
    }
  }

  const [first, ...others] = parts;
  const second = others.join(" - ");
  return first.length <= second.length
    ? { name: first, tagline: second }
    : { name: second, tagline: first };
}

/**
 * Trims a name to `MAX_NAME_LENGTH`, preferring the last word boundary so the
 * result reads like a name rather than a string cut mid-word. No ellipsis: this
 * lands in an editable input, and a maker should not have to delete one.
 */
export function clampName(raw: string): string {
  const clean = collapse(raw).trim();
  if (clean.length <= MAX_NAME_LENGTH) return clean;

  const cut = clean.slice(0, MAX_NAME_LENGTH);
  const lastSpace = cut.lastIndexOf(" ");
  // Only honour a word boundary that keeps most of the budget; otherwise a
  // long first word would shrink the name to almost nothing.
  const trimmed = lastSpace > MAX_NAME_LENGTH * 0.6 ? cut.slice(0, lastSpace) : cut;
  return trimmed.replace(/[\s\-–—·:,|]+$/, "").trim();
}

/** `description` from any JSON-LD block on the page. */
export function jsonLdDescription(html: string): string {
  const blocks = html.match(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const block of blocks ?? []) {
    const body = block.replace(/^[\s\S]*?>/, "").replace(/<\/script>$/i, "");
    const match = /"description"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(body);
    if (match?.[1]) {
      const value = collapse(match[1].replace(/\\"/g, '"').replace(/\\n/g, " "));
      if (value.length >= 40) return value;
    }
  }
  return "";
}

/** The first paragraph substantial enough to read like a description. */
export function firstParagraph(html: string): string {
  const body = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ");
  for (const tag of body.match(/<p\b[^>]*>([\s\S]*?)<\/p>/gi) ?? []) {
    const text = collapse(decodeEntities(tag.replace(/<[^>]+>/g, " ")));
    if (text.length >= 60) return text;
  }
  return "";
}

/** "www.smart-utility.live" → "Smart Utility" — a starting point, not a guess to trust. */
export function nameFromHostname(hostname: string): string {
  const label = hostname.replace(/^www\./i, "").split(".")[0] ?? "";
  return label
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * Keyword vote for the category picker. Deliberately conservative: a wrong
 * pre-selection is worse than none, because a maker skims past a filled field.
 * Returns null unless one category clearly beats the next-best guess, which
 * leaves the picker on "Choose a category".
 *
 * Keys must match PRODUCT_CATEGORIES in lib/constants.ts. "Other" is never
 * inferred — it's what the maker picks when nothing fits.
 */
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  "Developer Tools": ["api", "sdk", "developer", "developers", "code", "git", "cli", "database", "deploy", "devops", "framework", "library", "debug", "programming", "open source", "npm", "docker", "backend", "frontend", "compiler", "terminal", "json"],
  Productivity: ["todo", "to do", "task", "tasks", "note", "notes", "calendar", "workflow", "automation", "automate", "planner", "time tracking", "focus", "project management", "reminder", "productivity", "organise", "organize", "workspace", "docs", "spreadsheet"],
  Finance: ["payment", "payments", "invoice", "banking", "fintech", "accounting", "tax", "expense", "crypto", "wallet", "loan", "gst", "billing", "upi", "trading", "investment", "budget", "emi"],
  "Food & Drink": ["recipe", "recipes", "restaurant", "food", "meal", "cooking", "cafe", "menu", "diet", "kitchen", "grocery", "coffee", "beverage"],
  "Design Tools": ["design", "figma", "ui kit", "icon", "icons", "illustration", "mockup", "prototype", "font", "fonts", "typography", "colour palette", "color palette", "wireframe", "canvas"],
  Marketing: ["seo", "email", "emails", "email marketing", "transactional email", "campaign", "campaigns", "newsletter", "growth", "ads", "advertising", "social media", "crm", "lead", "leads", "audience", "outreach", "brand", "marketing", "deliverability", "segment", "subscribers"],
  "Health & Fitness": ["fitness", "workout", "health", "meditation", "yoga", "sleep", "mental health", "exercise", "wellness", "nutrition", "medical", "doctor", "clinic", "therapy", "bmi"],
  Education: ["course", "courses", "learn", "student", "students", "teach", "education", "tutorial", "exam", "quiz", "school", "study", "training", "lesson", "curriculum"],
  Social: ["community", "chat", "social network", "messaging", "dating", "forum", "followers", "creator", "creators", "instagram", "influencer"],
};

/** Normalised so a hyphenated keyword ("to-do") still matches text reading "to do". */
function normaliseForMatch(value: string): string {
  return ` ${value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
}

/** How many times `needle` occurs in `haystack` (both already normalised). */
function countOccurrences(haystack: string, needle: string): number {
  if (needle.trim().length === 0) return 0;
  let count = 0;
  // Overlap the trailing space so " task " still matches " task task ".
  for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + needle.length - 1)) {
    count++;
  }
  return count;
}

export function inferCategory(text: string): string | null {
  const haystack = normaliseForMatch(text);
  if (haystack.trim().length === 0) return null;

  let best: { category: string; score: number } | null = null;
  let runnerUp = 0;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    for (const keyword of keywords) {
      const needle = normaliseForMatch(keyword);
      // Count every mention, and weight multi-word phrases higher: "email
      // marketing" is a far stronger signal than a stray "brand". Repetition
      // is what separates a product's actual subject from a passing mention.
      const weight = needle.trim().split(" ").length;
      score += countOccurrences(haystack, needle) * weight;
    }
    if (!best || score > best.score) {
      runnerUp = best?.score ?? 0;
      best = { category, score };
    } else if (score > runnerUp) {
      runnerUp = score;
    }
  }

  // Needs a real signal, and a clear lead — a tie means we genuinely can't
  // tell, and a wrong pre-selection is worse than leaving the picker alone.
  if (!best || best.score < 2 || best.score === runnerUp) return null;
  return best.category;
}

// ── Small HTML helpers ───────────────────────────────────────────────────

export function safeHostname(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export function safeOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function parseAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(tag))) {
    attrs[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attrs;
}

export function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function toAbsolute(href: string | undefined, base: string): string | null {
  if (!href) return null;
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

export function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeCodePoint(Number(dec)));
}

function safeCodePoint(code: number): string {
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}
