/* Design system: design.md (Bharat Hunt — Product-Hunt-for-India, orange)
 *
 * Everything a visitor reads as a claim on this page — the featured launch,
 * the leaderboard, the community counts — comes from live Supabase data.
 * Only our own feature copy is static (components/landing/data.ts).
 */

import { Hero } from "@/components/landing/hero";
import { FeatureSection } from "@/components/landing/feature-section";
import { TopProducts } from "@/components/landing/top-products";
import { CommunitySection } from "@/components/landing/community-section";
import { Newsletter } from "@/components/landing/newsletter";
import { CollectionRail } from "@/components/landing/collection-rail";
import { COLLECTIONS, MIN_PRODUCTS_TO_INDEX } from "@/lib/collections";
import {
  getCollectionCounts,
  getLaunchStateCounts,
  getPlatformStats,
  getTopUpvotedProducts,
} from "@/services/products";

export const metadata = {
  // The layout no longer sets a site-wide canonical, so the homepage declares
  // its own rather than relying on Google to infer one.
  alternates: { canonical: "/" },
};

/*
 * ISR, and it now actually applies.
 *
 * This route previously declared BOTH `dynamic = "force-dynamic"` and this
 * `revalidate`. `force-dynamic` wins, so the revalidate below was dead code and
 * every homepage hit re-rendered from scratch: Clerk token round-trip, then
 * three Supabase aggregates, before a single byte of HTML was flushed. That
 * server time sat directly in front of the LCP paint.
 *
 * `force-dynamic` was there because these reads went through the Clerk
 * authenticated Supabase client. They are the same for every visitor and pass
 * anon RLS, so they now use `createPublicClient()` and this page prerenders and
 * revalidates on a 12-hour cycle as originally intended.
 */
export const revalidate = 43200;

export default async function Home() {
  const [ranked, stats, launchCounts, collectionCounts] = await Promise.all([
    getTopUpvotedProducts(6),
    getPlatformStats(),
    getLaunchStateCounts(),
    getCollectionCounts(
      COLLECTIONS.map((collection) => ({ slug: collection.slug, ...collection.filter })),
    ),
  ]);

  /*
   * The eight biggest collections that clear their own index threshold, one per
   * kind first so the rail shows the shape of the system rather than eight
   * variations of "free X". Linking to a page that marks itself noindex would
   * spend the homepage's authority on a dead end, so the threshold is the same
   * one the pages and the sitemap use.
   */
  const eligible = COLLECTIONS.filter(
    (collection) => (collectionCounts[collection.slug] ?? 0) >= MIN_PRODUCTS_TO_INDEX,
  ).sort((a, b) => (collectionCounts[b.slug] ?? 0) - (collectionCounts[a.slug] ?? 0));
  const featuredCollections = [
    ...new Set([
      ...(["topic", "pricing-category", "state"] as const).flatMap((kind) =>
        eligible.filter((collection) => collection.kind === kind).slice(0, 2),
      ),
      ...eligible,
    ]),
  ].slice(0, 8);

  // The hero features the leader; the grid picks up from #2 so the same
  // product isn't shown twice in one viewport.
  const [leader, ...rest] = ranked;

  return (
    <>
      <Hero topProduct={leader ?? null} stats={stats} />
      <TopProducts products={rest} startRank={2} heading="Also climbing" />
      <CollectionRail collections={featuredCollections} counts={collectionCounts} />
      <FeatureSection />
      <CommunitySection stats={stats} launchCounts={launchCounts} />
      <Newsletter />
    </>
  );
}
