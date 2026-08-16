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
import {
  getLaunchStateCounts,
  getPlatformStats,
  getTopUpvotedProducts,
} from "@/services/products";

// The homepage reads live Supabase data through a Clerk-authenticated server
// client. That client uses request headers for its access token, so this route
// must be rendered dynamically rather than prerendered during the build.
export const dynamic = "force-dynamic";

export const metadata = {
  // The layout no longer sets a site-wide canonical, so the homepage declares
  // its own rather than relying on Google to infer one.
  alternates: { canonical: "/" },
};

// Revalidate page data every 12 hours (43200 seconds) via ISR
export const revalidate = 43200;

export default async function Home() {
  const [ranked, stats, launchCounts] = await Promise.all([
    getTopUpvotedProducts(6),
    getPlatformStats(),
    getLaunchStateCounts(),
  ]);

  // The hero features the leader; the grid picks up from #2 so the same
  // product isn't shown twice in one viewport.
  const [leader, ...rest] = ranked;

  return (
    <>
      <Hero topProduct={leader ?? null} stats={stats} />
      <FeatureSection />
      <TopProducts products={rest} startRank={2} heading="Also climbing" />
      <CommunitySection stats={stats} launchCounts={launchCounts} />
      <Newsletter />
    </>
  );
}
