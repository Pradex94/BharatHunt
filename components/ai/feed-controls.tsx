"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SearchIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { useDebounce } from "@/hooks/use-debounce";
import { useUpdateSearchParams } from "@/hooks/use-update-search-params";
import { Numeric } from "@/components/ui/typography";
import { AI_CATEGORIES, AI_SORTS, AI_SORT_LABELS, type AiSort } from "@/lib/ai-news/constants";

/**
 * Everything on /ai that writes to the URL.
 *
 * All of it is `searchParams`-driven, through the same
 * `useUpdateSearchParams` hook the marketplace uses — so a filtered, searched,
 * India-only view is a link somebody can send, the back button works, and the
 * server does the filtering. None of these components holds a list of stories;
 * they hold a query, and the page re-renders on the server.
 */

// ── Search ───────────────────────────────────────────────────────────────

/**
 * The hero's search box (section 8).
 *
 * Debounced at 400ms and pushed into `?q=`, which is read by the server and
 * turned into an `ai_story_search` call. Nothing is filtered in the browser and
 * the browser never holds the dataset — the requirement in section 8 and, for a
 * corpus that grows every ten minutes, the only workable design anyway.
 */
export function AiSearchInput({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const searchParams = useSearchParams();
  const updateSearchParams = useUpdateSearchParams();

  const [value, setValue] = useState(searchParams.get("q") ?? "");
  const debouncedValue = useDebounce(value, 400);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    updateSearchParams({ q: debouncedValue.trim() || null }, { resetPage: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedValue]);

  return (
    <div
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border px-4 py-3 transition-colors",
        tone === "dark"
          ? "border-white/15 bg-white/5 focus-within:border-primary"
          : "border-border bg-background focus-within:border-primary",
      )}
    >
      <SearchIcon
        aria-hidden="true"
        className={cn("size-4 shrink-0", tone === "dark" ? "text-white/50" : "text-muted")}
      />
      <input
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Search AI news, companies, models…"
        aria-label="Search AI news"
        className={cn(
          "min-w-0 flex-1 bg-transparent text-sm outline-none",
          tone === "dark"
            ? "text-white placeholder:text-white/40"
            : "text-ink placeholder:text-muted",
        )}
      />
    </div>
  );
}

// ── Categories ───────────────────────────────────────────────────────────

/**
 * The category rail (section 5).
 *
 * A horizontally scrolling row, not a wrapping block: sixteen chips wrap to
 * four lines on a phone and push the actual news below the fold. Scrolling
 * keeps it to one line at every width, and `no-scrollbar` is the same utility
 * the marketplace's sort row uses.
 *
 * The counts are real — `getAiCategoryCounts` counts published stories — and a
 * category with none is still shown, because a filter that silently disappears
 * is more confusing than one that returns nothing.
 */
export function CategoryRail({
  counts,
  totalCount,
}: {
  counts: Record<string, number>;
  totalCount: number;
}) {
  const searchParams = useSearchParams();
  const updateSearchParams = useUpdateSearchParams();
  const active = searchParams.get("category");

  const chip = (isActive: boolean) =>
    cn(
      "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium whitespace-nowrap transition-colors duration-150 pointer-coarse:min-h-11",
      isActive
        ? "border-primary bg-primary text-white"
        : "border-border bg-card text-body hover:border-primary/40 hover:text-ink",
    );

  return (
    <div
      role="group"
      aria-label="AI categories"
      className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-1 sm:mx-0 sm:px-0"
    >
      <button
        type="button"
        aria-pressed={!active}
        onClick={() => updateSearchParams({ category: null }, { resetPage: true })}
        className={chip(!active)}
      >
        All AI
        <Numeric className="text-xs opacity-70">{totalCount}</Numeric>
      </button>

      {AI_CATEGORIES.map((category) => {
        const isActive = active === category.slug;
        const count = counts[category.value] ?? 0;
        return (
          <button
            key={category.slug}
            type="button"
            aria-pressed={isActive}
            title={category.hint}
            onClick={() =>
              updateSearchParams(
                { category: isActive ? null : category.slug },
                { resetPage: true },
              )
            }
            className={chip(isActive)}
          >
            {category.label}
            <Numeric className="text-xs opacity-70">{count}</Numeric>
          </button>
        );
      })}
    </div>
  );
}

// ── Region and sort ──────────────────────────────────────────────────────

/**
 * The India / Global toggle (section 20).
 *
 * Three states, not two: "All" is the default, and it matters that it exists —
 * forcing a choice between India and Global would hide half the news from
 * anyone who did not notice the control.
 */
export function RegionToggle() {
  const searchParams = useSearchParams();
  const updateSearchParams = useUpdateSearchParams();
  const region = searchParams.get("region");

  const options: { value: string | null; label: string }[] = [
    { value: null, label: "All" },
    { value: "india", label: "🇮🇳 India" },
    { value: "global", label: "Global" },
  ];

  return (
    <div
      role="group"
      aria-label="Region"
      className="flex w-max gap-0.5 rounded-md border border-border bg-background p-1"
    >
      {options.map((option) => {
        const isActive = (region ?? null) === option.value;
        return (
          <button
            key={option.label}
            type="button"
            aria-pressed={isActive}
            onClick={() => updateSearchParams({ region: option.value }, { resetPage: true })}
            className={cn(
              "flex items-center rounded-sm px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors duration-150 pointer-coarse:min-h-11 pointer-coarse:px-4",
              isActive ? "bg-surface-card text-ink shadow-xs" : "text-muted hover:text-ink",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Trending / Latest / Best match.
 *
 * "Best match" only appears while a query is active, and becomes the default
 * then — ranking a search by trend score buries the thing somebody just typed.
 * Same rule, and the same reasoning, as the marketplace's sort pills.
 */
export function SortControl() {
  const searchParams = useSearchParams();
  const updateSearchParams = useUpdateSearchParams();

  const searching = Boolean(searchParams.get("q")?.trim());
  const sortParam = searchParams.get("sort");
  const sort: AiSort = (AI_SORTS as readonly string[]).includes(sortParam ?? "")
    ? (sortParam as AiSort)
    : searching
      ? "relevance"
      : "trending";

  const options: AiSort[] = searching ? ["relevance", "trending", "latest"] : ["trending", "latest"];
  const contextualDefault: AiSort = searching ? "relevance" : "trending";

  return (
    <div
      role="group"
      aria-label="Sort stories"
      className="flex w-max gap-0.5 rounded-md border border-border bg-background p-1"
    >
      {options.map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={sort === value}
          onClick={() =>
            // Clearing the param restores the contextual default, so neither
            // default ends up pinned in the URL.
            updateSearchParams(
              { sort: value === contextualDefault ? null : value },
              { resetPage: true },
            )
          }
          className={cn(
            "flex items-center rounded-sm px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors duration-150 pointer-coarse:min-h-11 pointer-coarse:px-4",
            sort === value ? "bg-surface-card text-ink shadow-xs" : "text-muted hover:text-ink",
          )}
        >
          {AI_SORT_LABELS[value]}
        </button>
      ))}
    </div>
  );
}
