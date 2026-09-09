"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { cn } from "@/lib/utils";
import { FUNDING_REFRESH_INTERVAL_MS } from "@/lib/funding/constants";
import { relativeTime } from "@/lib/funding/format";

/**
 * The freshness indicator, and the thing that keeps the feed fresh.
 *
 * What it claims, and why the wording is what it is
 * -------------------------------------------------
 * "Live feed" describes the *page* — it re-checks the server every five minutes
 * and new rounds appear without a reload. The timestamp beside it describes the
 * *data*, and it is computed from the newest article's own publication time,
 * not from when we last ran an ingestion. Those are different facts and the
 * component says both, because the tempting single claim — "updated 2 minutes
 * ago" meaning "we checked 2 minutes ago" — would read as "there is news from 2
 * minutes ago", which is exactly the fake liveness this feature is not allowed
 * to manufacture. On a quiet Sunday this correctly reads "Last updated 2 days
 * ago", and that is the honest answer.
 *
 * How the refresh works
 * ---------------------
 * `router.refresh()` on an interval, not a Supabase Realtime subscription.
 * Realtime is not enabled on this project — nothing in the codebase opens a
 * channel — and enabling it to push rows that arrive a few times an hour would
 * be a subscription per visitor for an event that is rarer than the polling
 * interval. A refresh re-runs the server component, which reads through a
 * two-minute cache, so the cost of a tick is usually a cache hit.
 *
 * The interval is paused while the tab is hidden. A background tab polling a
 * news feed forever is the version of this that shows up in someone's battery
 * report.
 */
export function FundingLiveIndicator({
  /** ISO timestamp of the newest published round's source article. */
  lastUpdatedAt,
  /** Server-rendered label, so the first paint matches and hydration is clean. */
  initialLabel,
  className,
  tone = "light",
}: {
  lastUpdatedAt: string | null;
  initialLabel: string | null;
  className?: string;
  tone?: "light" | "dark";
}) {
  const router = useRouter();
  const reducedMotion = usePrefersReducedMotion();
  const [label, setLabel] = useState(initialLabel);

  // Recompute the relative label on the client so "2 minutes ago" does not
  // stay frozen at whatever it was when the page was rendered. Runs after
  // mount, so the server and client agree on the first paint.
  useEffect(() => {
    if (!lastUpdatedAt) return;

    const tick = () => setLabel(relativeTime(lastUpdatedAt));
    tick();
    const timer = setInterval(tick, 30_000);
    return () => clearInterval(timer);
  }, [lastUpdatedAt]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      timer = setInterval(() => router.refresh(), FUNDING_REFRESH_INTERVAL_MS);
    };
    const stop = () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // Coming back to the tab is exactly when someone wants the current
        // state, so refresh immediately rather than waiting out the interval.
        router.refresh();
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

  const onDark = tone === "dark";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium",
        onDark
          ? "border-white/15 bg-white/5 text-white/80"
          : "border-border bg-card text-body",
        className,
      )}
      title="This page checks for newly published rounds every few minutes. The time shown is when the most recent story was published by its source."
    >
      <span className="relative flex size-2 shrink-0">
        {/* The pulse is decorative and honest: it marks a page that polls, not
            data that just arrived. Suppressed under reduced-motion, where a
            steady dot carries the same meaning. */}
        {!reducedMotion && (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
        )}
        <span className="relative inline-flex size-2 rounded-full bg-success" />
      </span>
      Live feed
      {label && (
        <>
          <span aria-hidden="true" className={onDark ? "text-white/25" : "text-border"}>
            ·
          </span>
          <span className={onDark ? "text-white/60" : "text-muted"}>Last updated {label}</span>
        </>
      )}
    </span>
  );
}
