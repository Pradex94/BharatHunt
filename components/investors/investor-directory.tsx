"use client";

/* Design system: design.md (Bharat Hunt — orange) · /investors
 *
 * The unlocked directory: search, filters, results, detail panel.
 *
 * Only ever rendered for a customer the *server* decided has paid, and it holds
 * no entitlement logic of its own — there is no `hasAccess` prop to get wrong.
 * The first page of rows arrives as props; every page after it comes from
 * `searchInvestors`, which re-checks the purchase on the server for every call.
 * A browser that mounted this component by hand would get a component with no
 * data and an action that answers "unlock the directory to search it".
 *
 * ── Why state lives here and not in the URL ──────────────────────────────────
 * The marketplace keeps filters in `searchParams` on purpose: those views are
 * meant to be shareable, and hooks/use-update-search-params.ts exists for it.
 * This one deliberately does not. A directory URL is only useful to someone who
 * has also paid, so a shared link is a broken promise at best; and putting the
 * query in the address bar puts a paying customer's research into their history,
 * their referrer headers and anything watching the URL bar. Local state, posted
 * to a server action, leaves none of that behind.
 */

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { FilterX, Loader2, SearchIcon, SlidersHorizontal, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";
import { useDebounce } from "@/hooks/use-debounce";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Numeric } from "@/components/ui/typography";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { InvestorCard } from "@/components/investors/investor-card";
import { InvestorDetailSheet } from "@/components/investors/investor-detail-sheet";
import { searchInvestors } from "@/lib/actions/investors";
import {
  activeFilterCount,
  EMPTY_INVESTOR_FILTERS,
  INVESTOR_SECTORS,
  INVESTOR_STAGES,
  INVESTOR_TYPES,
  type InvestorFilters,
  type InvestorFull,
} from "@/lib/investors";

/**
 * One filter group, as a row of toggle chips.
 *
 * Chips rather than a `<select>`, and the reason is the drawer: on a phone this
 * whole panel is a full-height sheet, where a native select opens a second
 * overlay on top of the first. Chips are one tap, show the current state
 * without being opened, and are already the marketplace's vocabulary
 * (components/marketplace/sort-pills.tsx).
 */
function FilterGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly string[];
  value: string | null;
  onChange: (next: string | null) => void;
}) {
  if (options.length === 0) return null;

  return (
    <fieldset className="flex flex-col gap-2.5">
      <legend className="text-[11px] font-medium tracking-[0.08em] text-muted uppercase">
        {label}
      </legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = value === option;
          return (
            <button
              key={option}
              type="button"
              // Selecting the active chip clears it, so every filter is its own
              // undo and there is no separate "Any" option to render.
              onClick={() => onChange(selected ? null : option)}
              aria-pressed={selected}
              className={cn(
                "inline-flex min-h-9 items-center rounded-full border px-3 text-sm font-medium transition-colors duration-200",
                selected
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-body hover:border-primary/30 hover:bg-secondary-bg",
              )}
            >
              {option}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function InvestorDirectory({
  initialInvestors,
  initialTotal,
  locations,
  pageSize,
}: {
  initialInvestors: InvestorFull[];
  initialTotal: number;
  /** Distinct regions, derived server-side from the rows themselves. */
  locations: string[];
  pageSize: number;
}) {
  const [filters, setFilters] = useState<InvestorFilters>(EMPTY_INVESTOR_FILTERS);
  const [investors, setInvestors] = useState(initialInvestors);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<InvestorFull | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  // 400ms, matching components/marketplace/search-input.tsx. It is also what
  // keeps a fast typist inside the `investorSearch` rate limit: a burst of
  // keystrokes becomes one request, not fifteen.
  const debouncedQuery = useDebounce(filters.q, 400);

  /*
   * Ignore a response that is no longer the current question.
   *
   * Server actions are ordinary POSTs and can settle out of order: type
   * "fintech", delete it, and the slower first response can land last and
   * repaint the stale result set over the fresh one. Each run takes a ticket;
   * only the latest ticket is allowed to write state.
   */
  const requestId = useRef(0);

  const run = useCallback((next: InvestorFilters, nextPage: number) => {
    const ticket = ++requestId.current;

    startTransition(async () => {
      const result = await searchInvestors({ filters: next, page: nextPage });
      if (ticket !== requestId.current) return;

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setError(null);
      setInvestors(result.investors);
      setTotal(result.total);
    });
  }, []);

  /*
   * Re-query whenever the debounced term or any filter changes.
   *
   * `isFirstRender` skips the mount pass: the server already rendered page one
   * with these exact (empty) filters, and re-fetching it immediately would be a
   * wasted round trip and a visible flicker on every page load.
   */
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    setPage(0);
    run({ ...filters, q: debouncedQuery }, 0);

    if (debouncedQuery.trim()) {
      // The term itself is never sent to analytics. It is a paying customer's
      // research — which investors they are looking for is arguably the most
      // sensitive thing this product knows about them — so what is measured is
      // that a search happened and roughly how specific it was.
      trackEvent("investor_search", {
        location: "investors",
        query_length: debouncedQuery.trim().length,
      });
    }
    // `filters.q` is deliberately absent: the debounced copy is what drives a
    // query, and depending on both would fire a request on every keystroke as
    // well as on the settled value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, filters.stage, filters.sector, filters.location, filters.investorType]);

  const setFilter = useCallback((patch: Partial<InvestorFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    const [key, value] = Object.entries(patch)[0] ?? [];
    if (key && key !== "q" && value) {
      trackEvent("investor_filter", { location: "investors", filter: key, value: String(value) });
    }
  }, []);

  const clearAll = useCallback(() => {
    setFilters(EMPTY_INVESTOR_FILTERS);
    setDrawerOpen(false);
  }, []);

  const goToPage = useCallback(
    (next: number) => {
      setPage(next);
      run({ ...filters, q: debouncedQuery }, next);
      // The results start below the header on a phone; without this a "next
      // page" tap silently replaces content the reader has scrolled past.
      document.getElementById("directory")?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [debouncedQuery, filters, run],
  );

  const filterCount = activeFilterCount(filters);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  /* The filter panel, rendered twice: inline on desktop, inside the drawer on
     mobile. One definition so the two cannot drift. */
  const filterPanel = (
    <div className="flex flex-col gap-6">
      <FilterGroup
        label="Investment stage"
        options={INVESTOR_STAGES}
        value={filters.stage}
        onChange={(stage) => setFilter({ stage })}
      />
      <FilterGroup
        label="Sector"
        options={INVESTOR_SECTORS}
        value={filters.sector}
        onChange={(sector) => setFilter({ sector })}
      />
      <FilterGroup
        label="Investor type"
        options={INVESTOR_TYPES}
        value={filters.investorType}
        onChange={(investorType) => setFilter({ investorType })}
      />
      <FilterGroup
        label="Location"
        options={locations}
        value={filters.location}
        onChange={(location) => setFilter({ location })}
      />

      {filterCount > 0 && (
        <Button type="button" variant="outline" onClick={clearAll} className="self-start">
          <FilterX className="size-4" aria-hidden="true" />
          Clear filters
        </Button>
      )}
    </div>
  );

  return (
    <div id="directory" className="flex flex-col gap-6">
      {/* Search row */}
      <div className="flex items-center gap-2.5">
        <div className="relative flex flex-1 items-center gap-2.5 rounded-md border border-border bg-card px-4 py-2.5 transition-colors focus-within:border-primary">
          {/* The spinner replaces the magnifier in place rather than sitting
              beside it, so the row never changes width mid-query. */}
          {pending ? (
            <Loader2
              aria-hidden="true"
              className="size-4 shrink-0 animate-spin text-primary"
            />
          ) : (
            <SearchIcon aria-hidden="true" className="size-4 shrink-0 text-muted" />
          )}
          <Input
            type="search"
            value={filters.q}
            onChange={(event) => setFilter({ q: event.target.value })}
            placeholder="Search investors, funds or sectors…"
            aria-label="Search investors"
            /* The bordered wrapper is the control here, and its own padding
               already makes it a 44px row on a phone. `pointer-coarse:h-auto`
               cancels the touch height Input applies to itself, which would
               otherwise stack a 44px field inside a 44px box. */
            className="h-auto border-none bg-transparent p-0 shadow-none pointer-coarse:h-auto focus-visible:ring-0"
          />
        </div>

        <Button
          type="button"
          variant="outline"
          className="shrink-0 gap-2 lg:hidden"
          onClick={() => setDrawerOpen(true)}
        >
          <SlidersHorizontal className="size-4" aria-hidden="true" />
          Filters
          {filterCount > 0 && (
            <Badge variant="default" className="h-5 min-w-5 px-1.5">
              {filterCount}
            </Badge>
          )}
        </Button>
      </div>

      <div className="flex flex-col gap-8 lg:flex-row lg:gap-10">
        {/* Desktop filter rail. `shrink-0` with a fixed basis so a long sector
            chip cannot squeeze the results column. */}
        <aside className="hidden w-64 shrink-0 lg:block">
          <div className="sticky top-24">{filterPanel}</div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted">
              <Numeric className="font-medium text-ink">{total}</Numeric>{" "}
              {total === 1 ? "investor" : "investors"}
              {filterCount > 0 || debouncedQuery.trim() ? " match your search" : " in the directory"}
            </p>
            {pageCount > 1 && (
              <p className="text-sm text-muted">
                Page <Numeric>{page + 1}</Numeric> of <Numeric>{pageCount}</Numeric>
              </p>
            )}
          </div>

          {error ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-2xl bg-destructive/10 p-4 text-sm text-destructive"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {error}
            </div>
          ) : investors.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-secondary-bg/50 p-10 text-center">
              <p className="text-base font-semibold text-ink">No investors match that search</p>
              <p className="mx-auto mt-2 max-w-md text-sm text-body">
                Try a broader sector, a different stage, or clear the filters to see the whole
                directory again.
              </p>
              {(filterCount > 0 || filters.q) && (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-5"
                  onClick={() => setFilters(EMPTY_INVESTOR_FILTERS)}
                >
                  <FilterX className="size-4" aria-hidden="true" />
                  Clear search and filters
                </Button>
              )}
            </div>
          ) : (
            <div
              /* Dimmed rather than replaced by skeletons while a query is in
                 flight: the previous results stay readable, the layout does not
                 jump, and the spinner in the search field already says what is
                 happening. */
              className={cn(
                "grid grid-cols-1 gap-4 transition-opacity duration-200 sm:grid-cols-2 xl:grid-cols-3",
                pending && "opacity-60",
              )}
            >
              {investors.map((investor) => (
                <InvestorCard
                  key={investor.id}
                  investor={investor}
                  onOpen={(record) => {
                    setOpen(record as InvestorFull);
                    trackEvent("investor_detail_view", { location: "investors", tier: "paid" });
                  }}
                />
              ))}
            </div>
          )}

          {pageCount > 1 && !error && (
            <div className="mt-8 flex items-center justify-center gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={page === 0 || pending}
                onClick={() => goToPage(page - 1)}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={page + 1 >= pageCount || pending}
                onClick={() => goToPage(page + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile filter drawer — the same panel, in the app's existing sheet. */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="right" className="w-full">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-6">{filterPanel}</div>
          <div className="mt-auto border-t border-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Button type="button" className="w-full" onClick={() => setDrawerOpen(false)}>
              Show {total} {total === 1 ? "investor" : "investors"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <InvestorDetailSheet investor={open} onClose={() => setOpen(null)} />
    </div>
  );
}
