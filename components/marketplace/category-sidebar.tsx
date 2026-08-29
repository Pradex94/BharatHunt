"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Caption, Numeric } from "@/components/ui/typography";
import { useUpdateSearchParams } from "@/hooks/use-update-search-params";
import {
  PRODUCT_CATEGORIES,
  PRODUCT_PRICING_TYPES,
  PRICING_TYPE_LABELS,
} from "@/lib/constants";

function CategoryList({
  categoryCounts,
  totalCount,
}: {
  categoryCounts: Record<string, number>;
  totalCount: number;
}) {
  const searchParams = useSearchParams();
  const updateSearchParams = useUpdateSearchParams();
  const activeCategory = searchParams.get("category");

  return (
    <div className="flex flex-col gap-1" role="group" aria-label="Filter by category">
      <button
        type="button"
        onClick={() => updateSearchParams({ category: null }, { resetPage: true })}
        className={cn(
          "flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors duration-150 outline-none pointer-coarse:min-h-11 focus-visible:ring-2 focus-visible:ring-ring/50",
          activeCategory === null
            ? "bg-primary/10 text-primary"
            : "text-ink hover:bg-secondary-bg",
        )}
      >
        <span>All</span>
        <Numeric className="text-xs text-muted">{totalCount}</Numeric>
      </button>
      {PRODUCT_CATEGORIES.map((category) => (
        <button
          key={category}
          type="button"
          aria-pressed={activeCategory === category}
          onClick={() => updateSearchParams({ category }, { resetPage: true })}
          className={cn(
            "flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors duration-150 outline-none pointer-coarse:min-h-11 focus-visible:ring-2 focus-visible:ring-ring/50",
            activeCategory === category
              ? "bg-primary/10 text-primary"
              : "text-ink hover:bg-secondary-bg",
          )}
        >
          <span>{category}</span>
          <Numeric className="text-xs text-muted">
            {categoryCounts[category] ?? 0}
          </Numeric>
        </button>
      ))}
    </div>
  );
}

function PricingFilter() {
  const searchParams = useSearchParams();
  const updateSearchParams = useUpdateSearchParams();
  const activePricing = (searchParams.get("pricing") ?? "").split(",").filter(Boolean);

  function togglePricing(value: string) {
    const next = activePricing.includes(value)
      ? activePricing.filter((entry) => entry !== value)
      : [...activePricing, value];
    updateSearchParams({ pricing: next.length > 0 ? next.join(",") : null }, { resetPage: true });
  }

  return (
    <div className="flex flex-col gap-3">
      {PRODUCT_PRICING_TYPES.map((value) => {
        const checked = activePricing.includes(value);
        return (
          // The whole row is the target, not the 17px box inside it: on a
          // touch pointer the label gets a 44px height so the tap area matches
          // what a finger can actually hit. The desktop row is unchanged.
          <label
            key={value}
            className="flex cursor-pointer items-center gap-2.5 text-sm text-foreground pointer-coarse:min-h-11"
          >
            <span className="relative inline-flex">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => togglePricing(value)}
                className="peer sr-only"
              />
              <span
                aria-hidden="true"
                className="flex size-[17px] items-center justify-center rounded-[5px] border border-border bg-background text-[10px] font-bold text-transparent transition-colors duration-150 peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring/50"
              >
                ✓
              </span>
            </span>
            {PRICING_TYPE_LABELS[value]}
          </label>
        );
      })}
    </div>
  );
}

export function CategorySidebar({
  categoryCounts,
  totalCount,
}: {
  categoryCounts: Record<string, number>;
  totalCount: number;
}) {
  return (
    <div className="flex flex-col gap-7">
      <div>
        <Caption className="mb-3 block">Categories</Caption>
        <CategoryList categoryCounts={categoryCounts} totalCount={totalCount} />
      </div>
      <div>
        <Caption className="mb-3 block">Pricing</Caption>
        <PricingFilter />
      </div>
      <div className="rounded-lg bg-primary p-5 text-on-primary">
        <p className="text-sm font-semibold">Building something?</p>
        <p className="mt-1.5 mb-3.5 text-xs leading-relaxed text-on-primary/80">
          Launch to thousands of early adopters across India.
        </p>
        <Link
          href="/submit"
          className={buttonVariants({ variant: "on-coral", size: "sm", className: "w-full" })}
        >
          Submit your product
        </Link>
      </div>
    </div>
  );
}
