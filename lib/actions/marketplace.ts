"use server";

import { auth } from "@clerk/nextjs/server";
import { getProducts, getUpvotedProductIds, type GetProductsParams } from "@/services/products";
import type { ProductCardProduct } from "@/components/products/product-card";

export type LoadMoreProductsResult = {
  products: ProductCardProduct[];
  upvotedIds: string[];
  hasMore: boolean;
};

/** Fetches one more page of the marketplace list for client-side accumulation. */
export async function loadMoreProducts(params: GetProductsParams): Promise<LoadMoreProductsResult> {
  const { userId } = await auth();
  const { products, totalCount, page, pageSize } = await getProducts(params);
  const upvotedIds = await getUpvotedProductIds(
    userId,
    products.map((product) => product.id),
  );

  return {
    products,
    upvotedIds: [...upvotedIds],
    hasMore: page * pageSize < totalCount,
  };
}
