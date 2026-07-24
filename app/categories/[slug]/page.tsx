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
import { FadeIn, FadeInStagger, FadeInItem } from "@/components/ui/motion";
import { ProductCard, type ProductCardProduct } from "@/components/products/product-card";
import { CATEGORIES, categoryFromSlug } from "@/lib/constants";
import {
  getProductsByCategory,
  getCategoryCounts,
  getUpvotedProductIds,
} from "@/services/products";

export function generateStaticParams() {
  return CATEGORIES.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const category = categoryFromSlug(slug);
  if (!category) return { title: "Category not found" };
  return { title: category.name, description: category.blurb };
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
  const [products, counts] = await Promise.all([
    getProductsByCategory(category.name, 9),
    getCategoryCounts(),
  ]);
  const count = counts[category.name] ?? 0;
  const upvotedIds = await getUpvotedProductIds(
    userId,
    products.map((p) => p.id),
  );

  const Icon = category.icon;
  const marketplaceHref = `/marketplace?category=${encodeURIComponent(category.name)}`;

  return (
    <>
      <Section className="border-b border-border py-14 md:py-20">
        <Container className="flex flex-col gap-6">
          <FadeIn className="flex flex-col gap-5">
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
          </FadeIn>
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
            </>
          )}
        </Container>
      </Section>
    </>
  );
}
