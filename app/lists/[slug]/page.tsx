/* Design system: design.md · Product Intelligence — a member's collection.
 * Public collections are shareable and, once they hold enough to be worth
 * reading, indexable. Private ones exist only for their owner (RLS).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { JsonLd } from "@/components/seo/json-ld";
import { Container } from "@/components/ui/container";
import { Numeric } from "@/components/ui/typography";
import { buttonVariants } from "@/components/ui/button";
import { ProductCard } from "@/components/products/product-card";
import { ShareMenu } from "@/components/products/share-menu";
import { ListOwnerControls, RemoveFromListButton } from "@/components/discovery/list-forms";
import { MIN_PRODUCTS_TO_INDEX_LIST } from "@/lib/lists";
import { absoluteUrl, itemListSchema } from "@/lib/seo";
import { getListBySlug } from "@/services/lists";
import { getUpvotedProductIds } from "@/services/products";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const list = await getListBySlug(slug);
  if (!list) return { title: "Collection not found", robots: { index: false, follow: false } };

  const description =
    list.description ??
    `${list.products.length} ${list.products.length === 1 ? "product" : "products"} collected by ${list.ownerName} on Bharat Hunt.`;
  // Private: never indexed. Public but thin: reachable, not indexed — the
  // same rule the programmatic collections and product pages use.
  const indexable = list.isPublic && list.products.length >= MIN_PRODUCTS_TO_INDEX_LIST;

  return {
    title: list.title,
    description,
    alternates: { canonical: `/lists/${list.slug}` },
    robots: indexable ? undefined : { index: false, follow: list.isPublic },
    openGraph: {
      title: `${list.title} · Bharat Hunt`,
      description,
      url: `/lists/${list.slug}`,
      type: "website",
    },
    twitter: { card: "summary_large_image", title: list.title, description },
  };
}

export default async function ListPage({ params }: { params: Params }) {
  const { slug } = await params;
  const [list, { userId }] = await Promise.all([getListBySlug(slug), auth()]);
  if (!list) notFound();

  const isOwner = userId === list.ownerId;
  const upvoted = await getUpvotedProductIds(userId, list.products.map((product) => product.id));
  const path = `/lists/${list.slug}`;

  return (
    <Container className="flex max-w-3xl flex-col gap-6 py-10 md:py-14">
      {list.isPublic && list.products.length > 0 && (
        <JsonLd data={itemListSchema(list.products, { name: list.title, path })} />
      )}
      <Breadcrumbs
        items={[
          { name: "Home", path: "/" },
          { name: isOwner ? "Saved" : "Marketplace", path: isOwner ? "/saved" : "/marketplace" },
          { name: list.title, path },
        ]}
      />

      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-3xl break-words sm:text-4xl">{list.title}</h1>
          {list.isPublic && (
            <ShareMenu url={absoluteUrl(path)} name={list.title} tagline={list.description ?? `A collection on Bharat Hunt`} />
          )}
        </div>
        {list.description && <p className="max-w-2xl text-base text-body">{list.description}</p>}
        <p className="text-sm text-muted">
          <Numeric>{list.products.length}</Numeric> {list.products.length === 1 ? "product" : "products"} · Collected by{" "}
          {list.ownerName}
        </p>
      </div>

      {isOwner && (
        <ListOwnerControls
          list={{ id: list.id, title: list.title, description: list.description, isPublic: list.isPublic }}
          shareUrl={absoluteUrl(path)}
        />
      )}

      {list.products.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center">
          <p className="text-base font-semibold text-ink">This collection is empty.</p>
          {isOwner && (
            <>
              <p className="max-w-sm text-sm text-body">
                Use <span className="font-medium text-ink">Collect</span> on any product page to add it here.
              </p>
              <Link href="/discover" className={buttonVariants({ size: "sm" })}>
                Find products
              </Link>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {list.products.map((product) => (
            <div key={product.id} className="flex flex-col gap-1">
              <ProductCard product={product} isUpvoted={upvoted.has(product.id)} isLoggedIn={Boolean(userId)} />
              {isOwner && (
                <div className="flex justify-end">
                  <RemoveFromListButton listId={list.id} productId={product.id} productName={product.name} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Container>
  );
}
