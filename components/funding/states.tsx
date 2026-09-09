import Link from "next/link";
import { SearchX, ServerCrash } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * The empty, error and loading states.
 *
 * Collected in one file because they are the same design problem: what the page
 * shows when it has nothing to show. The rule they all follow is that they say
 * which of the several possible nothings this is — no rounds yet, no results
 * for *these* filters, or a query that failed — because the reader's next
 * action is different in each case, and a single generic "No data" leaves them
 * guessing whether the site is broken or their filter is too narrow.
 *
 * None of them shows placeholder content. A skeleton is a shape; sample rows
 * dressed as data are the thing this feature is not allowed to do.
 */

/** No rounds match the current filters — but the dataset is not empty. */
export function NoResults({ query, hasFilters }: { query: string | null; hasFilters: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-secondary-bg text-muted">
        <SearchX className="size-5" aria-hidden="true" />
      </span>
      <p className="text-sm font-semibold text-ink">
        {query ? (
          <>
            No funding rounds found for{" "}
            <span className="text-primary">&ldquo;{query}&rdquo;</span>
          </>
        ) : (
          "No funding updates found for this filter."
        )}
      </p>
      <p className="max-w-md text-sm text-muted">
        {hasFilters
          ? "Try widening the date range or clearing a filter — the combination you have picked has nothing in it yet."
          : "Nothing has been published in this view yet."}
      </p>
      {hasFilters && (
        <Link
          href="/funding"
          className="mt-1 inline-flex items-center rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold text-ink transition-colors pointer-coarse:min-h-11 hover:border-primary/30 hover:bg-secondary-bg"
        >
          Clear all filters
        </Link>
      )}
    </div>
  );
}

/** The dataset itself is empty — nothing has been ingested and published yet. */
export function NoFundingYet() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
      <p className="text-sm font-semibold text-ink">No funding rounds published yet</p>
      <p className="max-w-lg text-sm text-muted">
        The feed fills as sources are polled, rounds are extracted and a reviewer publishes them.
        Nothing is shown here in the meantime — no sample rows, no placeholder companies.
      </p>
      <Link
        href="/funding/guides"
        className="mt-1 inline-flex items-center rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold text-ink transition-colors pointer-coarse:min-h-11 hover:border-primary/30 hover:bg-secondary-bg"
      >
        Read the fundraising guides
      </Link>
    </div>
  );
}

/**
 * A read failed.
 *
 * Distinct from "nothing found", and it says so: the reader should know the
 * difference between "there is no news" and "we could not fetch the news", and
 * the second is worth retrying.
 */
export function FeedUnavailable() {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-destructive/30 bg-destructive/5 px-6 py-12 text-center"
    >
      <span className="flex size-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <ServerCrash className="size-5" aria-hidden="true" />
      </span>
      <p className="text-sm font-semibold text-ink">Funding data is temporarily unavailable</p>
      <p className="max-w-md text-sm text-muted">
        The database did not answer this request. Nothing is wrong with your filters — reload in a
        moment and it should come back.
      </p>
    </div>
  );
}

export function SnapshotSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-2 w-24" />
        </div>
      ))}
    </div>
  );
}

export function RoundListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-4">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 sm:p-6"
        >
          <div className="flex items-start justify-between gap-6">
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-full max-w-md" />
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-4 w-16 rounded-full" />
            </div>
          </div>
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
          <div className="flex gap-2 border-t border-border pt-3">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function TrendsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
          <Skeleton className="h-4 w-32" />
          {Array.from({ length: 5 }).map((__, row) => (
            <div key={row} className="flex flex-col gap-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-1.5 w-full rounded-full" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
