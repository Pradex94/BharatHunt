/* Design system: design.md · Product Intelligence — a curated comparison page.
 * Exists only for pairs that qualify (lib/intelligence/compare-pairs.ts):
 * genuinely similar, same job, both listings substantial. Never ranks.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect, redirect } from "next/navigation";

import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { JsonLd } from "@/components/seo/json-ld";
import { Container } from "@/components/ui/container";
import { Display, Lead } from "@/components/ui/typography";
import { buttonVariants } from "@/components/ui/button";
import { ShareMenu } from "@/components/products/share-menu";
import { SaveButton } from "@/components/discovery/save-button";
import { CompareButton } from "@/components/discovery/compare-button";
import { CompareTable, ComparisonLinks } from "@/components/discovery/compare-table";
import { compareHref } from "@/lib/compare-links";
import { pairSlug, pairSplits } from "@/lib/intelligence/compare-pairs";
import { describePair } from "@/lib/intelligence/compare";
import { absoluteUrl, itemListSchema } from "@/lib/seo";
import { getComparePairs } from "@/services/compare-pairs";
import { getProductsBySlugs } from "@/services/intelligence";

// Public data only (anon client), identical for every visitor: rendered on
// first request, then served static and refreshed hourly with the pair list.
export const revalidate = 3600;

export function generateStaticParams() {
  return [];
}

type Params = Promise<{ pair: string }>;

async function resolve(slug: string) {
  const pairs = await getComparePairs();
  const pair = pairs.find((candidate) => candidate.slug === slug);
  if (!pair) return { pairs, pair: null, products: [] };
  const products = await getProductsBySlugs([pair.a.slug, pair.b.slug]);
  return { pairs, pair, products };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { pair: slug } = await params;
  const { pair, products } = await resolve(slug);
  if (!pair || products.length !== 2) return { title: "Compare products", robots: { index: false, follow: true } };

  const [a, b] = products;
  const title = `${a.name} vs ${b.name}: pricing, features and differences`;
  const description = describePair(a, b, pair.sharedConcepts).slice(0, 158);
  return {
    title: { absolute: `${title.length > 52 ? `${a.name} vs ${b.name}` : title} | Bharat Hunt` },
    description,
    alternates: { canonical: pair.path },
    openGraph: { title: `${a.name} vs ${b.name}`, description, url: pair.path, type: "website" },
    twitter: { card: "summary_large_image", title: `${a.name} vs ${b.name}`, description },
  };
}

export default async function ComparePairPage({ params }: { params: Params }) {
  const { pair: slug } = await params;
  const { pairs, pair, products } = await resolve(slug);

  if (!pair || products.length !== 2) {
    // b-vs-a for a curated a-vs-b: one URL per comparison.
    for (const [first, second] of pairSplits(slug)) {
      const canonical = pairs.find((candidate) => candidate.slug === pairSlug(first, second));
      if (canonical) permanentRedirect(canonical.path);
    }
    // A real pair that does not qualify for its own page: the working tool,
    // which is noindex, rather than a thin indexable page.
    for (const [first, second] of pairSplits(slug)) {
      const found = await getProductsBySlugs([first, second]);
      if (found.length === 2) redirect(compareHref([first, second]));
    }
    notFound();
  }

  const [a, b] = products;
  const related = pairs
    .filter((other) => other.slug !== pair.slug && [a.id, b.id].some((id) => other.a.id === id || other.b.id === id))
    .slice(0, 8);

  return (
    <Container className="flex flex-col gap-8 py-10 md:py-14">
      <JsonLd data={itemListSchema([a, b], { name: `${a.name} vs ${b.name}`, path: pair.path })} />
      <Breadcrumbs
        items={[
          { name: "Home", path: "/" },
          { name: "Compare", path: "/compare" },
          { name: `${a.name} vs ${b.name}`, path: pair.path },
        ]}
      />

      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <Display className="text-3xl break-words sm:text-4xl">
            {a.name} vs {b.name}
          </Display>
          <ShareMenu url={absoluteUrl(pair.path)} name={`${a.name} vs ${b.name}`} tagline="Compared side by side on Bharat Hunt" />
        </div>
        <Lead className="max-w-3xl">{describePair(a, b, pair.sharedConcepts)}</Lead>
      </div>

      <CompareTable products={products} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {products.map((product) => (
          <div key={product.id} className="flex items-center gap-2 rounded-xl border border-border bg-card p-4">
            <Link href={`/products/${product.slug}`} className="min-w-0 flex-1 truncate font-semibold text-ink hover:text-primary">
              More about {product.name} &rarr;
            </Link>
            <SaveButton productId={product.id} productName={product.name} />
            <CompareButton item={{ id: product.id, slug: product.slug, name: product.name, logo: product.hero_image_url }} />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <Link href={compareHref([a.slug, b.slug])} className={buttonVariants({ variant: "outline", size: "sm" })}>
          Add another product to this comparison
        </Link>
        <Link href="/discover" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Not sure either fits? Describe what you need
        </Link>
      </div>

      {related.length > 0 && (
        <section aria-labelledby="related-comparisons" className="flex flex-col gap-3 border-t border-border pt-8">
          <h2 id="related-comparisons" className="font-sans text-lg font-semibold tracking-normal text-ink">
            Related comparisons
          </h2>
          <ComparisonLinks pairs={related} />
        </section>
      )}
    </Container>
  );
}
