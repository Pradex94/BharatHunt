import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/constants";

/**
 * Lets crawlers reach public content while keeping auth/account and API routes
 * out of it. Points bots at the dynamic sitemap.
 *
 * Everything listed is a route that needs a session or has no public meaning.
 * The public surface — `/products/*`, `/categories/*`, `/collections/*`,
 * `/blog/*`, `/faq` — is deliberately absent from this list, and the wildcard
 * in the edit-form entry is what keeps blocking that form from also blocking
 * the product pages beside it.
 *
 * Note what this file cannot do: `Disallow` stops crawling, not indexing. A
 * blocked URL that is linked from elsewhere can still be indexed, URL-only,
 * with no description. Anything that must stay out of the index carries a
 * `noindex` on the page itself as well — /admin, /dashboard and /submit all set
 * one in their own metadata, and thin pages are handled by the shared
 * thresholds in lib/seo.ts and lib/collections.ts.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/admin", "/submit", "/login", "/signup", "/products/*/edit"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
