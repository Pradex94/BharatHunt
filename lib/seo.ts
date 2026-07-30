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
