"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Caption, Numeric } from "@/components/ui/typography";
import { useUpdateSearchParams } from "@/hooks/use-update-search-params";
import {
  PRODUCT_CATEGORIES,
  PRODUCT_PRICING_TYPES,
  PRICING_TYPE_LABELS,
} from "@/lib/constants";
import { indiaStateName } from "@/lib/india-states";

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
                className="flex size-[17px] items-center justify-center rounded-[5px] border border-border bg-background text-transparent transition-colors duration-150 peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring/50"
              >
                <Check className="size-3" />
              </span>
            </span>
            {PRICING_TYPE_LABELS[value]}
          </label>
        );
      })}
    </div>
  );
}

const TOGGLE_ROW =
  "flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors duration-150 outline-none pointer-coarse:min-h-11 focus-visible:ring-2 focus-visible:ring-ring/50";

/**
 * Discovery filters (lib/constants.ts parseDiscoveryFilters): AI-first, made in
 * India, launch window. URL params like the rest, so a filtered view is a link.
 */
function DiscoveryFilter() {
  const searchParams = useSearchParams();
  const updateSearchParams = useUpdateSearchParams();
  const ai = searchParams.get("ai") === "1";
  const india = searchParams.get("made_in") === "india";
  const launched = searchParams.get("launched");

  const toggles: { label: string; active: boolean; onClick: () => void; hint: string }[] = [
    {
      label: "AI-first",
      hint: "Listings that describe themselves as AI — not just tagged",
      active: ai,
      onClick: () => updateSearchParams({ ai: ai ? null : "1" }, { resetPage: true }),
    },
    {
      label: "Made in India",
      hint: "An Indian state confirmed by the maker or verified by BharatHunt",
      active: india,
      onClick: () => updateSearchParams({ made_in: india ? null : "india" }, { resetPage: true }),
    },
    {
      label: "Launched this week",
      hint: "Published on BharatHunt in the last 7 days",
      active: launched === "week",
      onClick: () => updateSearchParams({ launched: launched === "week" ? null : "week" }, { resetPage: true }),
    },
    {
      label: "Launched this month",
      hint: "Published on BharatHunt in the last 30 days",
      active: launched === "month",
      onClick: () => updateSearchParams({ launched: launched === "month" ? null : "month" }, { resetPage: true }),
    },
  ];

  return (
    <div className="flex flex-col gap-1" role="group" aria-label="Discovery filters">
      {toggles.map((toggle) => (
        <button
          key={toggle.label}
          type="button"
          title={toggle.hint}
          aria-pressed={toggle.active}
          onClick={toggle.onClick}
          className={cn(TOGGLE_ROW, toggle.active ? "bg-primary/10 text-primary" : "text-ink hover:bg-secondary-bg")}
        >
          <span>{toggle.label}</span>
          {toggle.active && <Check className="size-4" aria-hidden="true" />}
        </button>
      ))}
    </div>
  );
}

/**
 * Where a product was built: only states that have at least one launch, busiest
 * first. Twenty empty states would be a list of dead ends. The busiest five are
 * shown; the rest open on demand.
 */
function LocationFilter({ stateCounts }: { stateCounts: Record<string, number> }) {
  const searchParams = useSearchParams();
  const updateSearchParams = useUpdateSearchParams();
  const active = searchParams.get("state");
  const states = Object.entries(stateCounts)
    .map(([code, count]) => ({ code, count, name: indiaStateName(code) }))
    .filter((state): state is { code: string; count: number; name: string } => Boolean(state.name) && state.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  if (states.length === 0) return null;

  const row = (state: { code: string; count: number; name: string }) => (
    <button
      key={state.code}
      type="button"
      aria-pressed={active === state.code}
      onClick={() => updateSearchParams({ state: active === state.code ? null : state.code }, { resetPage: true })}
      className={cn(TOGGLE_ROW, active === state.code ? "bg-primary/10 text-primary" : "text-ink hover:bg-secondary-bg")}
    >
      <span className="truncate">{state.name}</span>
      <Numeric className="text-xs text-muted">{state.count}</Numeric>
    </button>
  );

  const head = states.slice(0, 5);
  const rest = states.slice(5);
  // Keep a chosen state visible even when it sits in the collapsed tail.
  const activeInRest = rest.some((state) => state.code === active);

  return (
    <div className="flex flex-col gap-1" role="group" aria-label="Filter by location">
      {head.map(row)}
      {rest.length > 0 && (
        <details className="group/more" open={activeInRest || undefined}>
          <summary className={cn(TOGGLE_ROW, "cursor-pointer list-none text-muted hover:bg-secondary-bg [&::-webkit-details-marker]:hidden")}>
            <span>
              <span className="group-open/more:hidden">{rest.length} more states</span>
              <span className="hidden group-open/more:inline">Fewer states</span>
            </span>
          </summary>
          <div className="mt-1 flex flex-col gap-1">{rest.map(row)}</div>
        </details>
      )}
    </div>
  );
}

export function CategorySidebar({
  categoryCounts,
  totalCount,
  stateCounts = {},
}: {
  categoryCounts: Record<string, number>;
  totalCount: number;
  stateCounts?: Record<string, number>;
}) {
  const hasStates = Object.values(stateCounts).some((count) => count > 0);
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
      <div>
        <Caption className="mb-3 block">Discover</Caption>
        <DiscoveryFilter />
      </div>
      {hasStates && (
        <div>
          <Caption className="mb-3 block">Location</Caption>
          <LocationFilter stateCounts={stateCounts} />
        </div>
      )}
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
