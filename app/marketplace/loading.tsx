import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductListSkeleton } from "@/components/products/product-card-skeleton";

/**
 * Marketplace loading state.
 *
 * Mirrors app/marketplace/page.tsx's structure exactly: the same
 * `lg:grid-cols-[240px_1fr]` shell, the sidebar column, the sticky toolbar and
 * a single-column card list. The previous version rendered a 3-column card
 * grid with no sidebar, so the real page reflowed the entire viewport the
 * moment it arrived — the skeleton was the CLS.
 */
export default function MarketplaceLoading() {
  return (
    <Container className="grid grid-cols-1 gap-10 py-10 lg:grid-cols-[240px_1fr] lg:items-start">
      {/* Sidebar — hidden below lg, exactly as the real one is. */}
      <aside className="hidden lg:flex lg:flex-col lg:gap-7">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-3 w-20" />
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full rounded-lg" />
          ))}
        </div>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-3 w-16" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-5 w-28" />
          ))}
        </div>
        <Skeleton className="h-36 w-full rounded-lg" />
      </aside>

      <div className="flex flex-col gap-5">
        {/* h1: text-3xl sm:text-4xl */}
        <Skeleton className="h-9 w-64 sm:h-10" />

        {/* Toolbar: search on its own row below sm, then pills + filters. */}
        <div className="flex flex-col gap-3 border-b border-border py-3 sm:flex-row sm:items-center">
          <Skeleton className="h-11 flex-1 rounded-md" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-10 w-56 rounded-md" />
            <Skeleton className="h-10 w-24 shrink-0 rounded-md lg:hidden" />
          </div>
        </div>

        {/* "N products" count line */}
        <Skeleton className="h-4 w-28" />

        <ProductListSkeleton count={8} />
      </div>
    </Container>
  );
}
