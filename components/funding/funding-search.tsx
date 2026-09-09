"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SearchIcon } from "lucide-react";

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
 * pattern as the marketplace search, deliberately: two search boxes on one site
 * that behave differently is a worse outcome than either behaviour.
 */
export function FundingSearch({ className }: { className?: string }) {
  const searchParams = useSearchParams();
  const updateSearchParams = useUpdateSearchParams();

  const [value, setValue] = useState(searchParams.get("q") ?? "");
  const debouncedValue = useDebounce(value, 400);
  const isFirstRender = useRef(true);

  useEffect(() => {
    // Without this guard the first render would push a navigation for the value
    // that is already in the URL, replacing the entry the user arrived on.
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    updateSearchParams({ q: debouncedValue.trim() || null }, { resetPage: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedValue]);

  return (
    <div
      className={
        className ??
        "relative flex w-full items-center gap-2.5 rounded-xl border border-border bg-card px-4 py-3 shadow-xs transition-colors focus-within:border-primary"
      }
    >
      <SearchIcon aria-hidden="true" className="size-4 shrink-0 text-muted" />
      <Input
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Search startups, investors, sectors, cities…"
        aria-label="Search funding rounds"
        // The bordered wrapper is the control; cancelling Input's own touch
        // height stops a 44px field nesting inside a 44px box.
        className="h-auto border-none bg-transparent p-0 shadow-none pointer-coarse:h-auto focus-visible:ring-0"
      />
    </div>
  );
}
