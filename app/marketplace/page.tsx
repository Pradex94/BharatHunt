/* Hallmark · macrostructure: Index-First (13) · genre: modern-minimal
 * design-system: design.md · designed-as-app
 * ui: ported from Claude Design mockup "Marketplace.dc.html" (project fe806209)
 */

import { auth } from "@clerk/nextjs/server";

import { Container } from "@/components/ui/container";
import { Numeric } from "@/components/ui/typography";
import { CategorySidebar } from "@/components/marketplace/category-sidebar";
import { MobileFilters } from "@/components/marketplace/mobile-filters";
import { SortPills } from "@/components/marketplace/sort-pills";
import { SearchInput } from "@/components/marketplace/search-input";
import { ProductList } from "@/components/marketplace/product-list";
import {
  getCategoryCounts,
  getProducts,
  getUpvotedProductIds,
  PRODUCTS_PAGE_SIZE,
} from "@/services/products";
import { PRODUCT_CATEGORIES, PRODUCT_SORTS, type ProductSort } from "@/lib/constants";

type MarketplaceSearchParams = Promise<{
  category?: string;
  sort?: string;
  q?: string;
  pricing?: string;
}>;

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: MarketplaceSearchParams;
}) {
  const params = await searchParams;
  const { userId } = await auth();

  const category =
    params.category && (PRODUCT_CATEGORIES as readonly string[]).includes(params.category)
      ? params.category
      : undefined;
  const sort: ProductSort = (PRODUCT_SORTS as readonly string[]).includes(params.sort ?? "")
    ? (params.sort as ProductSort)
    : "trending";
  const q = params.q?.trim() || undefined;
  const pricing = params.pricing ? params.pricing.split(",").filter(Boolean) : undefined;

  const filters = { category, sort, q, pricing };

  const [{ products, totalCount }, categoryCounts] = await Promise.all([
    getProducts({ ...filters, page: 1 }),
    getCategoryCounts(),
  ]);

  const upvotedIds = await getUpvotedProductIds(
    userId,
    products.map((product) => product.id),
  );

  const totalCategoryCount = Object.values(categoryCounts).reduce((sum, n) => sum + n, 0);
  const hasMore = totalCount > PRODUCTS_PAGE_SIZE;

  return (
    <Container className="grid grid-cols-1 gap-10 py-10 lg:grid-cols-[240px_1fr] lg:items-start">
      <aside className="hidden lg:sticky lg:top-24 lg:flex lg:flex-col">
        <CategorySidebar categoryCounts={categoryCounts} totalCount={totalCategoryCount} />
      </aside>

      <div className="flex flex-col gap-5">
        <h1 className="text-3xl sm:text-4xl">The marketplace</h1>

        {/* Sticky just under the sticky navbar (h-16 = 64px, z-40) so the
            search + sort controls stay reachable while the list scrolls.
            Opaque bg + padding lets product cards scroll cleanly underneath;
            the hairline marks the toolbar edge once it detaches. */}
        <div className="sticky top-16 z-30 flex flex-col gap-3 border-b border-border bg-background py-3 sm:flex-row sm:items-center">
          <SearchInput />
          <div className="flex items-center gap-2">
            <SortPills />
            <MobileFilters categoryCounts={categoryCounts} totalCount={totalCategoryCount} />
          </div>
        </div>

        <p className="text-sm text-muted">
          <Numeric>{totalCount}</Numeric> {totalCount === 1 ? "product" : "products"}
          {category ? ` in ${category}` : ""}
        </p>

        {products.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-card p-12 text-center text-sm text-muted">
            No products match your filters. Try clearing them.
          </p>
        ) : (
          <ProductList
            key={`${category ?? "all"}:${sort}:${q ?? ""}:${(pricing ?? []).join(",")}`}
            initialProducts={products}
            initialUpvotedIds={[...upvotedIds]}
            initialHasMore={hasMore}
            filters={filters}
            isLoggedIn={Boolean(userId)}
          />
        )}
      </div>
    </Container>
  );
}
