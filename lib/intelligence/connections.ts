/**
 * How a product connects to the rest of BharatHunt — its funding history and
 * the engagement that explains why people are looking at it.
 *
 * Both are rules about what the page is allowed to claim, so they live here,
 * pure, where `npm test` can pin them down:
 *
 *   - A funding company is attached to a product only when two independent
 *     facts agree: the names fold to the same key, *and* the product's own
 *     website domain is that name (or is the company's recorded website). A
 *     name alone is not enough — "Pulse" the habit tracker is not "Pulse" the
 *     funded fintech — and a wrong funding box is worse than none.
 *   - "Why people are discovering this" states counts BharatHunt recorded,
 *     over a stated window, and says nothing below a floor where a number
 *     would read as noise or as a slight.
 *
 * Framework-agnostic, relative `.ts` imports only.
 */

import { isNotAProductSite, nameKey, normalizeSite } from "../daily-agent/domain.ts";

export type LinkableProduct = { name: string; website_url: string | null; companyName?: string | null };
export type LinkableStartup = { name: string; website: string | null };

/** The middle label of a two-label public suffix: the "co" of "co.in". */
const SECOND_LEVEL = new Set(["co", "com", "net", "org", "firm", "gen", "ind", "ac", "edu", "gov", "res"]);

/** The first label of a registrable domain: "krutrim.ai" → "krutrim", "zoho.co.in" → "zoho". */
function domainLabel(key: string): string {
  return key.split(".")[0].replace(/[^a-z0-9]/g, "");
}

/**
 * True when `startup` is verifiably the company behind `product`.
 *
 * 1. The startup records a website: its registrable domain must equal the
 *    product's. Nothing else is needed, or accepted.
 * 2. It does not (every row today — ingestion has no website to record): the
 *    product's or company's folded name must equal the startup's, and the
 *    product's domain label must equal that same folded name. Short keys (< 4
 *    characters) never match by name; they collide too easily.
 *
 * A product with no website of its own (or a social/marketplace page) never
 * matches: there is nothing independent to check the name against.
 */
export function fundingLinkVerified(product: LinkableProduct, startup: LinkableStartup): boolean {
  if (!product.website_url || isNotAProductSite(product.website_url)) return false;
  const site = normalizeSite(product.website_url);
  if (!site) return false;

  const startupSite = startup.website ? normalizeSite(startup.website) : null;
  if (startupSite) return startupSite.key === site.key;

  // A tenant subdomain ("acme.vercel.app") is not a domain anyone owns
  // outright. normalizeSite keeps the full host as the key on shared hosting,
  // so a three-label key that is not "name.co.in"-shaped is one of those.
  const labels = site.key.split(".");
  if (labels.length > 2 && !SECOND_LEVEL.has(labels[labels.length - 2])) return false;

  const startupKeys = nameKeys(startup.name);
  if (startupKeys.length === 0) return false;
  const productKeys = [product.name, product.companyName].flatMap(nameKeys);
  if (!productKeys.some((key) => startupKeys.includes(key))) return false;
  return startupKeys.includes(domainLabel(site.key));
}

/** Legal suffixes only — what a company drops from its name but not its domain. */
const LEGAL = /\b(private|pvt|p|limited|ltd|llp|inc|llc|corp|co)\b\.?/g;

/**
 * The comparable forms of a name: folded hard ("QNu Labs" → "qnu", the
 * duplicate-detection key) and folded only of legal suffixes ("qnulabs"),
 * because a domain usually keeps the "labs" or "ai" the hard fold removes.
 * Forms under four characters are dropped; they collide too easily.
 */
function nameKeys(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const soft = raw.toLowerCase().replace(LEGAL, " ").replace(/[^a-z0-9]+/g, "");
  return [...new Set([nameKey(raw), soft])].filter((key) => key.length >= 4);
}

/**
 * Whether a company name the Daily 5 agent extracted reads as a name. The
 * extractor sometimes keeps a whole sentence ("Reach the Traccia team at …"),
 * which must not be printed as a company or used to match funding.
 */
export function plausibleCompanyName(raw: string | null | undefined): string | null {
  const name = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!name || name.length > 60 || name.split(" ").length > 7) return null;
  if (/\b(reach|contact|email|write to|the team|team at|click|visit)\b/i.test(name)) return null;
  return name;
}

/** BharatHunt's own engagement totals for one product over a window. */
export type ProductEngagement = {
  days: number;
  visitors: number;
  websiteClicks: number;
  saves: number;
  compares: number;
  /** Product Match + marketplace search result clicks. */
  discoveryClicks: number;
};

export const EMPTY_ENGAGEMENT: ProductEngagement = {
  days: 30,
  visitors: 0,
  websiteClicks: 0,
  saves: 0,
  compares: 0,
  discoveryClicks: 0,
};

/** Below these, a count says more about the window than about the product. */
export const DISCOVERY_FLOORS = {
  visitors: 10,
  websiteClicks: 3,
  saves: 2,
  compares: 2,
  discoveryClicks: 3,
} as const;

/** Rising beats New on cards at the same threshold (components/products/product-card.tsx). */
export const RISING_THRESHOLD = 1.5;

const plural = (count: number, one: string, many: string) => `${count.toLocaleString("en-IN")} ${count === 1 ? one : many}`;

/**
 * Plain sentences, each a recorded fact with its window. Empty when nothing
 * clears its floor — the section then does not render at all, rather than
 * saying "0 people".
 */
export function discoveryReasons(
  engagement: ProductEngagement,
  extras: { risingScore?: number | null; daily5Date?: string | null; daily5Label?: string | null } = {},
): string[] {
  const window = `in the last ${engagement.days} days`;
  const reasons: string[] = [];
  if ((extras.risingScore ?? 0) >= RISING_THRESHOLD) {
    reasons.push("Attention is rising: more activity in the last 3 days than in the week before.");
  }
  if (engagement.visitors >= DISCOVERY_FLOORS.visitors) {
    reasons.push(`${plural(engagement.visitors, "person", "people")} viewed it on BharatHunt ${window}.`);
  }
  if (engagement.websiteClicks >= DISCOVERY_FLOORS.websiteClicks) {
    reasons.push(`${plural(engagement.websiteClicks, "visit", "visits")} to its website came from BharatHunt ${window}.`);
  }
  if (engagement.saves >= DISCOVERY_FLOORS.saves) {
    reasons.push(`Saved ${plural(engagement.saves, "time", "times")} ${window}.`);
  }
  if (engagement.compares >= DISCOVERY_FLOORS.compares) {
    reasons.push(`Added to ${plural(engagement.compares, "comparison", "comparisons")} ${window}.`);
  }
  if (engagement.discoveryClicks >= DISCOVERY_FLOORS.discoveryClicks) {
    reasons.push(`Opened ${plural(engagement.discoveryClicks, "time", "times")} from search and Product Match results ${window}.`);
  }
  if (extras.daily5Date && extras.daily5Label) {
    reasons.push(`Picked for BharatHunt Daily 5 on ${extras.daily5Label}.`);
  }
  return reasons;
}
