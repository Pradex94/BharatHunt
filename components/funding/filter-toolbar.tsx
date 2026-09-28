"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronDown, X } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FundingSearch } from "@/components/funding/funding-search";
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

type Option = { value: string; label: string };

const STAGE_OPTIONS: Option[] = FUNDING_STAGE_FILTERS.map(({ value, label }) => ({ value, label }));
const INDUSTRY_OPTIONS: Option[] = FUNDING_INDUSTRIES.map((industry) => ({
  value: industry.toLowerCase(),
  label: industry,
}));
const GEO_OPTIONS: Option[] = FUNDING_GEO_FILTERS.map(({ value, label }) => ({ value, label }));
const DATE_OPTIONS: Option[] = FUNDING_DATE_FILTERS.map(({ value, label }) => ({ value, label }));
const AMOUNT_OPTIONS: Option[] = FUNDING_AMOUNT_FILTERS.map(({ value, label }) => ({
  value,
  label,
}));
const SORT_OPTIONS: Option[] = FUNDING_SORTS.map((value) => ({
  value,
  label: FUNDING_SORT_LABELS[value],
}));

/**
 * The feed toolbar: search, six filters, and the active-filter pills.
 *
 * State lives entirely in the URL — the marketplace contract
 * (`hooks/use-update-search-params.ts`) — so `/funding?stage=seed&industry=ai`
 * is a link someone can send, and a refresh or the back button restores it.
 * The tokens are the ones `lib/funding/filters.ts` parses; this component only
 * writes them.
 *
 * Why dropdowns and not chip rows
 * -------------------------------
 * The previous bar was four rows of chips plus two selects, sticky under the
 * navbar — about 200px of a 667px phone screen permanently covering the feed
 * it filtered. This is one scrollable row of six triggers, and the selections
 * show as removable pills underneath, only when there are any.
 *
 * Debouncing
 * ----------
 * Every URL change is a server render of the feed, so they are rationed:
 * search is debounced (in `FundingSearch`), single-choice menus commit once on
 * pick, and multi-choice menus hold a draft while open and commit once on
 * close — ticking three stages is one navigation, not three.
 */
export function FundingFilterToolbar() {
  const searchParams = useSearchParams();
  const update = useUpdateSearchParams();

  const tokens = (key: string) =>
    (searchParams.get(key) ?? "")
      .split(",")
      .map((token) => token.trim())
      .filter(Boolean);

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

  function commitList(key: string, next: string[]) {
    update({ [key]: next.length > 0 ? next.join(",") : null }, { resetPage: true });
  }

  /** Set a single-choice parameter, clearing it when it is the default. */
  function choose(key: string, value: string, fallback: string) {
    update({ [key]: value === fallback ? null : value }, { resetPage: true });
  }

  const labelFor = (options: Option[], value: string) =>
    options.find((option) => option.value === value)?.label ?? value;

  const pills: { key: string; label: string; onRemove: () => void }[] = [
    ...(query ? [{ key: "q", label: `“${query}”`, onRemove: () => update({ q: null }, { resetPage: true }) }] : []),
    ...(investor
      ? [{ key: "investor", label: investor, onRemove: () => update({ investor: null }, { resetPage: true }) }]
      : []),
    ...(date !== "all"
      ? [{ key: "date", label: labelFor(DATE_OPTIONS, date), onRemove: () => choose("date", "all", "all") }]
      : []),
    ...stages.map((value) => ({
      key: `stage-${value}`,
      label: labelFor(STAGE_OPTIONS, value),
      onRemove: () => commitList("stage", stages.filter((token) => token !== value)),
    })),
    ...industries.map((value) => ({
      key: `industry-${value}`,
      label: labelFor(INDUSTRY_OPTIONS, value),
      onRemove: () => commitList("industry", industries.filter((token) => token !== value)),
    })),
    ...geos.map((value) => ({
      key: `geo-${value}`,
      label: labelFor(GEO_OPTIONS, value),
      onRemove: () => commitList("geo", geos.filter((token) => token !== value)),
    })),
    ...(amount !== "any"
      ? [{ key: "amount", label: labelFor(AMOUNT_OPTIONS, amount), onRemove: () => choose("amount", "any", "any") }]
      : []),
  ];

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
        <FundingSearch
          compact
          className="lg:max-w-sm lg:flex-1"
          placeholder="Search startups, investors, sectors, cities…"
        />

        {/* One row; scrolls sideways on a phone rather than wrapping or
            pushing the page wider. `-mx-1 px-1` keeps focus rings unclipped. */}
        <div
          className="no-scrollbar -mx-1 flex min-w-0 items-center gap-2 overflow-x-auto px-1 py-0.5"
          role="group"
          aria-label="Filter funding rounds"
        >
          <SingleMenu
            label="Date"
            options={DATE_OPTIONS}
            value={date}
            fallback="all"
            onChange={(value) => choose("date", value, "all")}
          />
          <MultiMenu
            label="Stage"
            options={STAGE_OPTIONS}
            selected={stages}
            onCommit={(next) => commitList("stage", next)}
          />
          <MultiMenu
            label="Industry"
            options={INDUSTRY_OPTIONS}
            selected={industries}
            onCommit={(next) => commitList("industry", next)}
          />
          <MultiMenu
            label="Geography"
            options={GEO_OPTIONS}
            selected={geos}
            onCommit={(next) => commitList("geo", next)}
          />
          <SingleMenu
            label="Amount"
            options={AMOUNT_OPTIONS}
            value={amount}
            fallback="any"
            onChange={(value) => choose("amount", value, "any")}
          />
          <span aria-hidden="true" className="mx-0.5 h-5 w-px shrink-0 bg-border" />
          <SingleMenu
            label="Sort"
            options={SORT_OPTIONS}
            value={sort}
            fallback="recent"
            showValue
            onChange={(value) => choose("sort", value, "recent")}
          />
        </div>
      </div>

      {pills.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {pills.map((pill) => (
            <button
              key={pill.key}
              type="button"
              onClick={pill.onRemove}
              aria-label={`Remove filter ${pill.label}`}
              className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/8 py-1 pr-2 pl-2.5 text-xs font-medium text-primary transition-colors pointer-coarse:min-h-9 hover:bg-primary/15"
            >
              {pill.label}
              <X className="size-3" aria-hidden="true" />
            </button>
          ))}
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
            className="rounded-md px-2 py-1 text-xs font-semibold text-muted transition-colors pointer-coarse:min-h-9 hover:text-ink"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}

const triggerClass =
  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium whitespace-nowrap transition-colors outline-none pointer-coarse:h-11 focus-visible:ring-2 focus-visible:ring-ring/50";

function triggerTone(active: boolean) {
  return active
    ? "border-primary/40 bg-primary/8 text-primary"
    : "border-border bg-card text-body hover:border-primary/30 hover:bg-secondary-bg";
}

function SingleMenu({
  label,
  options,
  value,
  fallback,
  onChange,
  showValue = false,
}: {
  label: string;
  options: Option[];
  value: string;
  fallback: string;
  onChange: (value: string) => void;
  /** Always show the chosen value (Sort), rather than only when it is not the default. */
  showValue?: boolean;
}) {
  const active = value !== fallback;
  const current = options.find((option) => option.value === value)?.label;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn(triggerClass, triggerTone(active && !showValue))}>
        {label}
        {(active || showValue) && current && (
          <span className={cn("font-semibold", showValue && !active ? "text-ink" : undefined)}>
            : {current}
          </span>
        )}
        <ChevronDown className="size-3.5 opacity-60" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-52">
        <DropdownMenuRadioGroup value={value} onValueChange={(next) => onChange(String(next))}>
          {options.map((option) => (
            <DropdownMenuRadioItem
              key={option.value}
              value={option.value}
              closeOnClick
              className="py-2 pointer-coarse:min-h-11"
            >
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * A multi-choice menu that commits on close.
 *
 * While open, ticks go into a local draft; closing the menu (click away, Esc,
 * or "Apply") writes the draft to the URL once, and only if it changed.
 */
function MultiMenu({
  label,
  options,
  selected,
  onCommit,
}: {
  label: string;
  options: Option[];
  selected: string[];
  onCommit: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(selected);

  function handleOpenChange(next: boolean) {
    if (next) {
      setDraft(selected);
    } else {
      const changed =
        draft.length !== selected.length || draft.some((token) => !selected.includes(token));
      // Preserve the menu's own order so the URL is stable for the same set.
      if (changed) onCommit(options.map((o) => o.value).filter((v) => draft.includes(v)));
    }
    setOpen(next);
  }

  const count = selected.length;
  const summary =
    count === 1 ? options.find((option) => option.value === selected[0])?.label : null;

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger className={cn(triggerClass, triggerTone(count > 0))}>
        {label}
        {summary ? (
          <span className="font-semibold">: {summary}</span>
        ) : count > 1 ? (
          <span className="inline-flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
            {count}
          </span>
        ) : null}
        <ChevronDown className="size-3.5 opacity-60" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={draft.includes(option.value)}
            onCheckedChange={(checked) =>
              setDraft((previous) =>
                checked
                  ? [...previous.filter((token) => token !== option.value), option.value]
                  : previous.filter((token) => token !== option.value),
              )
            }
            className="py-2 pointer-coarse:min-h-11"
          >
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}
        <div className="mt-1 flex items-center justify-between gap-2 border-t border-border px-1.5 pt-1.5 pb-0.5">
          <button
            type="button"
            onClick={() => setDraft([])}
            className="rounded-md px-2 py-1.5 text-xs font-medium text-muted hover:text-ink"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={() => handleOpenChange(false)}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-active"
          >
            Apply
          </button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
