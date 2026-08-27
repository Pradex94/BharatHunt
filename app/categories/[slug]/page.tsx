/* Design system: design.md (Claude.com editorial)
 * Category detail — editorial hero + live product grid for one real category.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { auth } from "@clerk/nextjs/server";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Display, Lead, Numeric } from "@/components/ui/typography";
import { buttonVariants } from "@/components/ui/button";
import { FadeInStagger, FadeInItem } from "@/components/ui/motion";
import { ProductCard, type ProductCardProduct } from "@/components/products/product-card";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { JsonLd } from "@/components/seo/json-ld";
import { collectionsForCategory, MIN_PRODUCTS_TO_INDEX } from "@/lib/collections";
import { categoryFromSlug } from "@/lib/constants";
import { itemListSchema } from "@/lib/seo";
import {
  getProductsByCategory,
  getCategoryCounts,
  getCollectionCounts,
  getUpvotedProductIds,
} from "@/services/products";

// Renders per-user (upvote state) via Clerk auth → dynamic, not prebuilt.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const category = categoryFromSlug(slug);
  if (!category) return { title: "Category not found" };

  // A category with nothing in it is an empty page — reachable, but not worth
  // indexing. It becomes indexable on its own the moment a product lands in it.
  const counts = await getCategoryCounts();
  const count = counts[category.name] ?? 0;

  return {
    /*
     * "Best" was a claim nothing here can support. There is no rating or review
     * data on Bharat Hunt — `products.avg_rating` is unpopulated for every
     * published row and no reviews table exists — so a title promising the best
     * of a category described a ranking that does not exist. The page orders by
     * trend score, which is activity, not quality.
     *
     * "Productivity in India" is missing a noun; "Developer Tools" already has
     * one, so "Products" is only added where the name needs it.
     */
    title: `${category.name}${/tools|products/i.test(category.name) ? "" : " Products"} in India`,
    description:
      count > 0
        ? `${count} ${category.name.toLowerCase()} ${count === 1 ? "product" : "products"} built by Indian makers. ${category.blurb}`
        : category.blurb,
    alternates: { canonical: `/categories/${slug}` },
    ...(count > 0 ? {} : { robots: { index: false, follow: true } }),
  };
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const category = categoryFromSlug(slug);
  if (!category) notFound();

  const { userId } = await auth();

  // The collections belonging to this category share one facet read with the
  // rest of the page rather than issuing a count query per collection.
  const siblingCollections = collectionsForCategory(category.name);
  const [products, counts, collectionCounts] = await Promise.all([
    getProductsByCategory(category.name, 9),
    getCategoryCounts(),
    getCollectionCounts(
      siblingCollections.map((collection) => ({ slug: collection.slug, ...collection.filter })),
    ),
  ]);
  const count = counts[category.name] ?? 0;
  const upvotedIds = await getUpvotedProductIds(
    userId,
    products.map((p) => p.id),
  );

  const Icon = category.icon;
  const marketplaceHref = `/marketplace?category=${encodeURIComponent(category.name)}`;

  // Only collections that clear their own index threshold: linking to a page
  // that marks itself noindex spends crawl budget on a dead end.
  const collections = siblingCollections.filter(
    (collection) => (collectionCounts[collection.slug] ?? 0) >= MIN_PRODUCTS_TO_INDEX,
  );

  return (
    <>
      {/* Describes exactly the products rendered below, never the full count. */}
      {products.length > 0 && (
        <JsonLd
          data={itemListSchema(products, {
            name: category.name,
            path: `/categories/${slug}`,
          })}
        />
      )}

      <Section className="border-b border-border py-14 md:py-20">
        <Container className="flex flex-col gap-6">
          <Breadcrumbs
            items={[
              { name: "Home", path: "/" },
              { name: "Categories", path: "/categories" },
              { name: category.name, path: `/categories/${slug}` },
            ]}
          />
          {/* Painted, not faded in: this header is the LCP element on this
              route. See the note in components/ui/motion.tsx. */}
          <div className="flex flex-col gap-5">
            <Link
              href="/categories"
              className="flex w-fit items-center gap-1.5 text-sm font-medium text-muted transition-colors duration-200 hover:text-ink"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              All categories
            </Link>
            <div className="flex items-start gap-4">
              <span className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-6" aria-hidden="true" />
              </span>
              <div className="flex flex-col gap-2">
                <Display className="text-4xl sm:text-5xl">{category.name}</Display>
                <p className="text-sm text-muted">
                  <Numeric>{count}</Numeric> {count === 1 ? "product" : "products"} in this category
                </p>
              </div>
            </div>
            <Lead className="max-w-2xl">{category.blurb}</Lead>
          </div>
        </Container>
      </Section>

      <Section className="py-14 md:py-20">
        <Container className="flex flex-col gap-8">
          {products.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center">
              <p className="text-sm text-body">
                No products in {category.name} yet.{" "}
                <Link
                  href="/submit"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  Be the first to launch one →
                </Link>
              </p>
            </div>
          ) : (
            <>
              <FadeInStagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {products.map((product) => (
                  <FadeInItem key={product.id}>
                    <ProductCard
                      product={product as ProductCardProduct}
                      isUpvoted={upvotedIds.has(product.id)}
                      isLoggedIn={Boolean(userId)}
                      headingLevel="h3"
                    />
                  </FadeInItem>
                ))}
              </FadeInStagger>

              {count > products.length && (
                <div>
                  <Link
                    href={marketplaceHref}
                    className={buttonVariants({ variant: "outline" })}
                  >
                    See all {count} in {category.name}
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </div>
              )}

              {/* Down into the narrower slices of this category. */}
              {collections.length > 0 && (
                <nav aria-label="Collections in this category" className="flex flex-col gap-3">
                  <h2 className="text-sm font-semibold text-ink">Narrow it down</h2>
                  <div className="flex flex-wrap gap-2">
                    {collections.map((collection) => (
                      <Link
                        key={collection.slug}
                        href={`/collections/${collection.slug}`}
                        className="rounded-full border border-border bg-card px-3.5 py-1.5 text-sm text-body transition-colors hover:border-primary hover:text-primary"
                      >
                        {collection.title}
                        <span className="ml-1.5 text-xs text-muted">
                          {collectionCounts[collection.slug] ?? 0}
                        </span>
                      </Link>
                    ))}
                  </div>
                </nav>
              )}
            </>
          )}
        </Container>
      </Section>
    </>
  );
}
