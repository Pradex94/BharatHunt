/**
 * Turning the few pages the agent read into verified facts.
 *
 * The rule for every field: it is either read off the product's own pages, by
 * a pattern specific enough that a match *is* the fact, or it is null. A field
 * that could not be read is "unknown" on the dashboard and in the draft — never
 * filled with something plausible. Where a heuristic is involved (category,
 * pricing), the heuristic's inputs are the site's own words, and an ambiguous
 * reading returns null rather than the likelier guess.
 *
 * The head-of-page metadata reuses `extractMetadata` from the maker's URL
 * importer, so a curated listing and a maker's import read a site the same way.
 *
 * Pure (relative imports only), so `tests/` can pin it.
 */

import { decodeEntities, extractMetadata, parseAttributes, toAbsolute } from "../metadata-extract.ts";
import { normalizeSite } from "./domain.ts";
import type { Facts, PricingType } from "./types.ts";

/** One page as the fetcher returned it. */
export type FetchedPage = { url: string; html: string; status: number; ms: number };

/** Most visible text kept per page — the signals all live well inside this. */
const MAX_TEXT_CHARS = 60_000;

/** The page's human-visible text, without scripts, styles or markup. */
export function visibleText(html: string): string {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/section|\/footer|\/address)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(text)
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim()
    .slice(0, MAX_TEXT_CHARS);
}

/** Every `<a href>` on the page, absolute. */
function anchors(html: string, base: string): Array<{ href: string; text: string }> {
  const found: Array<{ href: string; text: string }> = [];
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = toAbsolute(parseAttributes(`<a ${match[1]}>`)["href"], base);
    if (!href || !/^https?:/i.test(href)) continue;
    found.push({ href, text: match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() });
    if (found.length >= 400) break;
  }
  return found;
}

/** The order we read secondary pages in: the address lives in contact/about/terms. */
const SECONDARY_PAGES: Array<[RegExp, number]> = [
  [/\/(contact|contact-us|reach-us)\b/i, 1],
  [/\/(about|about-us|company|our-story|who-we-are)\b/i, 2],
  [/\/(terms|terms-of-service|terms-and-conditions|tos|legal)\b/i, 3],
  [/\/(privacy|privacy-policy)\b/i, 4],
  [/\/(team|careers)\b/i, 5],
];

/**
 * Same-site pages worth reading for evidence, best first. Only links the home
 * page itself offers — the agent never guesses paths, which would mean
 * requests for pages that may not exist.
 */
export function secondaryPageLinks(html: string, homeUrl: string, limit: number): string[] {
  const home = normalizeSite(homeUrl);
  if (!home || limit <= 0) return [];
  const ranked = new Map<string, number>();
  for (const { href } of anchors(html, homeUrl)) {
    if (normalizeSite(href)?.key !== home.key) continue;
    let url: URL;
    try {
      url = new URL(href);
    } catch {
      continue;
    }
    url.hash = "";
    const clean = url.toString();
    for (const [pattern, rank] of SECONDARY_PAGES) {
      if (pattern.test(url.pathname)) {
        if (!ranked.has(clean) || (ranked.get(clean) ?? 99) > rank) ranked.set(clean, rank);
        break;
      }
    }
  }
  return [...ranked.entries()]
    .sort((a, b) => a[1] - b[1])
    // One page per kind: /about and /about-us are the same evidence.
    .filter(([, rank], index, all) => all.findIndex(([, other]) => other === rank) === index)
    .slice(0, limit)
    .map(([url]) => url);
}

const SOCIAL_HOSTS: Array<[string, RegExp]> = [
  ["twitter", /^https?:\/\/(www\.)?(twitter|x)\.com\/(?!share|intent|home)[A-Za-z0-9_]{1,15}\/?$/i],
  ["linkedin", /^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/(company|in|school)\/[^/?#]+\/?$/i],
  ["instagram", /^https?:\/\/(www\.)?instagram\.com\/[A-Za-z0-9_.]+\/?$/i],
  ["youtube", /^https?:\/\/(www\.)?youtube\.com\/(@|c\/|channel\/|user\/)[^/?#]+\/?$/i],
  ["github", /^https?:\/\/(www\.)?github\.com\/[A-Za-z0-9-]+\/?([A-Za-z0-9_.-]+\/?)?$/i],
  ["facebook", /^https?:\/\/(www\.)?facebook\.com\/(?!sharer|share|dialog)[A-Za-z0-9.]+\/?$/i],
];

const PLATFORM_LINKS: Array<[string, RegExp]> = [
  ["android", /^https?:\/\/play\.google\.com\/store\/apps\/details\?id=[\w.]+/i],
  ["ios", /^https?:\/\/apps\.apple\.com\/[a-z]{2}\/app\/[^?#]+/i],
  ["chrome", /^https?:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore)\/detail\/[^?#]+/i],
];

/** "Founded by Asha Rao and Vikram Iyer" — only names the site states in that construction. */
const FOUNDED_BY = /\b(?:founded|co-founded|started|built) by ((?:[A-Z][a-z]+(?: [A-Z][a-z]+){0,2})(?:,? (?:and|&) (?:[A-Z][a-z]+(?: [A-Z][a-z]+){0,2}))*)/;

const LEGAL_NAME = /\b([A-Z][A-Za-z0-9&.'\- ]{1,60}?\s(?:Private Limited|Pvt\.?\s?Ltd\.?|Technologies Pvt\.? Ltd\.?|LLP|Limited))\b/;

const WAITLIST = /\b(join (?:the|our) waitlist|coming soon|launching soon|get early access|notify me when|request early access)\b/i;

const PRODUCT_WORDS =
  /\b(sign ?up|log ?in|get started|start (?:for )?free|free trial|download|install|dashboard|api|pricing|plans?|app store|google play|chrome extension|integrations?|workspace|book a demo|try (?:it )?(?:for )?free)\b/gi;
const SERVICE_WORDS =
  /\b(we build (?:websites|apps)|web development company|app development company|digital agency|it services|outsourcing|staffing|consultancy|consulting services|our clients|hire (?:our )?developers|seo services|software development services)\b/gi;

function countMatches(text: string, pattern: RegExp): number {
  return [...text.matchAll(pattern)].length;
}

/**
 * Pricing as the site states it. Null when the site says nothing usable or
 * says contradictory things we cannot settle — an admin chooses then.
 */
export function detectPricing(text: string): { pricingType: PricingType | null; freeTrial: boolean | null } {
  const lower = text.toLowerCase();
  const freeTrial = /\b(free trial|\d+[- ]day trial|try free for \d+)\b/.test(lower) ? true : null;
  const freePlan = /\b(free forever|free plan|forever free|free tier|\bfree\b ₹?0|starter.{0,20}\bfree\b|always free|100% free|completely free|free to use)\b/.test(lower);
  const paidPlan =
    /(₹|rs\.?|inr|\$|usd|€)\s?\d[\d,.]*\s?(?:\/|per)\s?(?:mo|month|user|seat|year|yr|annum)/i.test(text) ||
    /\b(per month|\/month|billed annually|billed monthly|subscription)\b/.test(lower);
  const pricingPage = /\bpricing\b/.test(lower);

  if (freePlan && paidPlan) return { pricingType: "freemium", freeTrial };
  if (paidPlan) return { pricingType: "paid", freeTrial };
  if (freePlan && !pricingPage) return { pricingType: "free", freeTrial };
  if (freePlan) return { pricingType: "freemium", freeTrial };
  return { pricingType: null, freeTrial };
}

/** The first paragraph-sized run of plain prose on a page (80–600 chars), verbatim. */
function firstProse(text: string): string | null {
  for (const line of text.split("\n")) {
    const clean = line.trim();
    if (clean.length >= 80 && clean.length <= 600 && /[.!?]$/.test(clean) && !/[©|{}<>]/.test(clean)) {
      return clean;
    }
  }
  return null;
}

export type SiteExtraction = {
  facts: Facts;
  /** Visible text per page, for the India and safety checks. */
  pages: Array<{ url: string; text: string }>;
  /** Combined title + meta description, where safety matters most. */
  headline: string;
  hasDescription: boolean;
  hasOgImage: boolean;
};

/** Reads the home page (first) and any secondary pages into facts. */
export function extractSite(pagesIn: FetchedPage[]): SiteExtraction {
  const home = pagesIn[0];
  const meta = extractMetadata(home.html, home.url);
  const pages = pagesIn.map((page) => ({ url: page.url, text: visibleText(page.html) }));
  const allText = pages.map((page) => page.text).join("\n");

  const socialLinks: Record<string, string> = {};
  const platformLinks: Record<string, string> = {};
  for (const page of pagesIn) {
    for (const { href } of anchors(page.html, page.url)) {
      for (const [key, pattern] of SOCIAL_HOSTS) if (!socialLinks[key] && pattern.test(href)) socialLinks[key] = href;
      for (const [key, pattern] of PLATFORM_LINKS) if (!platformLinks[key] && pattern.test(href)) platformLinks[key] = href;
    }
  }

  const founders = FOUNDED_BY.exec(allText)?.[1]
    ?.split(/,\s*|\s+(?:and|&)\s+/)
    .map((name) => name.trim())
    .filter((name) => name.split(" ").length >= 2)
    .slice(0, 4) ?? [];

  const legal = LEGAL_NAME.exec(allText)?.[1]?.replace(/\s+/g, " ").trim() ?? null;
  const pricing = detectPricing(allText);
  const description = meta.description?.trim() || null;
  const aboutText = pages.map((page) => firstProse(page.text)).find(Boolean) ?? null;

  // An icon the page actually declared. The conventional /favicon.ico guess and
  // the og:image stand-in are dropped here: an unverified guess is not a logo.
  const origin = new URL(home.url).origin;
  const logoUrl =
    meta.iconCandidates.find(
      (href) => href !== `${origin}/favicon.ico` && !meta.images.includes(href) && !/\.ico(\?|$)/i.test(href),
    ) ?? null;

  const facts: Facts = {
    productName: meta.name?.trim() || null,
    companyName: legal,
    founderNames: founders,
    siteDescription: description,
    aboutText: aboutText && aboutText !== description ? aboutText : null,
    category: meta.category,
    pricingType: pricing.pricingType,
    freeTrial: pricing.freeTrial,
    stateCode: null,
    city: null,
    logoUrl,
    screenshotUrl: meta.images[0] ?? null,
    socialLinks,
    platformLinks,
    pagesRead: pagesIn.map((page) => page.url),
    waitlistOnly: WAITLIST.test(allText.slice(0, 4000)) && countMatches(allText, PRODUCT_WORDS) < 3,
    productSignals: countMatches(allText, PRODUCT_WORDS),
    serviceSignals: countMatches(allText, SERVICE_WORDS),
    https: home.url.startsWith("https://"),
    responseMs: home.ms,
  };

  return {
    facts,
    pages,
    headline: `${meta.title ?? ""} ${description ?? ""}`.trim(),
    hasDescription: Boolean(description && description.length >= 40),
    hasOgImage: meta.images.length > 0,
  };
}

/** Phrases that mark a parked or for-sale domain rather than a product. */
const PARKED = /\b(this domain (?:is|may be) for sale|buy this domain|domain parking|parked free|hugedomains|sedo|dan\.com|afternic|godaddy\.com\/domains|is available for purchase)\b/i;

export function looksParked(html: string): boolean {
  return PARKED.test(html.slice(0, 20_000));
}
