import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import { normalizeSearchText } from "@/lib/search";

/** Longer than this is a paste, not a search — store enough to be readable. */
const MAX_LOGGED_LENGTH = 120;

/**
 * Records that a search happened and how many results it found.
 *
 * The point is the zero-result report: a term people search repeatedly and
 * never match is a gap in the catalogue or a gap in the search. Grouping by
 * `query_normalized` collapses "grow easy", "Grow-Easy" and "GROWEASY" into
 * one row, while `query` keeps something a human can read.
 *
 * Nothing identifying is stored — no user id, no IP, no session (see the table
 * definition). Called from `after()` in the marketplace page so it never delays
 * the results.
 *
 * **Why the service client rather than the request-scoped one:** Next.js
 * forbids Server Components from touching `headers()`/`cookies()` inside an
 * `after` callback, and the normal client reads the Clerk token from headers —
 * so it fails there, silently. This write has no user context to carry anyway:
 * it is a system metric, not a user action. The service role grants nothing
 * extra here either, since `search_queries` accepts inserts from anon already;
 * it is used purely because it needs no request context.
 */
export async function recordSearch(query: string, resultCount: number): Promise<void> {
  const trimmed = query.trim();
  const normalized = normalizeSearchText(trimmed);

  // Nothing to learn from a query that normalises away to nothing.
  if (!normalized) return;

  try {
    const supabase = createServiceClient();
    // Supabase reports failures on the result object rather than throwing, so
    // a bare try/catch would swallow an error and leave the table silently
    // empty — which is exactly what happened the first time.
    const { error } = await supabase.from("search_queries").insert({
      query: trimmed.slice(0, MAX_LOGGED_LENGTH),
      query_normalized: normalized.slice(0, MAX_LOGGED_LENGTH),
      result_count: resultCount,
    });
    if (error) {
      console.error(`[search-analytics] insert failed: ${error.message}`);
    }
  } catch (error) {
    console.error("[search-analytics] insert threw:", error);
  }
}
