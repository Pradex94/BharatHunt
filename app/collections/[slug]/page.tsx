/* Design system: design.md (Claude.com editorial)
 * Collection detail — editorial intro + the live products its query resolves to.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { auth } from "@clerk/nextjs/server";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Display, Lead, Numeric } from "@/components/ui/typography";
import { FadeIn, FadeInStagger, FadeInItem } from "@/components/ui/motion";
import { ProductCard, type ProductCardProduct } from "@/components/products/product-card";
import { COLLECTIONS, collectionFromSlug } from "@/lib/collections";
import { slugForCategory } from "@/lib/constants";
import { getProducts, getUpvotedProductIds } from "@/services/products";

export function generateStaticParams() {
  return COLLECTIONS.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const collection = collectionFromSlug(slug);
  if (!collection) return { title: "Collection not found" };
  return { title: collection.title, description: collection.tagline };
}

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const collection = collectionFromSlug(slug);
  if (!collection) notFound();

  const { userId } = await auth();
  const { products, totalCount } = await getProducts({
    category: collection.query.category,
    pricing: collection.query.pricing,
    sort: collection.query.sort ?? "trending",
    page: 1,
  });
  const upvotedIds = await getUpvotedProductIds(
    userId,
    products.map((p) => p.id),
  );

  // Deep-link into the marketplace with the same filters this collection uses.
  const marketplaceParams = new URLSearchParams();
  if (collection.query.category) {
    marketplaceParams.set("category", collection.query.category);
  }
  if (collection.query.pricing?.length) {
    marketplaceParams.set("pricing", collection.query.pricing.join(","));
  }
  if (collection.query.sort && collection.query.sort !== "trending") {
    marketplaceParams.set("sort", collection.query.sort);
  }
  const marketplaceHref = marketplaceParams.toString()
    ? `/marketplace?${marketplaceParams.toString()}`
    : "/marketplace";

  const categorySlug = collection.query.category
    ? slugForCategory(collection.query.category)
    : undefined;

  return (
    <>
      <Section className="border-b border-border py-14 md:py-20">
        <Container className="flex max-w-3xl flex-col gap-5">
          <FadeIn className="flex flex-col gap-5">
            <Link
              href="/collections"
              className="flex w-fit items-center gap-1.5 text-sm font-medium text-muted transition-colors duration-200 hover:text-ink"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              All collections
            </Link>
            <Display className="text-balance">{collection.title}</Display>
            <Lead>{collection.intro}</Lead>
            <p className="text-sm text-muted">
              <Numeric>{totalCount}</Numeric> {totalCount === 1 ? "product" : "products"} in this
              collection
              {categorySlug ? (
                <>
                  {" · "}
                  <Link
                    href={`/categories/${categorySlug}`}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {collection.query.category}
                  </Link>
                </>
              ) : null}
            </p>
          </FadeIn>
        </Container>
      </Section>

      <Section className="py-14 md:py-20">
        <Container className="flex flex-col gap-8">
          {products.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center">
              <p className="text-sm text-body">
                Nothing here yet — this collection fills up as products launch.{" "}
                <Link
                  href="/marketplace"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  Browse the marketplace →
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

              {totalCount > products.length && (
                <div>
                  <Link
                    href={marketplaceHref}
                    className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                  >
                    See all {totalCount} products with these filters →
                  </Link>
                </div>
              )}
            </>
          )}
        </Container>
      </Section>
    </>
  );
}
