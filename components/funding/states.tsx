import Link from "next/link";
import { CalendarX, SearchX, ServerCrash } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * The empty, error and loading states.
 *
 * Collected in one file because they are the same design problem: what the page
 * shows when it has nothing to show. The rule they all follow is that they say
 * which of the several possible nothings this is — nothing announced today, no
 * results for *these* filters, no rounds at all yet, or a query that failed —
 * because the reader's next move is different in each case.
 *
 * None of them shows placeholder content. A skeleton is a shape; sample rows
 * dressed as data are the thing this feature is not allowed to do.
 */

const panel =
  "flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center";
const secondaryButton =
  "inline-flex items-center rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-ink transition-colors pointer-coarse:min-h-11 hover:border-primary/30 hover:bg-secondary-bg";

/** No rounds match the current filters — but the dataset is not empty. */
export function NoResults({ query, hasFilters }: { query: string | null; hasFilters: boolean }) {
  return (
    <div className={panel}>
      <span className="flex size-11 items-center justify-center rounded-full bg-secondary-bg text-muted">
        <SearchX className="size-5" aria-hidden="true" />
      </span>
      <p className="text-sm font-semibold text-ink">
        {query ? (
          <>
            No funding rounds match <span className="text-primary">&ldquo;{query}&rdquo;</span>
          </>
        ) : (
          "No funding rounds match your filters."
        )}
      </p>
      <p className="max-w-md text-sm text-muted">
        {hasFilters
          ? "Try removing one or more filters, or widening the date range."
          : "Nothing has been published in this view yet."}
      </p>
      {hasFilters && (
        <Link href="/funding#funding-feed" className={secondaryButton}>
          Clear all filters
        </Link>
      )}
    </div>
  );
}

/**
 * The "Today" filter found nothing. Not an error and not a narrow filter —
 * rounds are published after review, and most days' news lands in batches.
 */
export function NoFundingToday() {
  return (
    <div className={panel}>
      <span className="flex size-11 items-center justify-center rounded-full bg-secondary-bg text-muted">
        <CalendarX className="size-5" aria-hidden="true" />
      </span>
      <p className="text-sm font-semibold text-ink">No funding rounds published today yet</p>
      <p className="max-w-md text-sm text-muted">
        Sources are checked daily and each round is reviewed before it appears. The last week is a
        better view in the meantime.
      </p>
      <Link href="/funding?date=7d#funding-feed" className={secondaryButton}>
        See the last 7 days
      </Link>
    </div>
  );
}

/** The dataset itself is empty — nothing has been ingested and published yet. */
export function NoFundingYet() {
  return (
    <div className={panel}>
      <p className="text-sm font-semibold text-ink">No funding rounds published yet</p>
      <p className="max-w-lg text-sm text-muted">
        The feed fills as sources are checked, rounds are extracted and a reviewer publishes them.
        Nothing is shown in the meantime — no sample rows, no placeholder companies.
      </p>
      <Link href="/funding/guides" className={secondaryButton}>
        Read the fundraising guides
      </Link>
    </div>
  );
}

/**
 * A read failed. Distinct from "nothing found", and it says so: "there is no
 * news" and "we could not fetch the news" call for different reactions, and
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

export function KpiSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 xl:grid-cols-6">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-16" />
          <Skeleton className="h-2.5 w-24" />
        </div>
      ))}
    </div>
  );
}

export function RoundListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-4 w-40" />
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 sm:p-6"
        >
          <div className="flex items-start gap-3">
            <Skeleton className="size-11 shrink-0 rounded-xl" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-full max-w-md" />
            </div>
            <Skeleton className="hidden h-7 w-24 sm:block" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-14" />
            <Skeleton className="h-5 w-20" />
          </div>
          <Skeleton className="h-3 w-3/5" />
          <div className="flex justify-between gap-2 border-t border-border pt-3">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function TrendsSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-8 w-48" />
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex h-48 items-end gap-3">
          {[40, 65, 50, 80, 60, 90].map((height, index) => (
            <Skeleton key={index} className="flex-1 rounded-t-md" style={{ height: `${height}%` }} />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
            <Skeleton className="h-4 w-32" />
            {Array.from({ length: 5 }).map((__, row) => (
              <div key={row} className="flex flex-col gap-1.5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function RankingSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-8 w-56" />
      <div className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-card">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="flex items-center gap-4 px-5 py-4">
            <Skeleton className="h-3 w-5" />
            <Skeleton className="h-4 w-36" />
            <Skeleton className="ml-auto h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
