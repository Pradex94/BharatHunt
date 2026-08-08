import type { MetadataRoute } from "next";

import { CATEGORIES, SITE_URL } from "@/lib/constants";
import { isIndexableProduct } from "@/lib/seo";
import { getAllPublishedProductSlugs, getCategoryCounts } from "@/services/products";

/**
 * Dynamic sitemap: stable marketing/discovery routes plus every published
 * product and category page. Regenerated on request (it reads live data), so
 * new launches show up for crawlers without a redeploy.
 */
/**
 * Generated per request, never prerendered. The Supabase client is request
 * scoped (it reads the Clerk token from `headers()`), which isn't available
 * during static export — prerendering silently produced a sitemap with zero
 * products. Per-request is also what makes a new launch crawlable without a
 * redeploy, which is the whole point of a dynamic sitemap.
 */
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/marketplace`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE_URL}/categories`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/advertise`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/blog`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE_URL}/cookies`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];

  // Only categories that actually hold products. An empty category page sets
  // `noindex`, so advertising it here would contradict the page itself.
  const counts = await getCategoryCounts();
  const categoryRoutes: MetadataRoute.Sitemap = CATEGORIES.filter(
    (category) => (counts[category.name] ?? 0) > 0,
  ).map((category) => ({
    url: `${SITE_URL}/categories/${category.slug}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  // Same indexability rule the product page applies (lib/seo.ts), so the
  // sitemap never lists a page that marks itself noindex.
  const products = (await getAllPublishedProductSlugs()).filter(isIndexableProduct);
  const productRoutes: MetadataRoute.Sitemap = products.map((product) => ({
    url: `${SITE_URL}/products/${product.slug}`,
    lastModified: new Date(product.lastModified),
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return [...staticRoutes, ...categoryRoutes, ...productRoutes];
}
