/* Design system: design.md · Product Intelligence — the visitor's saved shortlist. */

import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";

import { Container } from "@/components/ui/container";
import { Numeric } from "@/components/ui/typography";
import { ProductCard } from "@/components/products/product-card";
import { LocalSavedList } from "@/components/discovery/local-saved-list";
import { SavedEmptyState } from "@/components/discovery/saved-empty-state";
import { getSavedProducts } from "@/services/intelligence";
import { getMyLists } from "@/services/lists";
import { CreateListForm } from "@/components/discovery/list-forms";
import { Globe, Lock } from "lucide-react";
import { getUpvotedProductIds } from "@/services/products";

/** Personal, so never indexed and never cached. */
export const metadata: Metadata = {
  title: "Saved products",
  description: "Your saved shortlist of products on Bharat Hunt.",
  alternates: { canonical: "/saved" },
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function SavedPage() {
  const { userId } = await auth();
  const [products, lists] = userId
    ? await Promise.all([getSavedProducts(userId), getMyLists(userId)])
    : [null, []];
  const upvoted = userId && products
    ? await getUpvotedProductIds(userId, products.map((product) => product.id))
    : new Set<string>();

  return (
    <Container className="flex max-w-3xl flex-col gap-6 py-10 md:py-14">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl sm:text-4xl">Saved products</h1>
        {userId ? (
          <p className="text-sm text-muted">
            <Numeric>{products?.length ?? 0}</Numeric> saved to your account.
          </p>
        ) : (
          <p className="text-sm text-muted">
            Saved in this browser.{" "}
            <Link href="/login?redirect_url=/saved" className="font-medium text-primary hover:underline">
              Sign in
            </Link>{" "}
            to keep them on every device — they move to your account automatically.
          </p>
        )}
      </div>

      {products === null ? (
        <LocalSavedList />
      ) : products.length === 0 ? (
        <SavedEmptyState />
      ) : (
        <div className="flex flex-col gap-3">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} isUpvoted={upvoted.has(product.id)} isLoggedIn />
          ))}
        </div>
      )}

      {/* Collections: named, optionally public lists. Signed-in only — a list
          is something you share, so it needs an owner. */}
      <section id="collections" aria-labelledby="collections-heading" className="flex scroll-mt-24 flex-col gap-4 border-t border-border pt-8">
        <div className="flex flex-col gap-1">
          <h2 id="collections-heading" className="font-sans text-2xl font-bold tracking-normal text-ink">
            Collections
          </h2>
          <p className="text-sm text-muted">
            Group products into named lists — your AI stack, tools to try — and share the public ones.
          </p>
        </div>
        {userId ? (
          <>
            {lists.length > 0 && (
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {lists.map((list) => (
                  <li key={list.id}>
                    <Link
                      href={`/lists/${list.slug}`}
                      className="flex h-full flex-col gap-1 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
                    >
                      <span className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate font-semibold text-ink">{list.title}</span>
                        {list.isPublic ? (
                          <Globe className="size-3.5 text-primary" aria-label="Public" />
                        ) : (
                          <Lock className="size-3.5 text-muted" aria-label="Private" />
                        )}
                      </span>
                      {list.description && <span className="line-clamp-2 text-xs text-body">{list.description}</span>}
                      <span className="mt-auto text-xs text-muted">
                        <Numeric>{list.count}</Numeric> {list.count === 1 ? "product" : "products"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <CreateListForm />
          </>
        ) : (
          <p className="rounded-lg bg-secondary-bg px-4 py-3 text-sm text-body">
            <Link href="/login?redirect_url=/saved" className="font-medium text-primary hover:underline">
              Sign in
            </Link>{" "}
            to create collections.
          </p>
        )}
      </section>
    </Container>
  );
}
