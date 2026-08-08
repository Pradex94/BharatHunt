/**
 * SEO helpers: absolute-URL resolution and JSON-LD (schema.org) builders.
 *
 * Framework-agnostic and safe to import anywhere (no `next/*` imports). The
 * structured data here is deliberately conservative — we only emit facts we can
 * stand behind (e.g. a free `Offer` only when the product is actually free), so
 * Google never sees fabricated ratings or prices that could trigger a penalty.
 */

import { SITE_NAME, SITE_URL } from "@/lib/constants";
import { slugForCategory } from "@/lib/constants";

/** Resolve a site-relative path (or pass through an already-absolute URL). */
export function absoluteUrl(path = "/"): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Organization node — identifies the publisher across the site. */
export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    logo: absoluteUrl("/icon"),
    description:
      "A curated marketplace where founders launch products and the community discovers, upvotes, and shares the tools worth their attention.",
  };
}

/**
 * WebSite node with a Sitelinks Search Box action, wiring Google's search box
 * straight to the marketplace query param.
 */
export function websiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/marketplace?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

/** BreadcrumbList from an ordered list of {name, path} crumbs. */
export function breadcrumbSchema(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

type ProductSchemaInput = {
  name: string;
  description: string | null;
  tagline: string;
  slug: string;
  category: string;
  pricingType: string;
  image?: string | null;
};

/**
 * SoftwareApplication node for a product page. A free `Offer` is attached only
 * for free/freemium products (where "price 0" is truthful); paid products omit
 * the offer rather than guessing a price. No `aggregateRating` is emitted —
 * upvotes aren't star reviews, and inventing one risks a structured-data
 * penalty.
 */
export function productSchema({
  name,
  description,
  tagline,
  slug,
  category,
  pricingType,
  image,
}: ProductSchemaInput) {
  const isFree = pricingType === "free" || pricingType === "freemium";
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name,
    description: description || tagline,
    url: absoluteUrl(`/products/${slug}`),
    applicationCategory: category,
    operatingSystem: "Web",
    ...(image ? { image: absoluteUrl(image) } : {}),
    ...(isFree
      ? {
          offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "USD",
          },
        }
      : {}),
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
    },
  };
}

/** Convenience: the canonical breadcrumb trail for a product page. */
export function productBreadcrumbs(product: { name: string; slug: string; category: string }) {
  const categorySlug = slugForCategory(product.category);
  return breadcrumbSchema([
    { name: "Home", path: "/" },
    { name: "Products", path: "/marketplace" },
    ...(categorySlug
      ? [{ name: product.category, path: `/categories/${categorySlug}` }]
      : []),
    { name: product.name, path: `/products/${product.slug}` },
  ]);
}

/**
 * Whether a product listing has enough substance to belong in the index.
 *
 * Shared by the product page's `robots` directive and the sitemap, so the two
 * can never disagree — a sitemap that advertises a page the page itself marks
 * `noindex` is a contradiction crawlers report as an error. Thin listings stay
 * publicly reachable and keep `follow`; they re-enter the index by themselves
 * once the maker fills them in.
 */
export function isIndexableProduct(product: {
  tagline: string;
  description: string | null;
  hero_image_url: string | null;
  screenshot_urls: string[] | null;
}): boolean {
  const description = (product.description ?? "").trim();
  if (description.length >= 120) return true;
  const hasImagery =
    Boolean(product.hero_image_url) || (product.screenshot_urls ?? []).length > 0;
  return description.length >= 40 && hasImagery && product.tagline.trim().length >= 20;
}

/** Query key + value appended to outbound product links (Product Hunt uses `?ref=producthunt`). */
export const REFERRAL_PARAM = "ref";
export const REFERRAL_VALUE = "bharathunt";

/**
 * Tags an outbound product link so the destination can attribute the visit.
 *
 * Without this a maker sees Bharat Hunt traffic only as a generic referrer (or
 * as "direct" when the browser withholds one), so the listing looks like it
 * sends nothing. `?ref=bharathunt` shows up in their analytics by name.
 *
 * Merges into any existing query string rather than replacing it, and leaves a
 * URL alone if it already carries its own `ref`. Non-http(s) or unparseable
 * input is returned untouched — the link still has to work.
 */
export function withReferral(url: string | null | undefined): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return url;
    if (parsed.searchParams.has(REFERRAL_PARAM)) return url;
    parsed.searchParams.set(REFERRAL_PARAM, REFERRAL_VALUE);
    return parsed.toString();
  } catch {
    return url;
  }
}
