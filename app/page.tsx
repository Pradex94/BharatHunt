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
  getLeadingLaunch,
  getPlatformStats,
  getTopUpvotedProducts,
} from "@/services/products";

export const metadata = {
  // The layout no longer sets a site-wide canonical, so the homepage declares
  // its own rather than relying on Google to infer one.
  alternates: { canonical: "/" },
};

/*
 * Prerendered, and `force-static` is what finally makes that true in production.
 *
 * Two earlier attempts at this both looked correct and both silently failed:
 *
 *   1. The route declared `dynamic = "force-dynamic"` *and* `revalidate`.
 *      `force-dynamic` wins, so the revalidate was dead code.
 *   2. `force-dynamic` was dropped and the reads moved to `createPublicClient()`
 *      (no Clerk `auth()`, so no request-time API). `next build` then reported
 *      `○ /  12h` — locally. Production still served every hit from a function.
 *
 * The cause of (2) is `@upstash/redis`. Every command it issues is
 * `fetch(url, { cache: "no-store" })` (see `nodejs.mjs`, `cache: config.cache ??
 * "no-store"`), and per Next's caching guide an individual `fetch` with
 * `cache: "no-store"` is enough to "make the route dynamically rendered".
 * `services/products.ts` wraps these three reads in `cacheRemember()`, so the
 * homepage issues three such fetches.
 *
 * `.env.local` has no Upstash credentials, so `getRedis()` returns null locally
 * and no fetch is ever made — the route prerendered on this machine and was
 * dynamic on Vercel, where the credentials exist. Reproduced by building twice,
 * once with `UPSTASH_REDIS_REST_URL`/`_TOKEN` set: `○ / 12h` becomes `ƒ /`.
 *
 * The measured cost was the whole of the site's TTFB problem. This page is
 * identical for every visitor, so a request that reached the origin paid:
 * Mumbai edge -> function in `iad1` (Vercel's default region) -> three Supabase
 * round trips to `ap-northeast-1` -> three Upstash round trips -> back. Against
 * production: `/` 1.74s TTFB, `X-Vercel-Cache: MISS`; `/terms` — the same
 * layout, prerendered, served from the Mumbai edge — 0.22s.
 *
 * `force-static` states the intent the two previous fixes only implied: this
 * page has no per-request input, so prerender it and let anything claiming
 * otherwise resolve to empty. Request-time APIs (`cookies`, `headers`,
 * `useSearchParams`) return empty values here — nothing on this page reads
 * them, and a future edit that needs one should move that part behind its own
 * boundary rather than quietly costing every visitor another second.
 *
 * Ten minutes, not twelve hours: the hero states which launch is leading, and
 * with a background-revalidating prerender a short window is nearly free —
 * visitors are served the cached HTML either way. Publishing a launch also
 * calls `revalidatePath("/")` (lib/review.ts, lib/actions/products.ts), so the
 * window is the ceiling on staleness for upvote *ordering*, not for whether a
 * new launch appears at all. It is also the lag on the hero's board rolling
 * over at IST midnight, which is well inside what "today" has to mean.
 */
export const dynamic = "force-static";
export const revalidate = 600;

export default async function Home() {
  const [leading, ranked, stats, launchCounts, collectionCounts] = await Promise.all([
    getLeadingLaunch(),
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

  /*
   * Two different boards, which is the point. The hero is *today's* — whichever
   * launch is leading the current IST day (see `getLeadingLaunch`) — while the
   * grid below stays the all-time upvote leaderboard, because a day's cohort is
   * often one or two launches on a few upvotes and five near-empty cards is a
   * worse homepage than five real ones.
   *
   * The two overlap only when a new launch is also the all-time leader. When
   * they do, the hero's product is dropped from the grid rather than shown
   * twice in one viewport; the surviving cards keep their true positions, so
   * the numbering skips rather than lying.
   *
   * `getLeadingLaunch` fails soft, and an empty hero is the most expensive
   * thing on this page to lose, so the all-time leader stands in if the daily
   * query is the one that broke. It arrives with no day attached, which is
   * exactly right — the badge then reads "Top launch" instead of naming a day
   * we did not actually resolve.
   */
  const heroProduct = leading?.product ?? ranked[0] ?? null;
  const board = ranked
    .map((product, index) => ({ ...product, rank: index + 1 }))
    .filter((product) => product.id !== heroProduct?.id)
    .slice(0, 5);

  return (
    <>
      <Hero topProduct={heroProduct} topProductDay={leading?.day ?? null} stats={stats} />
      <TopProducts products={board} heading="Most upvoted" />
      <CollectionRail collections={featuredCollections} counts={collectionCounts} />
      <FeatureSection />
      <CommunitySection stats={stats} launchCounts={launchCounts} />
      <Newsletter />
    </>
  );
}
