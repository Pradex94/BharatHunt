/* Design system: design.md — the index of every programmatic collection.
 *
 * This page is what makes the collections crawlable at all. Without it each one
 * would be reachable only from a sitemap entry, which Search Console reports as
 * "Discovered — currently not indexed" and rarely follows up on. A real page
 * that links to them is the difference.
 */

import type { Metadata } from "next";
import Link from "next/link";

import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Display, Lead, Numeric } from "@/components/ui/typography";
import { COLLECTIONS, MIN_PRODUCTS_TO_INDEX } from "@/lib/collections";
import { getCollectionCounts } from "@/services/products";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Collections",
  description:
    "Curated slices of the Bharat Hunt catalogue — free tools, freemium products and paid software, grouped by category and topic.",
  alternates: { canonical: "/collections" },
};

export default async function CollectionsIndexPage() {
  const counts = await getCollectionCounts(
    COLLECTIONS.map((collection) => ({ slug: collection.slug, ...collection.filter })),
  );

  /*
   * Only collections that clear the index threshold are listed. Linking to a
   * page that marks itself `noindex` spends crawl budget to reach a page that
   * then asks not to be kept, and reads to a visitor as a dead end.
   */
  const listed = COLLECTIONS.filter(
    (collection) => (counts[collection.slug] ?? 0) >= MIN_PRODUCTS_TO_INDEX,
  ).sort((a, b) => (counts[b.slug] ?? 0) - (counts[a.slug] ?? 0));

  const topics = listed.filter((collection) => collection.kind === "topic");
  const byPricing = listed.filter((collection) => collection.kind === "pricing-category");
  const byState = listed.filter((collection) => collection.kind === "state");

  return (
    <>
      <Section className="border-b border-border py-12 md:py-16">
        <Container className="flex flex-col gap-5">
          <Breadcrumbs
            items={[
              { name: "Home", path: "/" },
              { name: "Collections", path: "/collections" },
            ]}
          />
          <Display className="max-w-3xl">Collections</Display>
          <Lead className="max-w-2xl">
            Slices of the catalogue worth their own page — grouped by what a product costs, what it
            does, and who it is for. Each one is built from live listings, so a collection appears
            here only once there is enough in it to be worth reading.
          </Lead>
        </Container>
      </Section>

      <Section className="py-12 md:py-16">
        <Container className="flex flex-col gap-12">
          {topics.length > 0 && (
            <div className="flex flex-col gap-4">
              <h2 className="text-lg font-bold text-ink">By topic</h2>
              <CollectionGrid collections={topics} counts={counts} />
            </div>
          )}

          {byPricing.length > 0 && (
            <div className="flex flex-col gap-4">
              <h2 className="text-lg font-bold text-ink">By price and category</h2>
              <CollectionGrid collections={byPricing} counts={counts} />
            </div>
          )}

          {byState.length > 0 && (
            <div className="flex flex-col gap-4">
              <h2 className="text-lg font-bold text-ink">By where they were built</h2>
              <p className="max-w-2xl text-sm text-body">
                The launch location every maker confirms when they submit. It is the one thing about
                this catalogue no other marketplace holds.
              </p>
              <CollectionGrid collections={byState} counts={counts} />
            </div>
          )}

          {listed.length === 0 && (
            <p className="text-sm text-muted">
              No collection has enough products yet.{" "}
              <Link href="/marketplace" className="text-primary hover:underline">
                Browse the marketplace
              </Link>{" "}
              in the meantime.
            </p>
          )}
        </Container>
      </Section>
    </>
  );
}

function CollectionGrid({
  collections,
  counts,
}: {
  collections: typeof COLLECTIONS;
  counts: Record<string, number>;
}) {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {collections.map((collection) => (
        <li key={collection.slug}>
          <Link
            href={`/collections/${collection.slug}`}
            className="flex h-full flex-col gap-1.5 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary"
          >
            <span className="font-semibold text-ink">{collection.title}</span>
            <span className="line-clamp-2 text-sm text-body">{collection.intro}</span>
            <span className="mt-auto pt-2 text-xs text-muted">
              <Numeric>{counts[collection.slug] ?? 0}</Numeric> products
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
