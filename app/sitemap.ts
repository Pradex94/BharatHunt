import type { MetadataRoute } from "next";

import { BLOG_POSTS } from "@/lib/blog";
import { COLLECTIONS, MIN_PRODUCTS_TO_INDEX } from "@/lib/collections";
import { CATEGORIES, PROMOTE_ENABLED, SITE_URL } from "@/lib/constants";
import { FUNDING_GUIDES } from "@/lib/funding/guides";
import { isIndexableProduct } from "@/lib/seo";
import { getAllAiStorySlugs } from "@/services/ai-news";
import { getFundedStartupSlugs } from "@/services/funding";
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
    // The most frequently changing page on the site: a new ingestion run every
    // ten minutes, so `hourly` understates it and anything shorter is not a
    // value crawlers act on.
    { url: `${SITE_URL}/ai`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE_URL}/categories`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/collections`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/faq`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    // Promote is hidden by default (`PROMOTE_ENABLED`, lib/constants.ts) and
    // the page answers 404 while it is, so listing it here would hand crawlers
    // a dead URL. Flip the flag and the entry comes back with the page.
    ...(PROMOTE_ENABLED
      ? ([
          {
            url: `${SITE_URL}/promote`,
            lastModified: now,
            changeFrequency: "monthly",
            priority: 0.7,
          },
        ] as MetadataRoute.Sitemap)
      : []),
    // The Investor Directory's marketing half is fully public — hero, free
    // preview, pricing — so the URL is worth indexing. The premium rows are
    // never in the response for a signed-out request, which is what a crawler
    // is, so there is nothing here to leak into an index.
    { url: `${SITE_URL}/investors`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
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

  /*
   * Funding Intelligence.
   *
   * The three hubs are always listed — they are useful and indexable even
   * before any round is published, because the roadmap, the ten guides and the
   * calculator are real content that does not depend on the dataset.
   *
   * The company profiles come from `getFundedStartupSlugs`, which reads through
   * the same RLS predicate the page does (`published_round_count > 0`). So this
   * cannot advertise a profile that answers 404 — the two agree by construction
   * rather than by a filter kept in step by hand.
   */
  const fundingHubRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/funding`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    {
      url: `${SITE_URL}/funding/investors`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/funding/guides`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
  ];

  const fundingGuideRoutes: MetadataRoute.Sitemap = FUNDING_GUIDES.map((guide) => ({
    url: `${SITE_URL}/funding/guides/${guide.slug}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  /*
   * Every published AI story.
   *
   * One URL per *story*, never per source article — six publications covering
   * one model release is one entry here, which is the whole point of the
   * story/article split in 20260910000000 and what section 28 asks for. The
   * slugs come from the same RLS predicate the page reads through
   * (`status = published and not is_hidden`), so this cannot advertise a URL
   * that answers 404: the two agree by construction rather than by a filter
   * kept in step by hand.
   *
   * `lastModified` is `last_seen_at` — when the story was last *covered*, not
   * when we first saw it. A story that picked up three more sources this
   * morning has genuinely changed, and that is the signal a crawler wants.
   */
  const aiStories = await getAllAiStorySlugs();
  const aiStoryRoutes: MetadataRoute.Sitemap = aiStories.map((story) => ({
    url: `${SITE_URL}/ai/${story.slug}`,
    lastModified: story.last_seen_at ? new Date(story.last_seen_at) : now,
    changeFrequency: "daily",
    priority: 0.6,
  }));

  const fundedStartups = await getFundedStartupSlugs();
  const fundingStartupRoutes: MetadataRoute.Sitemap = fundedStartups.map((startup) => ({
    url: `${SITE_URL}/funding/${startup.slug}`,
    lastModified: startup.updated ? new Date(startup.updated) : now,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  return [
    ...staticRoutes,
    ...categoryRoutes,
    ...collectionRoutes,
    ...blogRoutes,
    ...marketplaceRoutes,
    ...productRoutes,
    ...fundingHubRoutes,
    ...fundingGuideRoutes,
    ...fundingStartupRoutes,
    ...aiStoryRoutes,
  ];
}
