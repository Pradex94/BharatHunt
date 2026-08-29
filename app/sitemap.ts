import type { MetadataRoute } from "next";

import { BLOG_POSTS } from "@/lib/blog";
import { COLLECTIONS, MIN_PRODUCTS_TO_INDEX } from "@/lib/collections";
import { CATEGORIES, SITE_URL } from "@/lib/constants";
import { isIndexableProduct } from "@/lib/seo";
import {
  getAllPublishedProductSlugs,
  getCategoryCounts,
  getCollectionCounts,
  PRODUCTS_PAGE_SIZE,
} from "@/services/products";

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
    { url: `${SITE_URL}/collections`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/faq`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/promote`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
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

  // Every post, not just the index. `/blog` was listed on its own, so the
  // posts themselves were reachable only by following a link from it -- and a
  // crawler that never got round to `/blog` never learned they existed.
  const blogRoutes: MetadataRoute.Sitemap = BLOG_POSTS.map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: new Date(post.date),
    changeFrequency: "yearly",
    priority: 0.5,
  }));

  /*
   * Programmatic collections, filtered by the same threshold the pages
   * themselves apply (lib/collections.ts). A sitemap entry for a page that
   * marks itself `noindex` is a contradiction crawlers report as an error, so
   * the rule lives in one place and both sides read it. One facet query covers
   * every collection rather than a count each.
   */
  const collectionCounts = await getCollectionCounts(
    COLLECTIONS.map((collection) => ({ slug: collection.slug, ...collection.filter })),
  );
  const collectionRoutes: MetadataRoute.Sitemap = COLLECTIONS.filter(
    (collection) => (collectionCounts[collection.slug] ?? 0) >= MIN_PRODUCTS_TO_INDEX,
  ).map((collection) => ({
    url: `${SITE_URL}/collections/${collection.slug}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  const published = await getAllPublishedProductSlugs();

  // Same indexability rule the product page applies (lib/seo.ts), so the
  // sitemap never lists a page that marks itself noindex.
  const products = published.filter(isIndexableProduct);
  const productRoutes: MetadataRoute.Sitemap = products.map((product) => ({
    url: `${SITE_URL}/products/${product.slug}`,
    lastModified: new Date(product.lastModified),
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  // `/marketplace` renders one page of products at a time, so page 1 links to
  // twelve of them and nothing links to the rest. Listing the remaining pages
  // gives every product a crawlable page that actually links to it, instead of
  // leaving it discoverable only as a bare sitemap entry -- which Search
  // Console reports as "Discovered - currently not indexed" and rarely crawls.
  // Counted from all published products, since that is what the page lists.
  const pageCount = Math.ceil(published.length / PRODUCTS_PAGE_SIZE);
  const marketplaceRoutes: MetadataRoute.Sitemap = Array.from(
    { length: Math.max(0, pageCount - 1) },
    (_, index) => ({
      url: `${SITE_URL}/marketplace?page=${index + 2}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.5,
    }),
  );

  return [
    ...staticRoutes,
    ...categoryRoutes,
    ...collectionRoutes,
    ...blogRoutes,
    ...marketplaceRoutes,
    ...productRoutes,
  ];
}
