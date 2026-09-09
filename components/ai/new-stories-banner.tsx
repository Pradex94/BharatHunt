"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

import { countNewAiStories } from "@/lib/actions/ai-news";

/**
 * "5 new AI stories · Refresh" (section 25).
 *
 * The requirement worth restating, because it is the part that is easy to get
 * wrong: **the page must not rearrange itself under a reader.** Ingestion runs
 * every ten minutes and can reorder the entire feed, so the tempting version of
 * this feature — quietly swapping in fresh data — is precisely the version that
 * loses somebody's place mid-sentence. So this only ever *offers*, and the
 * reader decides.
 *
 * Why polling rather than Supabase Realtime: Realtime is not enabled on this
 * project, and turning it on for this would mean a websocket per visitor and a
 * publication for every row an ingestion run writes — hundreds of messages
 * every ten minutes, to tell each reader a number that changes at most six times
 * an hour. One cheap count on an interval is the proportionate mechanism. If
 * Realtime is ever configured, this component is the only thing that has to
 * change.
 *
 * The poll costs one HEAD count against an indexed predicate, is rate-limited
 * per IP on the server, and stops entirely while the tab is hidden.
 */
const POLL_INTERVAL_MS = 90_000;

export function NewStoriesBanner({ since }: { since: string }) {
  const router = useRouter();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      // A background tab is not reading, so it does not need to be told about
      // new stories — and a hundred idle tabs polling is exactly how a cheap
      // count becomes an expensive one.
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;

      try {
        const next = await countNewAiStories(since);
        if (!cancelled) setCount(next);
      } catch {
        // A failed count is not worth surfacing: the page is still correct, it
        // just does not know about anything newer yet.
      }
    };

    const timer = setInterval(check, POLL_INTERVAL_MS);
    // Checks immediately when a reader comes back to the tab, which is the
    // moment the answer is most likely to have changed and most likely to matter.
    document.addEventListener("visibilitychange", check);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
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
