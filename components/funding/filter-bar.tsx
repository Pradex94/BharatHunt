"use client";

import { useSearchParams } from "next/navigation";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import { useUpdateSearchParams } from "@/hooks/use-update-search-params";
import {
  FUNDING_AMOUNT_FILTERS,
  FUNDING_DATE_FILTERS,
  FUNDING_GEO_FILTERS,
  FUNDING_INDUSTRIES,
  FUNDING_SORTS,
  FUNDING_SORT_LABELS,
  FUNDING_STAGE_FILTERS,
  type FundingSort,
} from "@/lib/funding/constants";

/**
 * The filter bar.
 *
 * State lives entirely in the URL — same contract as the marketplace filters
 * (`hooks/use-update-search-params.ts`). Nothing here holds a selection in
 * React state, which is what makes a filtered feed a link someone can send and
 * what makes the back button work.
 *
 * Multi-select groups (stage, industry, geography) serialise as a
 * comma-separated token list; single-select groups (date, amount, sort) hold
 * one token, and selecting the default clears the parameter rather than pinning
 * it, so the canonical URL of the unfiltered feed stays `/funding`.
 *
 * Mobile behaviour is the reason each group is its own row rather than one long
 * wrapping strip: at 320px a single strip either wraps to six lines or
 * side-scrolls past the group labels, and both make the filters hard to read.
 * Each row scrolls horizontally on its own, the labels stay put, and the page
 * itself never scrolls sideways.
 */
export function FundingFilterBar({ resultCount }: { resultCount: number }) {
  const searchParams = useSearchParams();
  const update = useUpdateSearchParams();

  const tokens = (key: string) =>
    (searchParams.get(key) ?? "").split(",").map((token) => token.trim()).filter(Boolean);

  const stages = tokens("stage");
  const industries = tokens("industry");
  const geos = tokens("geo");
  const date = searchParams.get("date") ?? "all";
  const amount = searchParams.get("amount") ?? "any";
  const sortParam = searchParams.get("sort");
  const sort: FundingSort = (FUNDING_SORTS as readonly string[]).includes(sortParam ?? "")
    ? (sortParam as FundingSort)
    : "recent";
  const investor = searchParams.get("investor");
  const query = searchParams.get("q");

  /** Add or remove one token from a multi-select parameter. */
  function toggle(key: string, value: string) {
    const current = tokens(key);
    const next = current.includes(value)
      ? current.filter((token) => token !== value)
      : [...current, value];
    update({ [key]: next.length > 0 ? next.join(",") : null }, { resetPage: true });
  }

  /** Set a single-select parameter, clearing it when it is the default. */
  function choose(key: string, value: string, fallback: string) {
    update({ [key]: value === fallback ? null : value }, { resetPage: true });
  }

  const active =
    stages.length + industries.length + geos.length > 0 ||
    date !== "all" ||
    amount !== "any" ||
    Boolean(investor) ||
    Boolean(query);

  return (
    <div className="flex flex-col gap-3">
      <FilterRow label="Date">
        {FUNDING_DATE_FILTERS.map((option) => (
          <Chip
            key={option.value}
            selected={date === option.value}
            onClick={() => choose("date", option.value, "all")}
          >
            {option.label}
          </Chip>
        ))}
      </FilterRow>

      <FilterRow label="Stage">
        {FUNDING_STAGE_FILTERS.map((option) => (
          <Chip
            key={option.value}
            selected={stages.includes(option.value)}
            onClick={() => toggle("stage", option.value)}
          >
            {option.label}
          </Chip>
        ))}
      </FilterRow>

      <FilterRow label="Industry">
        {FUNDING_INDUSTRIES.map((industry) => {
          const token = industry.toLowerCase();
          return (
            <Chip
              key={industry}
              selected={industries.includes(token)}
              onClick={() => toggle("industry", token)}
            >
              {industry}
            </Chip>
          );
        })}
      </FilterRow>

      <FilterRow label="Geography">
        {FUNDING_GEO_FILTERS.map((option) => (
          <Chip
            key={option.value}
            selected={geos.includes(option.value)}
            onClick={() => toggle("geo", option.value)}
          >
            {option.label}
          </Chip>
        ))}
      </FilterRow>

      {/* Amount and sort are `select`s rather than chips: five mutually
          exclusive options each, and two more chip rows would push the feed
          itself below the fold on a phone. */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs font-medium text-muted">
          Amount
          <select
            value={amount}
            onChange={(event) => choose("amount", event.target.value, "any")}
            className="h-9 rounded-md border border-border bg-card px-2 text-xs font-medium text-ink outline-none pointer-coarse:h-11 focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            {FUNDING_AMOUNT_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-xs font-medium text-muted">
          Sort
          <select
            value={sort}
            onChange={(event) => choose("sort", event.target.value, "recent")}
            className="h-9 rounded-md border border-border bg-card px-2 text-xs font-medium text-ink outline-none pointer-coarse:h-11 focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            {FUNDING_SORTS.map((value) => (
              <option key={value} value={value}>
                {FUNDING_SORT_LABELS[value]}
              </option>
            ))}
          </select>
        </label>

        <span className="text-xs text-muted">
          {resultCount.toLocaleString("en-IN")} {resultCount === 1 ? "round" : "rounds"}
        </span>

        {active && (
          <button
            type="button"
            onClick={() =>
              update(
                {
                  stage: null,
                  industry: null,
                  geo: null,
                  date: null,
                  amount: null,
                  investor: null,
                  q: null,
                },
                { resetPage: true },
              )
            }
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-primary transition-colors pointer-coarse:min-h-11 hover:bg-primary/8"
          >
            <X className="size-3" aria-hidden="true" />
            Clear all
          </button>
        )}
      </div>

      {/* An investor filter arrives by clicking a name on /funding/investors,
          so it needs its own visible, removable token — there is no chip in any
          row above that would show it as active. */}
      {investor && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">Investor</span>
          <button
            type="button"
            onClick={() => update({ investor: null }, { resetPage: true })}
            className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/8 px-2.5 py-1 text-xs font-semibold text-primary pointer-coarse:min-h-11"
          >
            {investor}
            <X className="size-3" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 shrink-0 text-xs font-medium text-muted sm:w-20">{label}</span>
      {/* `-mx-1 px-1` so a focus ring on the first or last chip is not clipped
          by the scroll container. */}
      <div className="no-scrollbar -mx-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-1 py-0.5">
        {children}
      </div>
    </div>
  );
}

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors outline-none pointer-coarse:min-h-11 focus-visible:ring-2 focus-visible:ring-ring/50",
        selected
          ? "border-primary bg-primary text-white"
          : "border-border bg-card text-body hover:border-primary/30 hover:bg-secondary-bg",
      )}
    >
      {children}
    </button>
  );
}
