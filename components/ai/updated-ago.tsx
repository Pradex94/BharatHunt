"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { freshness } from "@/lib/ai-news/format";

/**
 * "Updated 4 minutes ago", and the reason it is a client component.
 *
 * A relative timestamp rendered once on the server is correct for exactly one
 * instant. Recomputing it in the browser on first render is the classic
 * hydration mismatch — the server's clock and the reader's are minutes apart on
 * a cached page — so this renders the **server's string** first and only starts
 * recomputing after mount. The text therefore matches the HTML exactly at
 * hydration and then ticks on its own.
 *
 * It never says "Live", and that is a product decision, not an oversight. This
 * pipeline is a scheduled poll of RSS feeds and public APIs; the fastest source
 * is checked every fifteen minutes, and the publishers themselves are minutes
 * to hours behind the events. "Live" would be a claim about the *world* that
 * nothing here can support. "Updated N ago" is a claim about our own pipeline,
 * and it is one we can prove.
 *
 * When the last successful run is older than `FRESHNESS_STALE_MINUTES` it stops
 * claiming freshness at all and says so — section 31's "ingestion temporarily
 * unavailable", rendered in the one place a reader would otherwise be misled.
 */
export function UpdatedAgo({
  lastSuccessAt,
  initialLabel,
  initialStale,
  storiesToday,
  className,
}: {
  lastSuccessAt: string | null;
  /** What the server rendered, so hydration has nothing to disagree about. */
  initialLabel: string | null;
  initialStale: boolean;
  storiesToday: number;
  className?: string;
}) {
  const [state, setState] = useState({ label: initialLabel, stale: initialStale });

  useEffect(() => {
    if (!lastSuccessAt) return;

    const tick = () => {
      const next = freshness(lastSuccessAt, new Date());
      setState({ label: next.label, stale: next.stale });
    };

    // Not on mount — the server's value is still right to the minute, and
    // setting state in the first effect would re-render every card behind this
    // for nothing. A minute is also the resolution of the string itself.
    const timer = setInterval(tick, 60_000);
    return () => clearInterval(timer);
  }, [lastSuccessAt]);

  if (!state.label) {
    return (
      <p className={cn("text-sm text-white/60", className)}>
        News ingestion has not run yet.
      </p>
    );
  }

  if (state.stale) {
    return (
      <p className={cn("flex items-center gap-2 text-sm text-white/60", className)}>
        <span aria-hidden="true" className="size-1.5 rounded-full bg-warning" />
        Ingestion is behind — last completed run was {state.label.replace(/^Updated /, "")}.
      </p>
    );
  }

  return (
    <p className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-white/70", className)}>
      {/* A quiet dot, not a pulsing "LIVE" chip. It marks that the pipeline is
          current; it does not imply a stream. */}
      <span aria-hidden="true" className="size-1.5 rounded-full bg-primary" />
      <span>{state.label}</span>
      {storiesToday > 0 ? (
        <>
          <span aria-hidden="true" className="text-white/30">
            ·
          </span>
          <span>
            {storiesToday} {storiesToday === 1 ? "story" : "stories"} in the last 24 hours
          </span>
        </>
      ) : null}
    </p>
  );
}
