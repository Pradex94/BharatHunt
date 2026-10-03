/* Design system: design.md (Bharat Hunt — Product-Hunt-for-India, orange)
 *
 * The front door to the ecosystem, in one story: discover what is being built
 * (hero, search, Today's Hunt, the daily board, categories), then the
 * intelligence around it (AI, funding, investors, where founders build), then
 * the founder path and the newest launches.
 *
 * Everything a visitor can read as a claim — every product, count, rank,
 * round, investor and timestamp — comes from live data. Only our own copy is
 * static (components/landing/data.ts), and a section with no real data behind
 * it hides itself rather than rendering an empty frame or a made-up number.
 *
 * Cost: one pass of cached reads at (re)validation time, shared with the pages
 * these sections link to wherever possible, and none per visitor — see below.
 */

import type { Metadata } from "next";

import { Hero } from "@/components/landing/hero";
import { TrustStrip } from "@/components/landing/trust-strip";
import { TodaysHunt } from "@/components/landing/todays-hunt";
import { Daily5Section } from "@/components/landing/daily5-section";
import { SavedStrip } from "@/components/landing/saved-strip";
import { LaunchBoard } from "@/components/landing/launch-board";
import { CategoryExplorer } from "@/components/landing/category-explorer";
import { AiSection } from "@/components/landing/ai-section";
import { IntelligenceSection } from "@/components/landing/intelligence-section";
import { CommunitySection } from "@/components/landing/community-section";
import { FounderCta } from "@/components/landing/founder-cta";
import { RecentLaunches } from "@/components/landing/recent-launches";
import { FinalCta } from "@/components/landing/final-cta";
import { Newsletter } from "@/components/landing/newsletter";
import { JsonLd } from "@/components/seo/json-ld";
import { COLLECTIONS, MIN_PRODUCTS_TO_INDEX } from "@/lib/collections";
import { SITE_NAME, SITE_URL } from "@/lib/constants";
import { formatDayMonth } from "@/lib/format-date";
import { buildLaunchBoard, pickRecentLaunches, pickTodaysHunt } from "@/lib/home-feed";
import { buildNetworkNodes } from "@/lib/network-summary";
import { freshness } from "@/lib/ai-news/format";
import { parseFundingFilters } from "@/lib/funding/filters";
import { groupFundingEvents } from "@/lib/funding/grouping";
import { absoluteUrl, itemListSchema } from "@/lib/seo";
import {
  getCategoryCounts,
  getCollectionCounts,
  getLaunchStateCounts,
  getLeadingLaunch,
  getPlatformStats,
  getRecentLaunchPool,
  getTopUpvotedProducts,
} from "@/services/products";
import { getAiFreshness, getTrendingAiStories } from "@/services/ai-news";
import { getFundingFeed, getFundingInvestors, getFundingLastSync } from "@/services/funding";
import { getLatestDaily5 } from "@/services/daily-agent";

const TITLE = "Bharat Hunt — Discover India's Next Great Startups & Software";
const DESCRIPTION =
  "Discover startups, AI products, software and emerging companies being built in India. Launch your product, explore funding and discover the next generation of builders.";

export const metadata: Metadata = {
  // `absolute`: the layout's template would otherwise append "· Bharat Hunt".
  title: { absolute: TITLE },
  description: DESCRIPTION,
  // The layout sets no site-wide canonical, so the homepage declares its own.
  alternates: { canonical: "/" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: SITE_NAME,
    locale: "en_IN",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
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
 * `services/products.ts` wraps its reads in `cacheRemember()` (as do the AI and
 * funding services), so the homepage issues several such fetches.
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

/** How many "Recently launched" cards arrive in the HTML; the rest load on demand. */
const RECENT_INITIAL = 6;

export default async function Home() {
  const now = new Date();

  const [
    pool,
    leading,
    allTime,
    stats,
    launchCounts,
    categoryCounts,
    collectionCounts,
    aiStories,
    aiFresh,
    funding,
    fundingSync,
    investorPage,
    latestDaily5,
  ] = await Promise.all([
    getRecentLaunchPool(),
    getLeadingLaunch(now),
    getTopUpvotedProducts(6),
    getPlatformStats(),
    getLaunchStateCounts(),
    getCategoryCounts(),
    getCollectionCounts(
      COLLECTIONS.map((collection) => ({ slug: collection.slug, ...collection.filter })),
    ),
    getTrendingAiStories(4),
    getAiFreshness(),
    // The default /funding view — same cache entry the funding page reads.
    getFundingFeed(parseFundingFilters({})),
    getFundingLastSync(),
    // Page one of /funding/investors — again a shared cache entry.
    getFundingInvestors(null, 1),
    getLatestDaily5(),
  ]);

  // ── Discovery: three views of one pool (lib/home-feed.ts) ──────────────
  const todaysHunt = pickTodaysHunt(pool, 6);
  const board = buildLaunchBoard(pool, allTime, now);
  const recent = pickRecentLaunches(
    pool,
    todaysHunt.map((product) => product.id),
    RECENT_INITIAL,
  );
  const lastRecent = recent.at(-1);
  const recentOffset = lastRecent ? pool.findIndex((p) => p.id === lastRecent.id) + 1 : 0;

  /*
   * Hunt of the Day is `getLeadingLaunch` — the launch leading the current IST
   * day (or the latest day that had launches), cached under that day's key, so
   * it is the same for every visitor and changes only when the board does.
   * If that read failed, the all-time leader stands in with no day attached,
   * and the card then names no day it cannot vouch for. The pool supplies the
   * launch date and location the leaderboard columns do not carry.
   */
  const huntBase = leading?.product ?? allTime[0] ?? null;
  const huntExtra = huntBase ? pool.find((product) => product.id === huntBase.id) : undefined;
  const hunt = huntBase
    ? {
        ...huntBase,
        published_at: huntExtra?.published_at ?? null,
        launch_state: huntExtra?.launch_state ?? null,
      }
    : null;

  // ── Hero: the discovery network — real destinations, real counts ──────
  // Every value's source is documented in lib/network-summary.ts.
  const aiToolCount = collectionCounts["ai-tools"] ?? 0;
  const fundingRounds = funding.failed ? 0 : funding.totalCount;
  const nodes = buildNetworkNodes({
    categoryCounts,
    collectionCounts,
    aiStories24h: aiFresh.stories_24h,
    fundingRounds,
    totalProducts: stats.products,
  });

  const shortcuts = [
    aiToolCount > 0
      ? { label: "AI tools", href: "/collections/ai-tools" }
      : { label: "AI news", href: "/ai" },
    { label: "Developer tools", href: "/categories/developer-tools" },
    { label: "Fintech", href: "/categories/finance" },
    { label: "Funding rounds", href: "/funding" },
  ];

  // ── Categories: same eligibility rule the collection pages and sitemap use ─
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

  // ── Intelligence ───────────────────────────────────────────────────────
  // Ingestion folds a second outlet's report into the same round, but the
  // feed can still hold near-duplicates; fold them display-side as /funding does.
  const rounds = groupFundingEvents(funding.rounds).slice(0, 5);
  const investors = investorPage.investors.slice(0, 4);

  // ── Structured data: the page, and the launches it actually renders ────
  const webPage = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: TITLE,
    description: DESCRIPTION,
    url: absoluteUrl("/"),
    inLanguage: "en-IN",
    isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
    about: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
  };

  return (
    <>
      <JsonLd
        data={[
          webPage,
          ...(todaysHunt.length > 0 ? [itemListSchema(todaysHunt, { name: "Today’s Hunt", path: "/" })] : []),
        ]}
      />

      <Hero nodes={nodes} shortcuts={shortcuts} />

      <TrustStrip
        stats={[
          { value: stats.products, label: "Products launched" },
          { value: stats.makers, label: "Founders" },
          { value: aiToolCount, label: "AI products" },
          { value: fundingRounds, label: "Funding rounds tracked" },
        ]}
      />

      <TodaysHunt products={todaysHunt} latestLaunch={formatDayMonth(pool[0]?.published_at)} />

      <Daily5Section day={latestDaily5} now={now} />

      {/* Client-only, and empty unless this visitor has saved something. */}
      <SavedStrip />

      <LaunchBoard hunt={hunt} huntDay={leading?.day ?? null} board={board.products} scope={board.scope} />

      <CategoryExplorer
        categoryCounts={categoryCounts}
        collectionCounts={collectionCounts}
        collections={featuredCollections}
      />

      <AiSection stories={aiStories} fresh={aiFresh} stamp={freshness(aiFresh.last_success_at, now)} now={now} />

      <IntelligenceSection
        rounds={rounds}
        roundsFailed={funding.failed}
        roundCount={fundingRounds}
        lastSync={fundingSync}
        investors={investors}
        investorCount={investorPage.totalCount}
      />

      <CommunitySection launchCounts={launchCounts} />

      <FounderCta />

      <RecentLaunches
        initial={recent}
        initialOffset={recentOffset}
        exclude={todaysHunt.map((product) => product.id)}
      />

      <FinalCta />

      <Newsletter />
    </>
  );
}
