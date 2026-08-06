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
import { getPlatformStats, getTopUpvotedProducts } from "@/services/products";

export default async function Home() {
  const [ranked, stats] = await Promise.all([getTopUpvotedProducts(6), getPlatformStats()]);

  // The hero features the leader; the grid picks up from #2 so the same
  // product isn't shown twice in one viewport.
  const [leader, ...rest] = ranked;

  return (
    <>
      <Hero topProduct={leader ?? null} stats={stats} />
      <FeatureSection />
      <TopProducts products={rest} startRank={2} heading="Also climbing" />
      <CommunitySection stats={stats} />
      <Newsletter />
    </>
  );
}
