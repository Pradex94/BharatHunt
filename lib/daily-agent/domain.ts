/**
 * Domain normalisation and duplicate detection.
 *
 * The duplicate key is the *registrable* domain — `app.emergent.sh`,
 * `www.emergent.sh/` and `http://emergent.sh` are one product — except on
 * shared hosting, where every subdomain is a different owner
 * (`foo.vercel.app` and `bar.vercel.app` are two products), so the full host is
 * kept there.
 *
 * Framework-agnostic so `tests/` can cover it without a database.
 */

/**
 * Two-label public suffixes we meet in practice. Not the whole Public Suffix
 * List — that is 200KB for a few dozen Indian and Commonwealth suffixes — but a
 * miss here only means `foo.co.xx` keys as `co.xx`, which the name check then
 * catches as a mismatch rather than a false duplicate.
 */
const MULTI_LABEL_SUFFIXES = new Set([
  "co.in", "net.in", "org.in", "firm.in", "gen.in", "ind.in", "ac.in", "edu.in", "gov.in", "res.in",
  "co.uk", "org.uk", "ac.uk", "com.au", "net.au", "org.au", "co.nz", "com.sg", "com.my", "co.za",
  "com.br", "co.jp", "com.cn", "com.hk", "co.id", "com.ph", "com.np", "com.bd", "com.pk", "com.lk",
]);

/** Hosts where each subdomain is a separate tenant. */
const SHARED_HOSTING_SUFFIXES = [
  "vercel.app", "netlify.app", "github.io", "gitlab.io", "pages.dev", "workers.dev", "web.app",
  "firebaseapp.com", "herokuapp.com", "onrender.com", "railway.app", "up.railway.app", "fly.dev",
  "replit.app", "repl.co", "glitch.me", "notion.site", "framer.website", "framer.app", "webflow.io",
  "wixsite.com", "carrd.co", "bubbleapps.io", "lovable.app", "softr.app", "super.site", "substack.com",
  "medium.com", "blogspot.com", "wordpress.com", "myshopify.com", "streamlit.app", "hf.space",
];

/**
 * Domains that are never a product's own site: platforms, social networks,
 * stores, news outlets. A candidate pointing at one of these has no standalone
 * website to verify, so discovery drops it before anything is fetched.
 */
const NOT_A_PRODUCT_SITE = new Set([
  "google.com", "youtube.com", "youtu.be", "apple.com", "facebook.com", "instagram.com", "x.com",
  "twitter.com", "linkedin.com", "reddit.com", "medium.com", "substack.com", "wikipedia.org",
  "github.com", "gitlab.com", "huggingface.co", "npmjs.com", "pypi.org", "producthunt.com",
  "ycombinator.com", "indiegogo.com", "kickstarter.com", "gofundme.com", "notion.so", "docs.google.com",
  "drive.google.com", "bit.ly", "t.co", "lnkd.in", "forms.gle", "typeform.com", "tally.so",
  "inc42.com", "yourstory.com", "entrackr.com", "economictimes.com", "indiatimes.com", "livemint.com",
  "moneycontrol.com", "thehindu.com", "hindustantimes.com", "ndtv.com", "indianexpress.com",
  "business-standard.com", "techcrunch.com", "theverge.com", "wired.com", "medianama.com",
  "news.google.com", "arxiv.org", "loom.com", "vimeo.com", "dropbox.com", "amazon.com", "amazon.in",
  "flipkart.com", "play.google.com", "apps.apple.com", "chromewebstore.google.com", "chrome.google.com",
]);

export type NormalizedSite = {
  /** The duplicate key: registrable domain, or full host on shared hosting. */
  key: string;
  host: string;
  /** Canonical home URL — https, host, no path. */
  homeUrl: string;
};

function registrableDomain(host: string): string {
  const labels = host.split(".");
  if (labels.length <= 2) return host;
  const lastTwo = labels.slice(-2).join(".");
  if (MULTI_LABEL_SUFFIXES.has(lastTwo)) return labels.slice(-3).join(".");
  return lastTwo;
}

function sharedHostingSuffix(host: string): string | null {
  return SHARED_HOSTING_SUFFIXES.find((suffix) => host === suffix || host.endsWith(`.${suffix}`)) ?? null;
}

/** Parses anything URL-shaped (`example.com`, `http://www.example.com/x`) into a site, or null. */
export function normalizeSite(raw: string | null | undefined): NormalizedSite | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  let host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host.includes(".") || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":")) return null;
  host = host.replace(/^(www\d?|m)\./, "");

  const shared = sharedHostingSuffix(host);
  const key = shared ? host : registrableDomain(host);
  if (key.length < 3) return null;
  return { key, host, homeUrl: `https://${host}/` };
}

/** True when the URL is a platform/social/news page rather than a product's own site. */
export function isNotAProductSite(raw: string | null | undefined): boolean {
  const site = normalizeSite(raw);
  if (!site) return true;
  if (NOT_A_PRODUCT_SITE.has(site.key) || NOT_A_PRODUCT_SITE.has(site.host)) return true;
  // A bare shared-hosting root ("vercel.app" itself) is not anyone's product.
  return SHARED_HOSTING_SUFFIXES.includes(site.key);
}

/** Name folded for comparison: "Kokasa Labs, Inc." → "kokasa". */
export function nameKey(raw: string | null | undefined): string {
  return (raw ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/\b(private|pvt|limited|ltd|llp|inc|llc|technologies|technology|tech|labs|ai|app|hq|india|software|solutions|co|corp|the)\b\.?/g, " ")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function bigrams(value: string): Map<string, number> {
  const grams = new Map<string, number>();
  for (let index = 0; index < value.length - 1; index += 1) {
    const gram = value.slice(index, index + 2);
    grams.set(gram, (grams.get(gram) ?? 0) + 1);
  }
  return grams;
}

/** Sørensen–Dice over character bigrams of the folded names; 0–1. */
export function nameSimilarity(a: string, b: string): number {
  const left = nameKey(a);
  const right = nameKey(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.length < 2 || right.length < 2) return 0;
  const leftGrams = bigrams(left);
  const rightGrams = bigrams(right);
  let overlap = 0;
  for (const [gram, count] of leftGrams) overlap += Math.min(count, rightGrams.get(gram) ?? 0);
  return (2 * overlap) / (left.length - 1 + (right.length - 1));
}

/** A product already on BharatHunt, as the duplicate check reads it. */
export type ExistingProduct = {
  id: string;
  name: string;
  website_url: string | null;
  github_url?: string | null;
};

export type DuplicateCheck =
  | { kind: "duplicate"; productId: string; reason: string }
  | { kind: "similar"; productId: string; similarity: number; reason: string }
  | { kind: "unique" };

/** Name similarity at or above this is the same product, whatever the domain. */
export const DUPLICATE_NAME_SIMILARITY = 0.92;
/** Between this and the duplicate threshold: flagged for a human, not merged. */
export const SIMILAR_NAME_SIMILARITY = 0.75;

/**
 * An index over existing products, built once per batch so each candidate's
 * check is a map lookup plus one pass over names.
 */
export function buildProductIndex(products: ExistingProduct[]) {
  const byDomain = new Map<string, ExistingProduct>();
  for (const product of products) {
    for (const url of [product.website_url, product.github_url]) {
      const site = normalizeSite(url ?? null);
      // github.com is a platform: its "domain" would match every repo.
      if (site && !isNotAProductSite(url)) byDomain.set(site.key, product);
    }
  }
  return { byDomain, products };
}

export type ProductIndex = ReturnType<typeof buildProductIndex>;

/** Checks one candidate (by site key and by name aliases) against what exists. */
export function checkDuplicate(
  index: ProductIndex,
  siteKey: string | null,
  names: (string | null | undefined)[],
): DuplicateCheck {
  if (siteKey) {
    const hit = index.byDomain.get(siteKey);
    if (hit) return { kind: "duplicate", productId: hit.id, reason: `Same website as "${hit.name}" (${siteKey})` };
  }

  let best: { product: ExistingProduct; similarity: number } | null = null;
  for (const name of names) {
    if (!name || nameKey(name).length < 3) continue;
    for (const product of index.products) {
      const similarity = nameSimilarity(name, product.name);
      if (!best || similarity > best.similarity) best = { product, similarity };
    }
  }

  if (best && best.similarity >= DUPLICATE_NAME_SIMILARITY) {
    // Same name on a *different* domain is two companies sharing a word far
    // more often than one company that moved — so a different, known domain
    // demotes this to "similar" rather than merging two businesses.
    const existingKey = normalizeSite(best.product.website_url ?? null)?.key ?? null;
    if (!existingKey || !siteKey || existingKey === siteKey) {
      return { kind: "duplicate", productId: best.product.id, reason: `Same name as "${best.product.name}"` };
    }
    return {
      kind: "similar",
      productId: best.product.id,
      similarity: best.similarity,
      reason: `Same name as "${best.product.name}" but a different website`,
    };
  }
  if (best && best.similarity >= SIMILAR_NAME_SIMILARITY) {
    return {
      kind: "similar",
      productId: best.product.id,
      similarity: best.similarity,
      reason: `Similar name to "${best.product.name}"`,
    };
  }
  return { kind: "unique" };
}

/** Legal suffixes a company drops from its brand but keeps in its registered name. */
const LEGAL_SUFFIX = /\b(private|pvt|p|limited|ltd|llp|inc|llc|corp|co|corporation|company)\b\.?/gi;
/** Words too common in company names to identify one ("Acme Labs" vs "Other Labs"). */
const GENERIC_NAME_WORDS = new Set([
  "labs", "tech", "technologies", "technology", "solutions", "systems", "software", "digital", "designs",
  "services", "india", "global", "ventures", "group", "studio", "cloud", "app", "apps", "online", "network",
]);

/**
 * A registered name pulled out of page text, cut back to the name itself.
 *
 * The extractor's pattern captures up to 60 characters before "Private
 * Limited", which can include the sentence leading into it: "Reach the Traccia
 * team at Algen AI Private Limited". A registered name is capitalised words
 * (and "&"), so everything up to the last lowercase word is dropped — leaving
 * "Algen AI Private Limited". Null when nothing name-shaped is left.
 */
export function cleanLegalName(raw: string | null | undefined): string | null {
  const words = (raw ?? "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  let start = 0;
  words.forEach((word, index) => {
    if (/^[a-z]/.test(word) && word !== "&") start = index + 1;
  });
  const name = words.slice(start).join(" ");
  const core = name.replace(LEGAL_SUFFIX, " ").replace(/[^A-Za-z0-9]+/g, "");
  return core.length >= 2 && name.split(" ").length <= 8 ? name : null;
}

/**
 * Whether a registered company name plausibly belongs to this product.
 *
 * A product site's footer names *some* company — often its own, but also an
 * auditor, a parent group, a hosting partner or a client ("BDO India LLP" on a
 * chatbot site). BharatHunt only states "built by X" when X visibly is the
 * product: a distinctive word of the product name or domain appears in the
 * company name, or the two names are near-identical spellings ("QuNu Labs"
 * for "QNu Labs"). Anything else is "not confirmed", never a guess.
 */
export function companyNameFits(
  company: string | null | undefined,
  product: { name?: string | null; website?: string | null },
): boolean {
  if (!company) return false;
  const companyCore = company.toLowerCase().replace(LEGAL_SUFFIX, " ");
  const companyKey = companyCore.replace(/[^a-z0-9]+/g, "");
  if (companyKey.length < 3) return false;

  const site = normalizeSite(product.website);
  const label = site ? site.key.split(".")[0].replace(/[^a-z0-9]/g, "") : "";
  const productWords = (product.name ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 4 && !GENERIC_NAME_WORDS.has(word));
  const productKey = (product.name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");

  const tokens = [...productWords, ...(label.length >= 4 ? [label] : [])];
  if (tokens.some((token) => companyKey.includes(token))) return true;
  // The company's first distinctive word inside the domain: "fractal" in fractal.ai.
  const companyWords = companyCore.split(/[^a-z0-9]+/).filter((word) => word.length >= 4 && !GENERIC_NAME_WORDS.has(word));
  if (label && companyWords.some((word) => label.includes(word))) return true;
  // Near-identical spellings of the whole name, legal suffix removed.
  return [productKey, label].some((key) => key.length >= 4 && nameSimilarity(key, companyKey) >= 0.7);
}
