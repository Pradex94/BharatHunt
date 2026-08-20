"use client";

import { useState, useTransition } from "react";

import { ProductCard, type ProductCardProduct } from "@/components/products/product-card";
import { loadMoreProducts } from "@/lib/actions/marketplace";
import type { GetProductsParams } from "@/services/products";

export function ProductList({
  initialProducts,
  initialUpvotedIds,
  initialHasMore,
  initialPage = 1,
  filters,
  isLoggedIn,
}: {
  initialProducts: ProductCardProduct[];
  initialUpvotedIds: string[];
  initialHasMore: boolean;
  /**
   * The page the server actually rendered. Load more continues from here, so
   * arriving on `/marketplace?page=3` and pressing it fetches page 4 rather
   * than page 2 -- which would have shown products already on screen and
   * skipped the rest entirely.
   */
  initialPage?: number;
  filters: Omit<GetProductsParams, "page">;
  isLoggedIn: boolean;
}) {
  const [products, setProducts] = useState(initialProducts);
  const [upvotedIds, setUpvotedIds] = useState(new Set(initialUpvotedIds));
  const [page, setPage] = useState(initialPage);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isPending, startTransition] = useTransition();

  function handleLoadMore() {
    startTransition(async () => {
      const nextPage = page + 1;
      const result = await loadMoreProducts({ ...filters, page: nextPage });
      setProducts((prev) => [...prev, ...result.products]);
      setUpvotedIds((prev) => new Set([...prev, ...result.upvotedIds]));
      setPage(nextPage);
      setHasMore(result.hasMore);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3">
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            isUpvoted={upvotedIds.has(product.id)}
            isLoggedIn={isLoggedIn}
          />
        ))}
      </div>

      {hasMore && (
        <div className="pt-2 text-center">
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={isPending}
            className="inline-block rounded-md border border-border bg-background px-6 py-2.5 text-sm font-medium text-ink transition-colors duration-150 outline-none hover:bg-secondary-bg focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-60"
          >
            {isPending ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
