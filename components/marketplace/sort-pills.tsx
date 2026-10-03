"use client";

import { useSearchParams } from "next/navigation";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { useUpdateSearchParams } from "@/hooks/use-update-search-params";
import { BROWSE_ONLY_SORTS, PRODUCT_SORTS, type ProductSort } from "@/lib/constants";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const SORT_LABELS: Record<ProductSort, string> = {
  trending: "Trending",
  rising: "Rising",
  newest: "Newest",
  "top-rated": "Top rated",
  "most-viewed": "Most viewed",
  "most-saved": "Most saved",
  "most-discussed": "Most discussed",
  "most-compared": "Most compared",
  "price-low": "Price: Low to High",
  "price-high": "Price: High to Low",
  relevance: "Best match",
};

/**
 * Three sorts as a segmented control, the rest behind "More". Seven pills did
 * not fit a phone and asked visitors to read every one before choosing; the
 * three that answer "what's happening now" stay one tap away. Price sorts stay
 * URL-only (?sort=price-low): `pricing_amount` is empty on most listings.
 */
const PRIMARY_SORTS: ProductSort[] = ["trending", "rising", "newest"];
const MORE_SORTS: ProductSort[] = ["top-rated", "most-viewed", "most-saved", "most-discussed", "most-compared"];

const pillClass =
  // ~30px with a mouse, which is fine to click and awkward to tap. The
  // segmented control keeps its desktop proportions and only grows to a 44px
  // row on a touch pointer.
  "flex items-center gap-1 rounded-sm px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors duration-150 outline-none pointer-coarse:min-h-11 pointer-coarse:px-4 focus-visible:ring-2 focus-visible:ring-ring/50";

export function SortPills() {
  const searchParams = useSearchParams();
  const updateSearchParams = useUpdateSearchParams();

  const sortParam = searchParams.get("sort");
  const searching = Boolean(searchParams.get("q")?.trim());
  const fallback: ProductSort = searching ? "relevance" : "trending";

  // With a query and no explicit choice, results are ranked by relevance —
  // mirror that here so the highlighted pill matches what is on screen. A
  // browse-only sort under a search is ranked by relevance too (see
  // BROWSE_ONLY_SORTS), so it is shown as such.
  const requested = (PRODUCT_SORTS as readonly string[]).includes(sortParam ?? "")
    ? (sortParam as ProductSort)
    : fallback;
  const sort: ProductSort = searching && BROWSE_ONLY_SORTS.includes(requested) ? "relevance" : requested;

  // "Best match" is meaningless without a query, so it appears only while one
  // is active — and then leads, because it is the default.
  const primary: ProductSort[] = searching ? ["relevance", ...PRIMARY_SORTS] : PRIMARY_SORTS;
  const more = MORE_SORTS.filter((value) => !(searching && BROWSE_ONLY_SORTS.includes(value)));
  const moreActive = more.includes(sort);

  // Clearing the param restores the contextual default, so neither default
  // ends up pinned in the URL.
  const choose = (value: ProductSort) =>
    updateSearchParams({ sort: value === fallback ? null : value }, { resetPage: true });

  return (
    <div className="flex w-max gap-0.5 rounded-md border border-border bg-background p-1" role="group" aria-label="Sort products">
      {primary.map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={sort === value}
          onClick={() => choose(value)}
          className={cn(pillClass, sort === value ? "bg-surface-card text-ink" : "text-muted hover:text-ink")}
        >
          {SORT_LABELS[value]}
        </button>
      ))}
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(pillClass, moreActive ? "bg-surface-card text-ink" : "text-muted hover:text-ink")}
          aria-label={moreActive ? `Sorted by ${SORT_LABELS[sort]}. More sorts` : "More sorts"}
        >
          {moreActive ? SORT_LABELS[sort] : "More"}
          <ChevronDown className="size-3.5 opacity-60" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-48">
          <DropdownMenuRadioGroup value={sort} onValueChange={(next) => choose(String(next) as ProductSort)}>
            {more.map((value) => (
              <DropdownMenuRadioItem key={value} value={value} closeOnClick className="py-2 pointer-coarse:min-h-11">
                {SORT_LABELS[value]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
