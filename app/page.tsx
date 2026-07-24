/* Design system: design.md (Bharat Hunt — Product-Hunt-for-India, orange)
 * Pixel-recreation of the reference landing. Static demo content
 * (see components/landing/data.ts), not live product data.
 */

import { Hero } from "@/components/landing/hero";
import { FeatureSection } from "@/components/landing/feature-section";
import { TopProducts } from "@/components/landing/top-products";
import { CollectionsSection } from "@/components/landing/collections-section";
import { CommunitySection } from "@/components/landing/community-section";
import { Newsletter } from "@/components/landing/newsletter";

export default function Home() {
  return (
    <>
      <Hero />
      <FeatureSection />
      <TopProducts />
      <CollectionsSection />
      <CommunitySection />
      <Newsletter />
    </>
  );
}
