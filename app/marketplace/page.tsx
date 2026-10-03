/* Hallmark · macrostructure: Index-First (13) · genre: modern-minimal
 * design-system: design.md · designed-as-app
 * ui: ported from Claude Design mockup "Marketplace.dc.html" (project fe806209)
 */

import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { Target } from "lucide-react";

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
  suggestProductName,
  getUpvotedProductIds,
  PRODUCTS_PAGE_SIZE,
} from "@/services/products";
import {
  LAUNCH_WINDOW_DAYS,
  parseDiscoveryFilters,
  PRODUCT_CATEGORIES,
  PRODUCT_SORTS,
  type ProductSort,
} from "@/lib/constants";
import { recordSearch } from "@/lib/search-analytics";
import { getConceptRelatedProducts } from "@/services/intelligence";
import { conceptLabel } from "@/lib/intelligence/concepts";
import { ProductCard } from "@/components/products/product-card";
import { SignalClickArea } from "@/components/discovery/signals";

/** "video editing or AI video generation" — the concepts a query was read as. */
function conceptListPhrase(keys: string[]): string {
  const labels = keys.slice(0, 3).map(conceptLabel);
  return labels.length <= 1 ? (labels[0] ?? "this") : `${labels.slice(0, -1).join(", ")} or ${labels.at(-1)}`;
}

type MarketplaceSearchParams = Promise<{
  category?: string;
  sort?: string;
  q?: string;
  pricing?: string;
  page?: string;
  ai?: string;
  made_in?: string;
  launched?: string;
}>;

/** `?page=` as a positive integer; anything else is page 1. */
function pageFrom(raw: string | undefined): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 1 ? parsed : 1;
}

/**
 * The canonical has to be page-aware or pagination is self-defeating: a static
 * `/marketplace` on every page tells Google that page 2 is a duplicate of page
 * 1, so it drops page 2 and never follows the twelve product links only page 2
 * carries. Page 2+ therefore points at itself.
 *
 * Filtered views still collapse to `/marketplace`. A category or pricing filter
 * is a re-slice of the same catalogue rather than new content, and those
 * combinations multiply into far more URLs than they are worth indexing.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: MarketplaceSearchParams;
}): Promise<Metadata> {
  const params = await searchParams;
  const page = pageFrom(params.page);
  const filtered = Boolean(
    params.category || params.pricing || params.q || params.ai || params.made_in || params.launched,
  );

  return {
    title: page > 1 ? `Marketplace — page ${page}` : "Marketplace",
    description:
      "Browse and discover the latest software, tools, and lifetime deals launched by founders on Bharat Hunt. Filter by category, pricing, and popularity.",
    alternates: {
      canonical: page > 1 && !filtered ? `/marketplace?page=${page}` : "/marketplace",
    },
    /*
     * A search result is not a page. `?q=` can produce an unbounded number of
     * URLs whose content is a re-slice of the catalogue, and a crawler that
     * finds one linked anywhere will happily generate the rest. The canonical
     * above already collapses them, but a canonical is a hint and `noindex` is
     * a directive — `follow` is kept so the product links on the page are still
     * worth something. Category and pricing filters keep the canonical-only
     * treatment: they are a bounded, finite set that collapses cleanly.
     */
    ...(params.q ? { robots: { index: false, follow: true } } : {}),
  };
}

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
  const q = params.q?.trim() || undefined;
  // Ranking by relevance is only meaningful with a query, and imposing
  // "trending" on a search is what made the old results feel arbitrary. An
  // explicit ?sort= still wins, so a deliberate choice is never overridden.
  const sort: ProductSort = (PRODUCT_SORTS as readonly string[]).includes(params.sort ?? "")
    ? (params.sort as ProductSort)
    : q
      ? "relevance"
      : "trending";
  const pricing = params.pricing ? params.pricing.split(",").filter(Boolean) : undefined;

  const discovery = parseDiscoveryFilters(params);
  const filters = {
    category,
    sort,
    q,
    pricing,
    ai: discovery.ai || undefined,
    madeInIndia: discovery.madeInIndia || undefined,
    launchedWithinDays: discovery.launched ? LAUNCH_WINDOW_DAYS[discovery.launched] : undefined,
  };
  // Previously hardcoded to 1, which made `?page=` inert: every paginated URL
  // rendered page 1, so the only product links a crawler could ever reach were
  // the first twelve. Everything past them sat in the sitemap with no link
  // pointing at it, which is exactly what Search Console reports as
  // "Discovered - currently not indexed".
  const page = pageFrom(params.page);

  // The concept-related block is fetched alongside the list, not after it:
  // over-fetch, then drop whatever the lexical results already show.
  const [{ products, totalCount }, categoryCounts, relatedPool] = await Promise.all([
    getProducts({ ...filters, page }),
    getCategoryCounts(),
    q && page === 1 ? getConceptRelatedProducts(q, [], 24) : Promise.resolve(null),
  ]);

  // Only ask for a spelling suggestion once the search has genuinely come up
  // empty — the normalised, token and fuzzy passes have all already run inside
  // search_products by this point.
  const didYouMean = q && products.length === 0 ? await suggestProductName(q) : null;

  // Logged after the response is flushed, so measuring a search never slows one
  // down. Records the term and the result count only — see lib/search-analytics.
  if (q) {
    after(() => recordSearch(q, totalCount));
  }

  // Search by meaning, on the first page only: listings whose *concepts*
  // answer the query ("AI video" → editors, generators, avatar tools), minus
  // anything the lexical search already returned. One cached read of the
  // precomputed index — no model, no per-product work. Empty before the
  // intelligence migration is applied, and the page reads as it always did.
  const shownIds = new Set(products.map((product) => product.id));
  const related = relatedPool
    ? {
        concepts: relatedPool.concepts,
        products: relatedPool.products
          .filter((product) => !shownIds.has(product.id))
          .slice(0, products.length === 0 ? 12 : 6),
      }
    : null;

  const upvotedIds = await getUpvotedProductIds(userId, [
    ...products.map((product) => product.id),
    ...(related?.products ?? []).map((product) => product.id),
  ]);

  const totalCategoryCount = Object.values(categoryCounts).reduce((sum, n) => sum + n, 0);
  const hasMore = totalCount > page * PRODUCTS_PAGE_SIZE;

  return (
    <Container className="grid grid-cols-1 gap-10 py-10 lg:grid-cols-[240px_1fr] lg:items-start">
      <aside className="hidden lg:sticky lg:top-24 lg:flex lg:flex-col">
        <CategorySidebar categoryCounts={categoryCounts} totalCount={totalCategoryCount} />
      </aside>

      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <h1 className="text-3xl sm:text-4xl">The marketplace</h1>
          {/* The entry to Product Match: for when you know the job, not the name. */}
          <Link
            href={q ? `/discover?q=${encodeURIComponent(q)}` : "/discover"}
            className="group inline-flex items-center gap-2 self-start rounded-lg border border-border bg-card px-3 py-2 text-sm text-body transition-colors hover:border-primary/40 sm:self-auto"
          >
            <Target className="size-4 text-primary" aria-hidden="true" />
            <span>
              Not sure what to search for? <span className="font-semibold text-ink group-hover:text-primary">Describe what you need</span>
            </span>
          </Link>
        </div>

        {/* Sticky just under the sticky navbar (h-16 = 64px, z-40) so the
            search + sort controls stay reachable while the list scrolls.
            Opaque bg + padding lets product cards scroll cleanly underneath;
            the hairline marks the toolbar edge once it detaches. */}
        <div className="sticky top-16 z-30 flex flex-col gap-3 border-b border-border bg-background py-3 sm:flex-row sm:items-center">
          <SearchInput />
          {/* The three sort pills alone are wider than a 375px phone, so the
              row scrolls horizontally and only the Filters button is pinned —
              nothing gets pushed off-screen and the page never side-scrolls. */}
          <div className="flex min-w-0 items-center gap-2">
            <div className="no-scrollbar -mx-1 min-w-0 flex-1 overflow-x-auto px-1 sm:mx-0 sm:flex-initial sm:px-0">
              <SortPills />
            </div>
            <MobileFilters categoryCounts={categoryCounts} totalCount={totalCategoryCount} />
          </div>
        </div>

        <p className="text-sm text-muted">
          <Numeric>{totalCount}</Numeric> {totalCount === 1 ? "product" : "products"}
          {category ? ` in ${category}` : ""}
        </p>

        {products.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center">
            {q ? (
              <>
                <p className="text-sm text-body">
                  No products found for{" "}
                  <span className="font-semibold text-ink">&ldquo;{q}&rdquo;</span>.
                </p>
                {didYouMean && (
                  <p className="mt-3 text-sm text-muted">
                    Did you mean{" "}
                    <Link
                      href={`/marketplace?q=${encodeURIComponent(didYouMean)}`}
                      className="font-semibold text-primary hover:underline"
                    >
                      {didYouMean}
                    </Link>
                    ?
                  </p>
                )}
                <p className="mt-3 text-sm text-muted">
                  <Link href="/marketplace" className="text-primary hover:underline">
                    Clear search
                  </Link>{" "}
                  to browse everything.
                </p>
              </>
            ) : (
              <p className="text-sm text-muted">
                No products match your filters. Try clearing them.
              </p>
            )}
          </div>
        ) : (
          <ProductList
            key={`${category ?? "all"}:${sort}:${q ?? ""}:${(pricing ?? []).join(",")}:${page}:${JSON.stringify(discovery)}`}
            initialProducts={products}
            initialPage={page}
            initialUpvotedIds={[...upvotedIds]}
            initialHasMore={hasMore}
            filters={filters}
            isLoggedIn={Boolean(userId)}
          />
        )}

        {related && related.products.length > 0 && (
          <section aria-labelledby="related-results" className="flex flex-col gap-3 border-t border-border pt-6">
            <div className="flex flex-col gap-1">
              <h2 id="related-results" className="font-sans text-lg font-semibold tracking-normal text-ink">
                {products.length === 0 ? "Products that do this" : "Related products"}
              </h2>
              <p className="text-sm text-muted">
                Listings that describe {conceptListPhrase(related.concepts)}, even without the exact words
                &ldquo;{q}&rdquo;. Matched on what each product says it does.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              {related.products.map((product) => (
                <SignalClickArea key={product.id} productId={product.id} event="search_click" surface="search-related">
                  <ProductCard product={product} isUpvoted={upvotedIds.has(product.id)} isLoggedIn={Boolean(userId)} />
                </SignalClickArea>
              ))}
            </div>
          </section>
        )}
      </div>
    </Container>
  );
}
