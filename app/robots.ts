import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/constants";

/**
 * Lets crawlers index public content while keeping auth/account and API routes
 * out of the index. Points bots at the dynamic sitemap.
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
