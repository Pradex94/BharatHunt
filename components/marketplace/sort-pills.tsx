"use client";

import { useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";
import { useUpdateSearchParams } from "@/hooks/use-update-search-params";
import { PRODUCT_SORTS, type ProductSort } from "@/lib/constants";

const SORT_LABELS: Record<ProductSort, string> = {
  trending: "Trending",
  newest: "Newest",
  "top-rated": "Top rated",
  "price-low": "Price: Low to High",
  "price-high": "Price: High to Low",
  relevance: "Best match",
};

/** The compact segmented control only surfaces the three sorts the mockup
 * shows; price sorting stays reachable via the URL (?sort=price-low) but
 * isn't exposed here to keep the control from overflowing. */
const VISIBLE_SORTS: ProductSort[] = ["trending", "newest", "top-rated"];

export function SortPills() {
  const searchParams = useSearchParams();
  const updateSearchParams = useUpdateSearchParams();

  const sortParam = searchParams.get("sort");
  const searching = Boolean(searchParams.get("q")?.trim());

  // With a query and no explicit choice, results are ranked by relevance —
  // mirror that here so the highlighted pill matches what is on screen.
  const sort: ProductSort = (PRODUCT_SORTS as readonly string[]).includes(sortParam ?? "")
    ? (sortParam as ProductSort)
    : searching
      ? "relevance"
      : "trending";

  // "Best match" is meaningless without a query, so it appears only while one
  // is active — and then leads, because it is the default.
  const options: ProductSort[] = searching ? ["relevance", ...VISIBLE_SORTS] : VISIBLE_SORTS;

  return (
    <div className="flex w-max gap-0.5 rounded-md border border-border bg-background p-1">
      {options.map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={sort === value}
          onClick={() =>
            updateSearchParams(
              // Clearing the param restores the contextual default, so neither
              // default ends up pinned in the URL.
              { sort: value === (searching ? "relevance" : "trending") ? null : value },
              { resetPage: true },
            )
          }
          className={cn(
            "rounded-sm px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
            sort === value
              ? "bg-surface-card text-ink"
              : "text-muted hover:text-ink",
          )}
        >
          {SORT_LABELS[value]}
        </button>
      ))}
    </div>
  );
}
