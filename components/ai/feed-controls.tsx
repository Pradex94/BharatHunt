"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SearchIcon, SlidersHorizontalIcon, XIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { useUpdateSearchParams } from "@/hooks/use-update-search-params";
import { Button } from "@/components/ui/button";
import { Numeric } from "@/components/ui/typography";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  AI_DATE_RANGES,
  AI_DATE_RANGE_LABELS,
  AI_SORTS,
  AI_SORT_LABELS,
  AI_STORY_TYPES,
  AI_TOPIC_EXPLORER,
  defaultAiSort,
  type AiSort,
} from "@/lib/ai-news/constants";

/**
 * Everything on /ai that writes to the URL.
 *
 * All of it is `searchParams`-driven, through the same `useUpdateSearchParams`
 * hook the marketplace uses — so a filtered view is a link somebody can send,
 * the back button works, and the server does the filtering. `router.push` with
 * `scroll: false` re-renders the server components in place; nothing here
 * reloads the page, and none of these components holds a list of stories.
 */

// ── Search ───────────────────────────────────────────────────────────────

/**
 * The hero's search box.
 *
 * Debounced at 400ms into `?q=`, and pushed immediately on Enter. Matches
 * headlines, summaries, companies, models, tools and categories, because all of
 * them are in the story's `search_text` column.
 *
 * The URL is also watched the other way: a "clear filters" link or the back
 * button changes `?q=` without typing, and the box follows. `lastPushed` records
 * what *this* box last pushed, so the URL catching up with the reader's own typing
 * is never mistaken for an outside change that should overwrite it.
 */
export function AiSearchInput({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const searchParams = useSearchParams();
  const updateSearchParams = useUpdateSearchParams();
  const urlQuery = searchParams.get("q") ?? "";

  const [value, setValue] = useState(urlQuery);
  const [lastPushed, setLastPushed] = useState(urlQuery.trim());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const push = (next: string) => {
    clearTimeout(timer.current);
    const trimmed = next.trim();
    if (trimmed === lastPushed) return;
    setLastPushed(trimmed);
    updateSearchParams({ q: trimmed || null }, { resetPage: true });
  };

  // Debounced in the handler rather than through an effect on the value, so a
  // keystroke never schedules a render just to decide whether to navigate.
  const onType = (next: string) => {
    setValue(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => push(next), 400);
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  // Follow outside changes to `?q=` (links, back/forward) — adjusting state
  // during render when an input changes, as React recommends over an effect.
  const [seenUrlQuery, setSeenUrlQuery] = useState(urlQuery);
  if (seenUrlQuery !== urlQuery) {
    setSeenUrlQuery(urlQuery);
    if (urlQuery.trim() !== lastPushed) {
      setLastPushed(urlQuery.trim());
      setValue(urlQuery);
    }
  }

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        push(value);
      }}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border px-4 transition-colors sm:px-5",
        tone === "dark"
          ? "border-white/15 bg-white/[0.06] focus-within:border-primary focus-within:bg-white/[0.09]"
          : "border-border bg-card focus-within:border-primary",
      )}
    >
      <SearchIcon
        aria-hidden="true"
        className={cn("size-5 shrink-0", tone === "dark" ? "text-white/50" : "text-muted")}
      />
      <input
        type="search"
        enterKeyHint="search"
        value={value}
        onChange={(event) => onType(event.target.value)}
        placeholder="Search AI news, tools, companies, models…"
        aria-label="Search AI news, tools, companies and models"
        maxLength={120}
        className={cn(
          "h-13 min-w-0 flex-1 bg-transparent text-base outline-none sm:h-14",
          tone === "dark"
            ? "text-white placeholder:text-white/45"
            : "text-ink placeholder:text-muted",
        )}
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            setValue("");
            push("");
          }}
          aria-label="Clear search"
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full transition-colors",
            tone === "dark" ? "text-white/60 hover:bg-white/10" : "text-muted hover:bg-secondary-bg",
          )}
        >
          <XIcon aria-hidden="true" className="size-4" />
        </button>
      ) : null}
    </form>
  );
}

// ── Topic explorer ───────────────────────────────────────────────────────

/**
 * The topic pills.
 *
 * A horizontally scrolling row, never a wrapping block: fifteen chips wrap to
 * four lines on a phone and push the news below the fold. Counts are real
 * (`getAiCategoryCounts`), and a topic with none is still shown, because a filter
 * that silently disappears is more confusing than one that returns nothing.
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
      aria-label="AI topics"
      className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-0.5 sm:mx-0 sm:px-0"
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

      {AI_TOPIC_EXPLORER.map((category) => {
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

// ── Filters ──────────────────────────────────────────────────────────────

export type FilterOption = { value: string; label: string };

type FilterDef = {
  param: string;
  label: string;
  allLabel: string;
  options: FilterOption[];
};

const selectClass =
  "h-9 w-full min-w-0 appearance-none rounded-md border border-border bg-card bg-[length:14px] bg-[right_0.6rem_center] bg-no-repeat py-0 pr-8 pl-3 text-sm text-ink transition-colors hover:border-primary/40 focus-visible:border-primary focus-visible:outline-none pointer-coarse:h-11 " +
  // A tiny inline chevron, so the native select needs no icon component.
  "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]";

/**
 * Native `<select>`s, deliberately: they cost no JavaScript beyond this
 * component, open the platform picker on a phone, and are accessible by
 * default. The same control set renders inline on desktop and inside a drawer
 * on mobile.
 */
function FilterSelects({
  filters,
  layout,
}: {
  filters: FilterDef[];
  layout: "inline" | "stacked";
}) {
  const searchParams = useSearchParams();
  const updateSearchParams = useUpdateSearchParams();

  return (
    <>
      {filters.map((filter) => {
        const current = searchParams.get(filter.param) ?? "";
        const id = `ai-filter-${filter.param}-${layout}`;
        return (
          <div
            key={filter.param}
            className={cn(layout === "stacked" ? "flex flex-col gap-1.5" : "w-36 shrink-0 xl:w-40")}
          >
            <label
              htmlFor={id}
              className={cn(layout === "stacked" ? "text-sm font-semibold text-ink" : "sr-only")}
            >
              {filter.label}
            </label>
            <select
              id={id}
              value={current}
              onChange={(event) =>
                updateSearchParams({ [filter.param]: event.target.value || null }, { resetPage: true })
              }
              className={cn(selectClass, current && "border-primary/50 font-medium")}
            >
              <option value="">{layout === "inline" ? filter.label : filter.allLabel}</option>
              {filter.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        );
      })}
    </>
  );
}

/**
 * Date, type, company, source and region — plus sort.
 *
 * `companies` and `sources` come from the server: companies with stories in the
 * last month, and publications with stories in the last month. A filter option
 * that could only ever return nothing is not offered.
 */
export function FeedFilters({
  companies,
  sources,
}: {
  companies: FilterOption[];
  sources: FilterOption[];
}) {
  const searchParams = useSearchParams();
  const updateSearchParams = useUpdateSearchParams();
  const [open, setOpen] = useState(false);

  const filters: FilterDef[] = [
    {
      param: "date",
      label: "Date",
      allLabel: "Any time",
      options: AI_DATE_RANGES.map((range) => ({ value: range, label: AI_DATE_RANGE_LABELS[range] })),
    },
    {
      param: "type",
      label: "Type",
      allLabel: "All types",
      options: AI_STORY_TYPES.map((type) => ({ value: type.slug, label: type.label })),
    },
    ...(companies.length > 0
      ? [{ param: "company", label: "Company", allLabel: "All companies", options: companies }]
      : []),
    ...(sources.length > 0
      ? [{ param: "source", label: "Source", allLabel: "All sources", options: sources }]
      : []),
    {
      param: "region",
      label: "Region",
      allLabel: "India + Global",
      options: [
        { value: "india", label: "India" },
        { value: "global", label: "Global" },
      ],
    },
  ];

  const activeCount = filters.filter((filter) => searchParams.get(filter.param)).length;
  const clearAll = () =>
    updateSearchParams(
      Object.fromEntries(filters.map((filter) => [filter.param, null])),
      { resetPage: true },
    );

  return (
    <div className="flex min-w-0 items-center gap-2">
      {/* Mobile and tablet: one button, a drawer. */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          render={
            <Button type="button" variant="outline" size="sm" className="shrink-0 gap-2 lg:hidden" />
          }
        >
          <SlidersHorizontalIcon aria-hidden="true" className="size-4" />
          Filters
          {activeCount > 0 ? (
            <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">
              {activeCount}
            </span>
          ) : null}
        </SheetTrigger>
        <SheetContent side="bottom" className="max-h-[85dvh] rounded-t-3xl">
          <SheetHeader className="px-5 pt-5">
            <SheetTitle className="text-lg font-bold">Filter AI stories</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-4 px-5">
            <FilterSelects filters={filters} layout="stacked" />
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-ink">Sort</span>
              <SortControl />
            </div>
          </div>
          <div className="flex gap-2 border-t border-border p-5">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              disabled={activeCount === 0}
              onClick={clearAll}
            >
              Clear filters
            </Button>
            <Button type="button" className="flex-1" onClick={() => setOpen(false)}>
              Show stories
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Desktop: inline. */}
      <div className="hidden min-w-0 items-center gap-2 lg:flex">
        <FilterSelects filters={filters} layout="inline" />
        {activeCount > 0 ? (
          <button
            type="button"
            onClick={clearAll}
            className="shrink-0 px-2 text-sm font-semibold text-primary hover:underline"
          >
            Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ── Sort ─────────────────────────────────────────────────────────────────

/**
 * Newest / Trending (and Best match while searching).
 *
 * The feed defaults to Newest: the hub above it is already the trending view,
 * and a trend-ordered feed would open by repeating it. "Best match" only
 * appears while a query is active, and becomes the default then — ranking a
 * search by date or score buries the thing somebody just typed. The defaults
 * live in `defaultAiSort` so the page and this control cannot disagree.
 */
export function SortControl() {
  const searchParams = useSearchParams();
  const updateSearchParams = useUpdateSearchParams();

  const searching = Boolean(searchParams.get("q")?.trim());
  const contextualDefault = defaultAiSort(searching);
  const sortParam = searchParams.get("sort");
  const sort: AiSort = (AI_SORTS as readonly string[]).includes(sortParam ?? "")
    ? (sortParam as AiSort)
    : contextualDefault;

  const options: AiSort[] = searching ? ["relevance", "latest", "trending"] : ["latest", "trending"];

  return (
    <div
      role="group"
      aria-label="Sort stories"
      className="flex w-max shrink-0 gap-0.5 rounded-md border border-border bg-background p-1"
    >
      {options.map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={sort === value}
          onClick={() =>
            updateSearchParams(
              { sort: value === contextualDefault ? null : value },
              { resetPage: true },
            )
          }
          className={cn(
            "flex items-center rounded-sm px-3 py-1 text-sm font-medium whitespace-nowrap transition-colors duration-150 pointer-coarse:min-h-10 pointer-coarse:px-4",
            sort === value ? "bg-surface-card text-ink shadow-xs" : "text-muted hover:text-ink",
          )}
        >
          {AI_SORT_LABELS[value]}
        </button>
      ))}
    </div>
  );
}
