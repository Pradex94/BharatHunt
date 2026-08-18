/**
 * Launch moderation — the gate every product passes before it goes live.
 *
 * Two rules, enforced server-side in `lib/actions/products.ts` on both create
 * and edit:
 *
 *  1. **No adult content.** Bharat Hunt is a general-audience marketplace, so
 *     NSFW/adult products (and fraud/piracy listings) are rejected outright.
 *  2. **No fake launches.** A launch must point at something real — a working
 *     public link plus human-written copy — so placeholder/spam rows never
 *     reach the marketplace.
 *
 * This module is framework-agnostic (no server-only imports), the same
 * contract as `lib/constants.ts`, so the submit form can show the same rules
 * client-side. All matching runs on a normalized copy of the text: lowercased,
 * accent-stripped, leet-decoded (`p0rn` -> `porn`) and de-spaced (`p o r n` ->
 * `porn`), matched on word boundaries so "analytics" never trips "anal".
 */

export type ModerationCode =
  | "adult_content"
  | "fraudulent_content"
  | "missing_link"
  | "untrusted_link"
  | "placeholder_name"
  | "low_quality"
  | "spam_formatting";

export type ModerationResult = { ok: true } | { ok: false; code: ModerationCode; message: string };

export type ModeratedProductInput = {
  name: string;
  tagline: string;
  description?: string | null;
  tags?: string[];
  techStack?: string[];
  websiteUrl?: string | null;
  githubUrl?: string | null;
  videoUrl?: string | null;
  ctaText?: string | null;
  ctaUrl?: string | null;
  platformLinks?: Record<string, string>;
  couponCode?: string | null;
  offerDescription?: string | null;
  hirePitch?: string | null;
  heroImageUrl?: string | null;
  screenshotUrls?: string[];
};

/** Shown on the submit/edit form so makers see the policy before they publish. */
export const SUBMISSION_RULES = [
  "Launch a real product — a working public link (website, GitHub, or app store) is required.",
  "No adult or NSFW products. Bharat Hunt is a general-audience marketplace.",
  "No pirated, cracked, or fraudulent listings (fake documents, bought followers, scams).",
  "Write your own name, tagline, and description — placeholder or mashed text gets rejected.",
  "One listing per product. Duplicates of an existing launch are rejected.",
] as const;

// ── Blocklists ───────────────────────────────────────────────────────────

/**
 * Adult/NSFW terms. Deliberately phrase-heavy: bare words like "escort" or
 * "adult" carry legitimate meanings, so they only count in an unambiguous
 * context ("escort service", "adult video").
 */
const ADULT_TERMS = [
  "porn",
  "pornographic",
  "pornography",
  "pornhub",
  "xvideos",
  "xnxx",
  "xhamster",
  "redtube",
  "youporn",
  "spankbang",
  "brazzers",
  "chaturbate",
  "stripchat",
  "bongacams",
  "livejasmin",
  "onlyfans",
  "only fans",
  "fansly",
  "hentai",
  "xxx",
  "nsfw",
  "erotic",
  "erotica",
  "fetish",
  "bdsm",
  "milf",
  "camgirl",
  "cam girl",
  "webcam girl",
  "sexcam",
  "sex cam",
  "sex chat",
  "sex video",
  "sex toy",
  "sexting",
  "sexual content",
  "adult video",
  "adult movie",
  "adult film",
  "adult content",
  "adult entertainment",
  "adult webcam",
  "adult chat",
  "adult dating",
  "adult site",
  "adult app",
  "adult game",
  "nude",
  "nudity",
  "nudify",
  "deepnude",
  "undress ai",
  "ai undress",
  "clothes remover",
  "strip club",
  "brothel",
  "prostitute",
  "prostitution",
  "escort service",
  "escort agency",
  "call girl",
  "hookup app",
  "one night stand",
  "ai girlfriend",
  "ai boyfriend",
  "virtual girlfriend",
  "blue film",
  "chudai",
  "randi",
  "nangi",
  "desi sex",
  "indian sex",
  "sexy video",
  "bf video",
] as const;

/**
 * Adult terms unambiguous enough to match *inside* a word, so compound brand
 * names ("PornVault", "HentaiHub", "NudifyPro") are caught too. Anything that
 * has an innocent host word — sex/Essex, escort/Ford Escort, stripper/tag
 * stripper — stays out of this list and is matched on word boundaries only.
 */
const ADULT_SUBSTRINGS = [
  "porn",
  "hentai",
  "xvideos",
  "xnxx",
  "xhamster",
  "redtube",
  "youporn",
  "spankbang",
  "brazzers",
  "chaturbate",
  "stripchat",
  "bongacams",
  "livejasmin",
  "onlyfans",
  "fansly",
  "fapello",
  "camgirl",
  "sexcam",
  "sexchat",
  "sextoy",
  "sexting",
  "deepnude",
  "nudify",
  "nude",
  "erotic",
  "nsfw",
  "bdsm",
  "prostitut",
  "brothel",
  "chudai",
] as const;

/**
 * Fraud, piracy, and engagement-farming — the other half of "no fake products".
 * Bare "crack" is excluded (crack the code / crack interviews); only the piracy
 * phrasings count.
 */
const FRAUD_TERMS = [
  "cracked apk",
  "cracked version",
  "cracked software",
  "software crack",
  "crack download",
  "keygen",
  "nulled",
  "warez",
  "mod apk",
  "modded apk",
  "premium apk",
  "free netflix",
  "netflix cookies",
  "free premium account",
  "premium account free",
  "fake certificate",
  "fake degree",
  "fake marksheet",
  "fake document",
  "fake id card",
  "fake review",
  "fake follower",
  "buy follower",
  "buy likes",
  "buy views",
  "buy subscriber",
  "free follower",
  "satta matka",
  "matka result",
  "paper leak",
  "hack whatsapp",
  "whatsapp hack",
  "hack instagram",
  "instagram hack",
  "hack any account",
  "otp bypass",
  "otp bot",
  "spy on your",
  "track girlfriend",
  "earn money fast",
  "get rich quick",
  "double your money",
  "guaranteed returns",
  "guaranteed profit",
  "loan without documents",
] as const;

/** Adult sites — checked against every link a maker submits. */
const ADULT_HOSTS = new Set([
  "pornhub.com",
  "xvideos.com",
  "xnxx.com",
  "xhamster.com",
  "redtube.com",
  "youporn.com",
  "spankbang.com",
  "eporner.com",
  "motherless.com",
  "brazzers.com",
  "chaturbate.com",
  "stripchat.com",
  "bongacams.com",
  "livejasmin.com",
  "camsoda.com",
  "myfreecams.com",
  "manyvids.com",
  "onlyfans.com",
  "fansly.com",
  "fapello.com",
  "nhentai.net",
  "e-hentai.org",
  "rule34.xxx",
  "adultfriendfinder.com",
  "ashleymadison.com",
]);

/** Adult-only TLDs. */
const ADULT_TLDS = new Set(["xxx", "adult", "porn", "sex"]);

/** Link shorteners and ad gateways hide the destination — classic spam cover. */
const SHORTENER_HOSTS = new Set([
  "bit.ly",
  "tinyurl.com",
  "t.co",
  "goo.gl",
  "ow.ly",
  "is.gd",
  "buff.ly",
  "cutt.ly",
  "rebrand.ly",
  "shorturl.at",
  "rb.gy",
  "tiny.cc",
  "shorte.st",
  "adf.ly",
  "bc.vc",
  "ouo.io",
]);

/** Domains people leave in by accident — a launch pointing here isn't real. */
const PLACEHOLDER_HOSTS = new Set([
  "example.com",
  "example.org",
  "example.net",
  "test.com",
  "domain.com",
  "website.com",
  "yoursite.com",
  "yourwebsite.com",
  "yourproduct.com",
  "yourdomain.com",
  "mysite.com",
  "mywebsite.com",
  "myproduct.com",
  "sitename.com",
  "abc.com",
  "xyz.com",
]);

/** Non-public TLDs — never a live product. */
const RESERVED_TLDS = new Set([
  "test",
  "local",
  "localhost",
  "invalid",
  "example",
  "internal",
  "onion",
]);

/** Exact (normalized) names that mean "I didn't fill this in". */
const PLACEHOLDER_NAMES = new Set([
  "test",
  "testing",
  "test product",
  "test app",
  "testproduct",
  "demo",
  "demo product",
  "sample",
  "sample product",
  "untitled",
  "untitled product",
  "no name",
  "none",
  "na",
  "n a",
  "product",
  "my product",
  "new product",
  "my app",
  "new app",
  "app",
  "application",
  "website",
  "project",
  "my project",
  "hello world",
  "lorem ipsum",
  "abc",
  "abcd",
  "asdf",
  "asdfgh",
  "qwerty",
  "xyz",
  "aaa",
  "123",
  "1234",
]);

const KEYBOARD_RUNS = ["qwerty", "qwertz", "asdfgh", "zxcvbn", "asdfjkl", "12345"];

// ── Normalization ────────────────────────────────────────────────────────

const LEET: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  $: "s",
};

/**
 * Code-point ranges stripped before matching: combining diacritics (so
 * "pörn" folds to "porn" after NFKD) and zero-width characters people paste
 * between letters to slip past filters.
 */
const INVISIBLE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0300, 0x036f], // combining diacritical marks
  [0x200b, 0x200f], // zero-width space/joiners + bidi marks
  [0x2060, 0x2064], // word joiner + invisible operators
  [0xfeff, 0xfeff], // byte-order mark
];

function stripInvisible(value: string): string {
  let out = "";
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (!INVISIBLE_RANGES.some(([low, high]) => code >= low && code <= high)) out += char;
  }
  return out;
}

/**
 * Lowercase -> strip accents/zero-width -> decode leetspeak -> punctuation to
 * spaces, so blocklist terms can be matched on word boundaries.
 */
function normalize(value: string): string {
  return stripInvisible(value.toLowerCase().normalize("NFKD"))
    .replace(/[013457@$]/g, (char) => LEET[char] ?? char)
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Collapses spelled-out obfuscation ("p o r n", "p-o-r-n") back into a word. */
function collapseSpacedLetters(normalized: string): string {
  return normalized.replace(/\b(?:[a-z] ){2,}[a-z]\b/g, (run) => run.replace(/ /g, ""));
}

function escapeRegExp(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
}

/** Whole-word matcher — the default, so "analytics" never trips "anal". */
function buildWordMatcher(terms: readonly string[]): RegExp {
  // Trailing `s?` so plurals ("nudes", "call girls") match too.
  return new RegExp(`\\b(?:${terms.map(escapeRegExp).join("|")})s?\\b`);
}

/** Anywhere-in-the-string matcher, for the curated compound-safe terms. */
function buildLooseMatcher(terms: readonly string[]): RegExp {
  return new RegExp(`(?:${terms.map(escapeRegExp).join("|")})`);
}

/**
 * Space-free forms of the multi-word phrases ("adult video" → "adultvideo",
 * "mod apk" → "modapk"), so run-together names like "AdultVideoHub" and
 * "ModAPKStore" are caught. Six characters is the floor — below that a squashed
 * phrase starts colliding with innocent words.
 */
function squashedPhrases(terms: readonly string[], minLength = 6): string[] {
  return terms
    .filter((term) => term.includes(" "))
    .map((term) => term.replace(/\s+/g, ""))
    .filter((term) => term.length >= minLength);
}

type TermMatchers = { word: RegExp; loose: RegExp };

const ADULT_MATCHERS: TermMatchers = {
  word: buildWordMatcher(ADULT_TERMS),
  loose: buildLooseMatcher([...ADULT_SUBSTRINGS, ...squashedPhrases(ADULT_TERMS)]),
};
const FRAUD_MATCHERS: TermMatchers = {
  word: buildWordMatcher(FRAUD_TERMS),
  loose: buildLooseMatcher(squashedPhrases(FRAUD_TERMS)),
};

/** True when `text` contains a blocklisted term, obfuscation included. */
function matchesTerms({ word, loose }: TermMatchers, text: string): boolean {
  const normalized = normalize(text);
  const collapsed = collapseSpacedLetters(normalized);
  return (
    word.test(normalized) ||
    loose.test(normalized) ||
    word.test(collapsed) ||
    loose.test(collapsed)
  );
}

export function containsAdultContent(text: string): boolean {
  return matchesTerms(ADULT_MATCHERS, text);
}

export function containsFraudulentContent(text: string): boolean {
  return matchesTerms(FRAUD_MATCHERS, text);
}

// ── Link inspection ──────────────────────────────────────────────────────

/**
 * Bare hostname for a link (no `www.`). Returns null when it isn't parseable
 * or isn't http(s) — which also keeps `javascript:`/`data:` URLs out of the
 * hrefs we render on product pages.
 */
export function hostnameOf(url: string): string | null {
  const trimmed = url.trim();
  // Tolerate a pasted bare domain the way the metadata importer does.
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function matchesHost(host: string, blocklist: Set<string>): boolean {
  if (blocklist.has(host)) return true;
  // Subdomains count: cdn.pornhub.com -> pornhub.com.
  for (const blocked of blocklist) {
    if (host.endsWith(`.${blocked}`)) return true;
  }
  return false;
}

function isAdultHost(host: string): boolean {
  const tld = host.split(".").pop() ?? "";
  return matchesHost(host, ADULT_HOSTS) || ADULT_TLDS.has(tld);
}

/** IP literal, scheme-less name, or a host with no public TLD. */
function isNonPublicHost(host: string): boolean {
  if (!host.includes(".")) return true; // "localhost", intranet names
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) return true; // raw IP
  const tld = host.split(".").pop() ?? "";
  return RESERVED_TLDS.has(tld) || tld.length < 2 || /\d/.test(tld);
}

// ── Text-quality heuristics ──────────────────────────────────────────────

/** Emoji blocks, as code-point ranges (no unicode property escapes at ES2017). */
const EMOJI_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x2600, 0x27bf], // misc symbols + dingbats
  [0x2b00, 0x2bff], // arrows/stars
  [0x1f000, 0x1faff], // emoticons, pictographs, supplemental symbols
];

function countEmoji(text: string): number {
  let count = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (EMOJI_RANGES.some(([low, high]) => code >= low && code <= high)) count++;
  }
  return count;
}

/** Keyboard mashing: vowel-less runs, long identical runs, or home-row walks. */
function looksLikeGibberish(text: string): boolean {
  const normalized = normalize(text);
  if (/(.)\1{4,}/.test(normalized)) return true;
  if (KEYBOARD_RUNS.some((run) => normalized.includes(run))) return true;
  return normalized
    .split(" ")
    .some((word) => word.length >= 6 && /^[a-z]+$/.test(word) && !/[aeiouy]/.test(word));
}

function isShouting(text: string): boolean {
  const letters = text.replace(/[^a-zA-Z]/g, "");
  if (letters.length < 8) return false;
  const upper = letters.replace(/[^A-Z]/g, "").length;
  return upper / letters.length > 0.8;
}

/*
 * Phone numbers, matched by shape rather than by digit count.
 *
 * The previous pattern was `(?:\+?\d[\s-]?){9,}` — nine or more digits with
 * optional single separators — which matches any long run of digits, not a
 * phone number. "Covering 2023 2024 2025 2026", "Handles 123456789 rows per
 * second" and "Track 100000000 transactions" were all rejected as contact
 * bait. Real numbers have structure, so match that instead:
 *
 *   - an explicit international prefix with grouping (+91 98765 43210), or
 *   - a bare Indian mobile: ten digits starting 6-9.
 *
 * A plain large integer now passes, which is the common legitimate case in a
 * tagline. The cost is that a bare ten-digit foreign number can slip through;
 * that is the right trade on a marketplace where makers quote scale figures.
 */
const PHONE = /\+\d{1,3}[\s-]?\d{2,5}(?:[\s-]?\d{2,5}){1,3}|\b[6-9]\d{9}\b/;

const EMAIL = /[\w.+-]+@[\w-]+\.[a-z]{2,}/i;

/*
 * Contact bait: a solicitation to take the conversation off-platform.
 *
 * The previous pattern listed the bare words "whatsapp" and "telegram", which
 * blocked an entire legitimate product category — on an Indian marketplace,
 * "WhatsApp CRM", "WhatsApp Business API" and "Telegram bot builder" are
 * products, not contact details. The platform name is a noun; the bait is the
 * verb. So match the solicitation ("dm me", "whatsapp me", "contact us on")
 * and let the platform name alone through.
 */
const CONTACT_BAIT = new RegExp(
  [
    // "dm me", "pm us"
    String.raw`\b(?:dm|pm)\s+(?:me|us)\b`,
    // "whatsapp me", "telegram us", "call me", "ping us", "mail me"
    String.raw`\b(?:whats\s?app|telegram|call|text|ping|message|msg|mail|email)\s+(?:me|us)\b`,
    // "contact us on", "reach me at", "message us via"
    String.raw`\b(?:contact|reach|dm|message|ping)\s+(?:me|us)\s+(?:on|at|via)\b`,
    // bare urgency
    String.raw`\bcall\s+now\b`,
  ].join("|"),
  "i",
);

// ── The gate ─────────────────────────────────────────────────────────────

function reject(code: ModerationCode, message: string): ModerationResult {
  return { ok: false, code, message };
}

/**
 * Runs every launch rule over a parsed submission. Returns the first failure
 * so the maker gets one actionable message at a time.
 */
export function moderateProduct(input: ModeratedProductInput): ModerationResult {
  const {
    name,
    tagline,
    description,
    tags = [],
    techStack = [],
    websiteUrl,
    githubUrl,
    videoUrl,
    ctaText,
    ctaUrl,
    platformLinks = {},
    couponCode,
    offerDescription,
    hirePitch,
    heroImageUrl,
    screenshotUrls = [],
  } = input;

  // Every free-text field a maker controls, in one blob.
  const copy = [
    name,
    tagline,
    description,
    ctaText,
    couponCode,
    offerDescription,
    hirePitch,
    ...tags,
    ...techStack,
  ]
    .filter(Boolean)
    .join(" \n ");

  // The links that claim "this product exists".
  const productLinks = [websiteUrl, githubUrl, ctaUrl, ...Object.values(platformLinks)].filter(
    (link): link is string => Boolean(link && link.trim()),
  );
  // Everything else we'd render — still subject to the content rules.
  const mediaLinks = [videoUrl, heroImageUrl, ...screenshotUrls].filter(
    (link): link is string => Boolean(link && link.trim()),
  );
  const allLinks = [...productLinks, ...mediaLinks];

  // 1. Adult content — copy first, then the link text, then the destinations.
  if (containsAdultContent(copy) || containsAdultContent(allLinks.join(" "))) {
    return reject(
      "adult_content",
      "Bharat Hunt doesn't accept adult or NSFW products. Please remove that content and try again.",
    );
  }
  for (const link of allLinks) {
    const host = hostnameOf(link);
    if (host && isAdultHost(host)) {
      return reject(
        "adult_content",
        "One of your links points to an adult site. Bharat Hunt doesn't accept adult or NSFW products.",
      );
    }
  }

  // 2. Piracy / fraud listings.
  if (containsFraudulentContent(copy) || containsFraudulentContent(allLinks.join(" "))) {
    return reject(
      "fraudulent_content",
      "This looks like a pirated or fraudulent listing, which isn't allowed on Bharat Hunt.",
    );
  }

  // 3. A real launch needs somewhere to go.
  if (productLinks.length === 0) {
    return reject(
      "missing_link",
      "Add a working link to your product — a website, GitHub repo, or app store listing is required to launch.",
    );
  }

  // 4. ...and that link has to be a real, public destination.
  for (const link of productLinks) {
    const host = hostnameOf(link);
    if (!host || isNonPublicHost(host)) {
      return reject(
        "untrusted_link",
        "Your product link must be a public https:// URL — local addresses and IPs can't be verified.",
      );
    }
    if (matchesHost(host, PLACEHOLDER_HOSTS)) {
      return reject(
        "untrusted_link",
        `"${host}" is a placeholder domain. Link to your real product page.`,
      );
    }
    if (matchesHost(host, SHORTENER_HOSTS)) {
      return reject(
        "untrusted_link",
        "Shortened links aren't allowed — paste your product's full URL so people can see where it goes.",
      );
    }
  }

  // 5. Placeholder / mashed names.
  const normalizedName = normalize(name);
  if (!normalizedName || !/[a-z]/.test(normalizedName)) {
    return reject("placeholder_name", "Your product name needs at least a couple of real letters.");
  }
  if (PLACEHOLDER_NAMES.has(normalizedName)) {
    return reject(
      "placeholder_name",
      `"${name.trim()}" looks like a placeholder. Use your product's real name.`,
    );
  }
  if (looksLikeGibberish(name)) {
    return reject("placeholder_name", "That product name doesn't look real. Use your actual name.");
  }
  if (/https?:\/\//i.test(name) || EMAIL.test(name)) {
    return reject("placeholder_name", "Keep URLs and email addresses out of the product name.");
  }

  // 6. Taglines have to describe something.
  const trimmedTagline = tagline.trim();
  if (trimmedTagline.length < 10 || trimmedTagline.split(/\s+/).length < 2) {
    return reject(
      "low_quality",
      "Write a real tagline — at least a few words describing what your product does.",
    );
  }
  if (normalize(trimmedTagline) === normalizedName) {
    return reject(
      "low_quality",
      "Your tagline just repeats the product name. Describe what it actually does.",
    );
  }
  if (looksLikeGibberish(trimmedTagline)) {
    return reject("low_quality", "That tagline doesn't read like a real description of a product.");
  }

  // 7. Spam formatting / contact bait.
  const headline = `${name} ${tagline}`;
  if (isShouting(name) || isShouting(tagline)) {
    return reject("spam_formatting", "Please don't use ALL CAPS in your product name or tagline.");
  }
  if (countEmoji(name) > 1 || countEmoji(tagline) > 3) {
    return reject("spam_formatting", "Go easy on the emoji in your product name and tagline.");
  }
  if (PHONE.test(headline) || EMAIL.test(headline) || CONTACT_BAIT.test(headline)) {
    return reject(
      "spam_formatting",
      "Keep phone numbers and contact handles out of the name and tagline — put them on your product page instead.",
    );
  }

  return { ok: true };
}
