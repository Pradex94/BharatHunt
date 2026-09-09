"use client";

import { useState, useTransition } from "react";

import { FundingRoundCard } from "@/components/funding/round-card";
import { loadMoreFundingRounds } from "@/lib/actions/funding";
import type { FundingSearchParams } from "@/lib/funding/filters";
import type { FundingRoundRow } from "@/services/funding";

/**
 * The accumulating feed.
 *
 * The server renders page 1 as static markup (`FundingRoundCard` is a server
 * component), and this only takes over when someone asks for more — so the
 * first screenful costs no client-side rendering, and the interactive part is a
 * button and an array.
 *
 * `params` is passed through verbatim rather than as a resolved query, and the
 * action re-parses it with the same `parseFundingFilters` the page used. That
 * is what makes the endpoint safe to expose: whatever is posted, the query that
 * reaches the database is the bounded, whitelisted one.
 */
export function FundingRoundList({
  initialRounds,
  initialPage,
  initialHasMore,
  params,
}: {
  initialRounds: FundingRoundRow[];
  initialPage: number;
  initialHasMore: boolean;
  params: FundingSearchParams;
}) {
  const [rounds, setRounds] = useState(initialRounds);
  const [page, setPage] = useState(initialPage);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  /*
   * Reset when the server sends a different first page.
   *
   * The parent gives this component a `key` derived from the filter set, so a
   * filter change remounts it. This covers the case that does not remount — a
   * `router.refresh()` from the live indicator, which replaces the props in
   * place — where without it the accumulated pages 2..n would sit underneath a
   * freshly-fetched page 1 and duplicate rows.
   *
   * Adjusted during render rather than in an effect. This is React's documented
   * pattern for "reset state when a prop changes" and it is the correct one
   * here: an effect would render the stale list first and then immediately
   * re-render, which is both a wasted pass and a visible flash of the old
   * feed. Comparing identity is enough — the server hands back a new array on
   * every refresh.
   */
  const [renderedFrom, setRenderedFrom] = useState(initialRounds);
  if (renderedFrom !== initialRounds) {
    setRenderedFrom(initialRounds);
    setRounds(initialRounds);
    setPage(initialPage);
    setHasMore(initialHasMore);
    setError(null);
  }

  function handleLoadMore() {
    setError(null);
    startTransition(async () => {
      const nextPage = page + 1;
      const result = await loadMoreFundingRounds(params, nextPage);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      // Guard against a double-submit or a retry landing the same page twice.
      setRounds((previous) => {
        const seen = new Set(previous.map((round) => round.id));
        return [...previous, ...result.rounds.filter((round) => !seen.has(round.id))];
      });
      setPage(nextPage);
      setHasMore(result.hasMore);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4">
        {rounds.map((round) => (
          <FundingRoundCard key={round.id} round={round} />
        ))}
      </div>

      {error && (
        <p role="alert" className="text-center text-sm text-destructive">
          {error}
        </p>
      )}

      {hasMore && (
        <div className="pt-2 text-center">
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={isPending}
            className="inline-block rounded-md border border-border bg-card px-6 py-2.5 text-sm font-medium text-ink transition-colors duration-150 outline-none pointer-coarse:min-h-11 hover:bg-secondary-bg focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-60"
          >
            {isPending ? "Loading…" : "Load more rounds"}
          </button>
        </div>
      )}
    </div>
  );
}
