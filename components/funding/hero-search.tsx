"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { SearchIcon } from "lucide-react";

import { useUpdateSearchParams } from "@/hooks/use-update-search-params";

/**
 * The hero's search box.
 *
 * Submit-based rather than search-as-you-type, unlike the toolbar field. The
 * hero sits above the fold and the results are a screen below it, so live
 * results would re-render a feed the reader cannot see while they type. Enter
 * (or the button) writes `?q=`, then brings the feed into view — where the
 * toolbar's field already shows the same query, because both read the URL.
 *
 * Keyed on the URL query so it resets when the query is cleared elsewhere.
 */
export function FundingHeroSearch() {
  const query = useSearchParams().get("q") ?? "";
  return <HeroSearchForm key={query} initial={query} />;
}

function HeroSearchForm({ initial }: { initial: string }) {
  const update = useUpdateSearchParams();
  const [value, setValue] = useState(initial);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = value.trim();
    if (next !== initial.trim()) update({ q: next || null }, { resetPage: true });
    document.getElementById("funding-feed")?.scrollIntoView({ block: "start" });
  }

  return (
    <form
      role="search"
      onSubmit={submit}
      className="flex w-full items-center gap-2 rounded-2xl border border-border bg-card p-1.5 pl-4 shadow-soft transition-colors focus-within:border-primary"
    >
      <SearchIcon aria-hidden="true" className="size-5 shrink-0 text-muted" />
      <input
        type="search"
        name="q"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Search startups, investors, sectors, cities…"
        aria-label="Search funding rounds by startup, investor, sector, city or stage"
        className="h-11 min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-muted-soft"
      />
      <button
        type="submit"
        className="btn-gradient inline-flex h-11 shrink-0 items-center justify-center rounded-xl px-4 text-sm font-semibold sm:px-6"
      >
        Search
      </button>
    </form>
  );
}
