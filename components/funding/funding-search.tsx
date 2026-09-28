"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SearchIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/use-debounce";
import { useUpdateSearchParams } from "@/hooks/use-update-search-params";

/**
 * Search across the funding dataset.
 *
 * One field, not five. "Zepto", "Fintech", "Series A", "Sequoia" and "Delhi"
 * are all typed into the same box and all resolve server-side against one
 * generated column (`funding_rounds.search_text`, GIN-indexed for trigram
 * matching) — so there is no client-side index, no downloaded dataset, and no
 * separate "search by investor" control to explain.
 *
 * Debounced at 400ms and written to `?q=`, which means a search is a URL. Same
 * pattern as the marketplace search, deliberately.
 *
 * The field follows the URL as well as writing to it: when `?q=` changes from
 * somewhere else — "Clear all", a removed pill, the hero search, the back
 * button — the text updates to match instead of showing a query that is no
 * longer applied. And it never navigates to the URL it is already on, which
 * would be a server render of an identical page.
 */
export function FundingSearch({
  className,
  placeholder = "Search startups, investors, sectors, cities…",
  compact = false,
}: {
  className?: string;
  placeholder?: string;
  /** Toolbar height (36px) rather than the standalone 48px field. */
  compact?: boolean;
}) {
  const searchParams = useSearchParams();
  const updateSearchParams = useUpdateSearchParams();
  const urlQuery = searchParams.get("q") ?? "";

  const [value, setValue] = useState(urlQuery);
  const debouncedValue = useDebounce(value, 400);

  // Adjust-during-render, React's pattern for "reset state when a prop
  // changes": an effect would paint the stale text first. A URL that equals
  // the debounced value is this field's own push arriving back — possibly
  // while the user has typed further — so only an outside change overwrites.
  const [syncedQuery, setSyncedQuery] = useState(urlQuery);
  if (urlQuery !== syncedQuery) {
    setSyncedQuery(urlQuery);
    if (urlQuery !== debouncedValue.trim()) setValue(urlQuery);
  }

  useEffect(() => {
    const next = debouncedValue.trim();
    // Covers the first render too: the value already in the URL is not a
    // navigation, and pushing it would replace the entry the user arrived on.
    if (next === (searchParams.get("q") ?? "").trim()) return;
    updateSearchParams({ q: next || null }, { resetPage: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedValue]);

  return (
    <div
      className={cn(
        "relative flex w-full items-center gap-2.5 rounded-xl border border-border bg-card shadow-xs transition-colors focus-within:border-primary",
        compact ? "h-9 rounded-lg px-3 pointer-coarse:h-11" : "px-4 py-3",
        className,
      )}
    >
      <SearchIcon aria-hidden="true" className="size-4 shrink-0 text-muted" />
      <Input
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        aria-label="Search funding rounds"
        // The bordered wrapper is the control; cancelling Input's own touch
        // height stops a 44px field nesting inside a 44px box.
        className={cn(
          "h-auto border-none bg-transparent p-0 shadow-none pointer-coarse:h-auto focus-visible:ring-0",
          compact && "text-sm",
        )}
      />
    </div>
  );
}
