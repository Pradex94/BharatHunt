"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

import { countNewAiStories } from "@/lib/actions/ai-news";

/**
 * "5 new AI stories · Refresh" (section 25).
 *
 * The requirement worth restating, because it is the part that is easy to get
 * wrong: **the page must not rearrange itself under a reader.** An ingestion
 * run can land while someone is reading and reorder the entire feed, so the tempting version of
 * this feature — quietly swapping in fresh data — is precisely the version that
 * loses somebody's place mid-sentence. So this only ever *offers*, and the
 * reader decides.
 *
 * Why polling rather than Supabase Realtime: Realtime is not enabled on this
 * project, and turning it on for this would mean a websocket per visitor and a
 * publication for every row an ingestion run writes, to tell each reader a
 * number that changes when an ingestion run lands — once a day
 * (.github/workflows/ingest.yml), plus an admin's "Run now". One cheap count on
 * an interval is the proportionate mechanism. If Realtime is ever configured,
 * this component is the only thing that has to change.
 *
 * The count itself is one HEAD query, but it arrives as a Server Action: a POST
 * that runs the middleware, the global rate limiter and the action — a full
 * Worker invocation each time. At the old 90 seconds that was 40 invocations an
 * hour per open tab to watch a number that moves daily. Fifteen minutes still
 * catches a manual run while someone is reading, and the poll stops entirely
 * while the tab is hidden.
 */
const POLL_INTERVAL_MS = 15 * 60 * 1000;

/**
 * The least time between two checks triggered by returning to the tab, so that
 * flicking between tabs does not send a Server Action per glance.
 */
const REFOCUS_MIN_INTERVAL_MS = 5 * 60 * 1000;

export function NewStoriesBanner({ since }: { since: string }) {
  const router = useRouter();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // The render this arrived in is as fresh as a check.
    let lastCheckAt = Date.now();

    const check = async () => {
      // A background tab is not reading, so it does not need to be told about
      // new stories — and a hundred idle tabs polling is exactly how a cheap
      // count becomes an expensive one.
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      lastCheckAt = Date.now();

      try {
        const next = await countNewAiStories(since);
        if (!cancelled) setCount(next);
      } catch {
        // A failed count is not worth surfacing: the page is still correct, it
        // just does not know about anything newer yet.
      }
    };

    const timer = setInterval(check, POLL_INTERVAL_MS);
    // Checks when a reader comes back to the tab, which is the moment the
    // answer is most likely to have changed and most likely to matter — unless
    // the last answer is only minutes old.
    const onVisibilityChange = () => {
      if (Date.now() - lastCheckAt >= REFOCUS_MIN_INTERVAL_MS) void check();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [since]);

  if (count <= 0) return null;

  return (
    <div className="sticky top-20 z-30 mx-auto flex w-max max-w-full items-center gap-3 rounded-full border border-primary/20 bg-card px-4 py-2 shadow-soft">
      <span className="text-sm font-semibold text-ink">
        {count} new AI {count === 1 ? "story" : "stories"}
      </span>
      <button
        type="button"
        onClick={() => {
          setCount(0);
          // `router.refresh()` re-fetches the server components in place, so the
          // reader keeps their scroll position and their filters instead of
          // being sent back to the top of a fresh page load.
          router.refresh();
        }}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-primary px-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
      >
        <RefreshCw aria-hidden="true" className="size-3.5" />
        Refresh
      </button>
    </div>
  );
}
