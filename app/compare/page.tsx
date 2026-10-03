/* Design system: design.md · Product Intelligence — side-by-side comparison.
 * A table the reader decides from: no verdict row, provenance on every cell.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Scale } from "lucide-react";

import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { Container } from "@/components/ui/container";
import { Display, Lead } from "@/components/ui/typography";
import { buttonVariants } from "@/components/ui/button";
import { ShareMenu } from "@/components/products/share-menu";
import { ComparePicker } from "@/components/discovery/compare-picker";
import { CompareTable, ComparisonLinks } from "@/components/discovery/compare-table";
import { compareHref, MAX_COMPARE_PRODUCTS, parseCompareSlugs } from "@/lib/compare-links";
import { pairPath } from "@/lib/intelligence/compare-pairs";
import { absoluteUrl } from "@/lib/seo";
import { getProductsBySlugs } from "@/services/intelligence";
import { findComparePair, getComparePairs } from "@/services/compare-pairs";

type CompareSearchParams = Promise<{ products?: string | string[] }>;

/**
 * Query-string comparisons are working URLs — any combination, unbounded — so
 * they are never indexed. A two-product query that matches a curated pair
 * canonicalises to that pair's page; everything else to /compare, which is
 * the indexable hub of curated comparisons.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: CompareSearchParams;
}): Promise<Metadata> {
  const slugs = parseCompareSlugs((await searchParams).products);
  const products = slugs.length >= 2 ? await getProductsBySlugs(slugs) : [];
  const curated = slugs.length === 2 ? await findComparePair([...slugs].sort().join("-vs-")) : null;
  const title =
    products.length >= 2 ? `Compare ${products.map((product) => product.name).join(" vs ")}` : "Compare products";

  return {
    title,
    description:
      "Compare Indian products side by side — pricing, free plans, what each one does, who it is for and where it is built. Every cell comes from the listings themselves.",
    alternates: { canonical: curated ? curated.path : "/compare" },
    robots: slugs.length > 0 ? { index: false, follow: true } : undefined,
  };
}

export default async function ComparePage({ searchParams }: { searchParams: CompareSearchParams }) {
  const slugs = parseCompareSlugs((await searchParams).products);
  const [products, pairs] = await Promise.all([getProductsBySlugs(slugs), getComparePairs()]);
  const currentSlugs = products.map((product) => product.slug);
  const curated = currentSlugs.length === 2 ? pairs.find((pair) => pair.path === pairPath(currentSlugs[0], currentSlugs[1])) : null;

  return (
    <Container className="flex flex-col gap-8 py-10 md:py-14">
      <Breadcrumbs
        items={[
          { name: "Home", path: "/" },
          { name: "Marketplace", path: "/marketplace" },
          { name: "Compare", path: "/compare" },
        ]}
      />

      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <Display className="text-3xl sm:text-4xl">Compare products</Display>
          {products.length >= 2 && (
            <ShareMenu
              url={absoluteUrl(curated ? curated.path : compareHref(currentSlugs))}
              name={products.map((product) => product.name).join(" vs ")}
              tagline="A side-by-side comparison on Bharat Hunt"
            />
          )}
        </div>
        <Lead className="max-w-2xl">
          Up to {MAX_COMPARE_PRODUCTS} products side by side. No winner is declared — every cell comes from
          the products&apos; own listings, labelled with where it came from.
        </Lead>
      </div>

      <ComparePicker current={currentSlugs} />

      {products.length === 0 ? (
        <>
          <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
            <Scale className="size-8 text-primary" aria-hidden="true" />
            <p className="text-base font-semibold text-ink">Compare up to {MAX_COMPARE_PRODUCTS} products to find the right fit.</p>
            <p className="max-w-md text-sm text-body">
              Use <span className="font-medium text-ink">Compare</span> on any product card or product page, or search above.
              Your picks stay in the tray at the bottom of the screen while you browse.
            </p>
            <Link href="/marketplace" className={buttonVariants({ size: "sm" })}>
              Browse the marketplace
            </Link>
          </div>
          {pairs.length > 0 && (
            <section aria-labelledby="popular-comparisons" className="flex flex-col gap-3">
              <h2 id="popular-comparisons" className="font-sans text-lg font-semibold tracking-normal text-ink">
                Popular comparisons
              </h2>
              <p className="text-sm text-muted">Products whose listings describe the same job, side by side.</p>
              <ComparisonLinks pairs={pairs.slice(0, 24)} />
            </section>
          )}
        </>
      ) : (
        <>
          {products.length === 1 && (
            <p className="rounded-lg bg-secondary-bg px-4 py-3 text-sm text-body">
              Add at least one more product to compare {products[0].name} with.
            </p>
          )}
          <CompareTable products={products} removable />
          {curated && (
            <p className="text-sm text-muted">
              This comparison has its own page:{" "}
              <Link href={curated.path} className="font-medium text-primary hover:underline">
                {curated.a.name} vs {curated.b.name}
              </Link>
              .
            </p>
          )}
        </>
      )}
    </Container>
  );
}
