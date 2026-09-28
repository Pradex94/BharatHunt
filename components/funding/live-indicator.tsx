"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import {
  FUNDING_REFOCUS_MIN_INTERVAL_MS,
  FUNDING_REFRESH_INTERVAL_MS,
} from "@/lib/funding/constants";
import { formatIstDateTime, relativeTime } from "@/lib/funding/format";

/**
 * The freshness line, and the thing that keeps the page fresh.
 *
 * What it claims, and why the wording is what it is
 * -------------------------------------------------
 * Two facts, never merged into one:
 *
 *   - "Last synced 3 hours ago" — when ingestion last completed a run
 *     (`funding_last_sync`). This is when we last *checked*.
 *   - "Newest round 2 days ago" — the newest published round's source time.
 *     This is how fresh the *data* is.
 *
 * On a quiet day the first is recent and the second is old, and saying only
 * the first would read as "there is news from 3 hours ago". Ingestion runs
 * once a day plus manual runs (.github/workflows/ingest.yml), so the word
 * "live" and a pulsing dot — which this used to have — overstated it; the dot
 * is now static and the label says "synced". When the sync time is unknown the
 * line falls back to the newest-round time alone.
 *
 * How the refresh works
 * ---------------------
 * `router.refresh()` on a long interval, paused while the tab is hidden, plus
 * one on return to a tab that is some minutes old. Not Realtime: nothing on
 * this project opens a channel, and a refresh re-renders the page on the
 * server, which costs Worker CPU — see FUNDING_REFRESH_INTERVAL_MS.
 */
export function FundingLiveIndicator({
  lastSyncedAt,
  latestRoundAt,
  renderedAt,
  className,
}: {
  /** ISO timestamp of the last completed ingestion run, if known. */
  lastSyncedAt: string | null;
  /** ISO timestamp of the newest published round's source article. */
  latestRoundAt: string | null;
  /** The server's clock at render, so the first client paint computes identical labels. */
  renderedAt: string;
  className?: string;
}) {
  const router = useRouter();

  // Relative labels are recomputed after mount so "2 minutes ago" does not
  // freeze at render time. The server renders the same function, so the first
  // paint matches and hydration is clean.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const timer = setInterval(tick, 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    // The server render this component arrived in counts as a refresh.
    let lastRefreshAt = Date.now();

    const refresh = () => {
      lastRefreshAt = Date.now();
      router.refresh();
    };
    const start = () => {
      if (timer) return;
      timer = setInterval(refresh, FUNDING_REFRESH_INTERVAL_MS);
    };
    const stop = () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (Date.now() - lastRefreshAt >= FUNDING_REFOCUS_MIN_INTERVAL_MS) refresh();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [router]);

  const clock = now ?? new Date(renderedAt);
  const synced = relativeTime(lastSyncedAt, clock);
  const latest = relativeTime(latestRoundAt, clock);
  if (!synced && !latest) return null;

  const title = [
    lastSyncedAt && `Last sync completed ${formatIstDateTime(lastSyncedAt)}.`,
    latestRoundAt && `Newest round published by its source ${formatIstDateTime(latestRoundAt)}.`,
    "Sources are checked daily; this page re-checks for new rounds periodically.",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <p
      className={cn(
        "inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-body",
        className,
      )}
      title={title}
    >
      <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-success" />
      {synced ? (
        <span>Last synced {synced}</span>
      ) : (
        <span>Updated daily</span>
      )}
      {latest && (
        <>
          <span aria-hidden="true" className="text-border">
            ·
          </span>
          <span className="text-muted">Newest round {latest}</span>
        </>
      )}
    </p>
  );
}
