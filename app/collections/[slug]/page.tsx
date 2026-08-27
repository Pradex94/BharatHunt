/* Design system: design.md — editorial hero + live product grid.
 *
 * The programmatic SEO route. Every page here is generated from
 * `lib/collections.ts` and filled from live data; nothing is hand-authored per
 * URL, and nothing is generated that the catalogue cannot fill.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { auth } from "@clerk/nextjs/server";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { Faq } from "@/components/seo/faq";
import { JsonLd } from "@/components/seo/json-ld";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Display, Lead, Numeric } from "@/components/ui/typography";
import { FadeInStagger, FadeInItem } from "@/components/ui/motion";
import { ProductCard } from "@/components/products/product-card";
import {
  collectionBySlug,
  COLLECTIONS,
  MIN_PRODUCTS_TO_INDEX,
  RANKING_NOTE,
  type Collection,
} from "@/lib/collections";
import { itemListSchema } from "@/lib/seo";
import { getCollectionProducts, getUpvotedProductIds } from "@/services/products";

// Upvote state is per-user (Clerk), so this can never be a static page.
export const dynamic = "force-dynamic";

/** How many products a collection page lists before pointing at the marketplace. */
const PAGE_LIMIT = 24;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const collection = collectionBySlug(slug);
  if (!collection) return { title: "Collection not found" };

  const { total } = await getCollectionProducts(collection.filter, PAGE_LIMIT);

  return {
    title: collection.metaTitle,
    description: collection.metaDescription,
    alternates: { canonical: `/collections/${collection.slug}` },
    openGraph: {
      title: collection.metaTitle,
      description: collection.metaDescription,
      url: `/collections/${collection.slug}`,
      type: "website",
    },
    /*
     * The quality gate. A collection under the threshold is a real page that
     * real links may point at, so it stays reachable and keeps `follow` — it
     * simply does not claim a place in the index until the catalogue fills it.
     * The sitemap applies the same rule, so the two can never contradict.
     */
    ...(total >= MIN_PRODUCTS_TO_INDEX ? {} : { robots: { index: false, follow: true } }),
  };
}

/**
 * Questions this page can answer from its own data.
 *
 * Written per collection rather than templated across all of them, and every
 * answer is a fact the page already states in visible text — the count in the
 * grid, the ranking rule under the heading, the pricing definition in the intro.
 * Nothing here exists to manufacture a rich result.
 */
function faqsFor(collection: Collection, total: number) {
  const faqs: { question: string; answer: string }[] = [];
  const { pricing, category, tag, launchState } = collection.filter;
  const subject = collection.title.toLowerCase();

  faqs.push({
    question: `How many ${subject} are listed on Bharat Hunt?`,
    answer: `${total} — every one submitted by its maker and reviewed by a person before it went live. The list updates as new products are approved.`,
  });

  if (pricing === "free") {
    faqs.push({
      question: `Are these ${subject} completely free?`,
      answer:
        "Each maker sets their own pricing, and this page lists only the products they marked as free to use. Products with a free tier and paid upgrades are listed separately as freemium, so a trial that expires into a paywall will not appear here. Pricing lives on each product's own site and can change, so check there before committing.",
    });
  }
  if (pricing === "freemium") {
    faqs.push({
      question: "What does freemium mean here?",
      answer:
        "The product can be used at no cost with limits the maker sets, and paid plans lift those limits. What the free tier includes differs from product to product, so it is worth reading each one's own pricing page.",
    });
  }
  if (pricing === "paid") {
    faqs.push({
      question: "Why are prices not shown on this page?",
      answer:
        "Bharat Hunt does not store product pricing, so restating it here would mean publishing a number that could go stale the day a maker changes it. Each card links to the product's own site, where the current price is.",
    });
  }
  if (tag) {
    faqs.push({
      question: `How does a product end up on this ${subject} page?`,
      answer: `Makers tag their own launches when they submit them, and this page collects every published product tagged "${tag}". Because it follows the tag rather than the category, it spans sections a single category page cannot.`,
    });
  }

  if (launchState) {
    faqs.push({
      question: `How do you know these products are from ${collection.title.replace("Products Made in ", "")}?`,
      answer:
        "The maker tells us. When a product is submitted, the launch location is a field the maker fills in and confirms — we prefill a suggestion from the request's region, but nothing is stored unless they accept or correct it, and the visitor's IP address is never kept.",
    });
  }

  faqs.push({
    question: "How is this list ordered?",
    answer: `${RANKING_NOTE} Bharat Hunt has no star ratings or reviews, so nothing on this page is ranked by quality — upvotes measure how many people in the community backed a launch, not how good the product is.`,
  });

  if (category) {
    faqs.push({
      question: `Can I list my own ${category.toLowerCase()} product?`,
      answer:
        "Yes. Submitting is free and takes a few minutes; a person reviews every launch before it goes live, usually within a day.",
    });
  }

  return faqs;
}

export default async function CollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const collection = collectionBySlug(slug);
  if (!collection) notFound();

  const { products, total } = await getCollectionProducts(collection.filter, PAGE_LIMIT);

  // A collection the catalogue cannot fill is not a page. Rendering an empty
  // grid under a confident heading is the doorway page this system exists to
  // avoid, and 404 is the honest answer until a product lands in it.
  if (products.length === 0) notFound();

  const { userId } = await auth();
  const upvotedIds = await getUpvotedProductIds(
    userId,
    products.map((product) => product.id),
  );

  const crumbs = [
    { name: "Home", path: "/" },
    { name: "Collections", path: "/collections" },
    ...(collection.filter.category ? [collection.parent] : []),
    { name: collection.title, path: `/collections/${collection.slug}` },
  ];

  const related = collection.related
    .map((relatedSlug) => COLLECTIONS.find((entry) => entry.slug === relatedSlug))
    .filter((entry): entry is Collection => Boolean(entry))
    .slice(0, 6);

  const marketplaceHref = collection.filter.category
    ? `/marketplace?category=${encodeURIComponent(collection.filter.category)}`
    : "/marketplace";

  return (
    <>
      {/* Only the products actually rendered above — never the full total. */}
      <JsonLd
        data={itemListSchema(products, {
          name: collection.title,
          path: `/collections/${collection.slug}`,
        })}
      />

      <Section className="border-b border-border py-12 md:py-16">
        <Container className="flex flex-col gap-5">
          <Breadcrumbs items={crumbs} />
          {/* Painted, not faded in: this header is the LCP element on this
              route. See the note in components/ui/motion.tsx. */}
          <div className="flex flex-col gap-4">
            <Display className="max-w-3xl">{collection.title}</Display>
            <Lead className="max-w-2xl">{collection.intro}</Lead>
            <p className="text-sm text-muted">
              <Numeric>{total}</Numeric> {total === 1 ? "product" : "products"} · {RANKING_NOTE}
            </p>
          </div>
        </Container>
      </Section>

      <Section className="py-12 md:py-16">
        <Container className="flex flex-col gap-10">
          <FadeInStagger className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <FadeInItem key={product.id}>
                <ProductCard
                  product={product}
                  isUpvoted={upvotedIds.has(product.id)}
                  isLoggedIn={Boolean(userId)}
                  headingLevel="h3"
                />
              </FadeInItem>
            ))}
          </FadeInStagger>

          {total > products.length && (
            <p className="text-sm text-body">
              Showing {products.length} of {total}.{" "}
              <Link href={marketplaceHref} className="font-medium text-primary hover:underline">
                Browse the rest in the marketplace
              </Link>
              .
            </p>
          )}

          {/* Internal linking: up to the parent, sideways to siblings. */}
          <nav aria-label="Related collections" className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-ink">Keep exploring</h2>
            <div className="flex flex-wrap gap-2">
              <Link
                href={collection.parent.path}
                className="rounded-full border border-border bg-card px-3.5 py-1.5 text-sm text-body transition-colors hover:border-primary hover:text-primary"
              >
                {collection.parent.name}
              </Link>
              {related.map((entry) => (
                <Link
                  key={entry.slug}
                  href={`/collections/${entry.slug}`}
                  className="rounded-full border border-border bg-card px-3.5 py-1.5 text-sm text-body transition-colors hover:border-primary hover:text-primary"
                >
                  {entry.title}
                </Link>
              ))}
              <Link
                href="/collections"
                className="inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-sm font-medium text-primary hover:underline"
              >
                All collections <ArrowRight size={14} />
              </Link>
            </div>
          </nav>

          <Faq items={faqsFor(collection, total)} className="max-w-3xl" />
        </Container>
      </Section>
    </>
  );
}
