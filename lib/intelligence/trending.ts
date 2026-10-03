import "server-only";

import { cacheInvalidatePrefix } from "@/lib/cache";
import { isMissingTableError } from "@/lib/supabase/errors";
import { createServiceClient } from "@/lib/supabase/service";
import { PRODUCTS_CACHE_PREFIX } from "@/services/products";

import { INTELLIGENCE_CACHE_PREFIX } from "./cache-keys";

/**
 * Trending / rising, recalculated by `public.refresh_discovery_signals()`
 * (20261004000000) — set-based SQL over daily rollups, one call per hour.
 *
 * The weights live here, in code review, rather than baked into the function:
 * the SQL takes them as arguments. What each one means:
 *   - halfLifeDays: how fast attention fades. 2.5 → yesterday counts ~76%,
 *     last week ~15%. A product's history cannot keep it trending.
 *   - minRising: engagement needed in the last 3 days before "rising" is
 *     considered at all, so one visit to a quiet product is not acceleration.
 *   - weights: per unique visitor (never per raw view), per outbound click,
 *     save, compare, comment, upvote, Product Match click and search click.
 *     Deliberate actions outweigh passing attention.
 */
export const TRENDING_CONFIG = {
  halfLifeDays: 2.5,
  minRising: 6,
  weights: {
    visitor: 1,
    click: 3,
    save: 4,
    compare: 3,
    comment: 5,
    upvote: 3,
    matchClick: 2,
    searchClick: 1,
  },
} as const;

export type SignalRefreshResult =
  | { ok: true; rolledUp: number; scored: number; purgedEvents: number }
  | { ok: false; error: string };

export async function refreshDiscoverySignals(): Promise<SignalRefreshResult> {
  const { halfLifeDays, minRising, weights } = TRENDING_CONFIG;
  const { data, error } = await createServiceClient().rpc("refresh_discovery_signals", {
    half_life_days: halfLifeDays,
    min_rising: minRising,
    w_visitor: weights.visitor,
    w_click: weights.click,
    w_save: weights.save,
    w_compare: weights.compare,
    w_comment: weights.comment,
    w_upvote: weights.upvote,
    w_match_click: weights.matchClick,
    w_search_click: weights.searchClick,
  });

  if (error) {
    return {
      ok: false,
      error:
        isMissingTableError(error) || error.code === "PGRST202"
          ? "Signal tables are missing — apply migration 20261004000000_discovery_signals_and_lists.sql."
          : `Could not refresh signals: ${error.message}`,
    };
  }

  // Trending and Rising order the marketplace lists, which are cached.
  await Promise.all([
    cacheInvalidatePrefix(PRODUCTS_CACHE_PREFIX),
    cacheInvalidatePrefix(INTELLIGENCE_CACHE_PREFIX),
  ]);

  const result = (data ?? {}) as { rolled_up?: number; scored?: number; purged_events?: number };
  return {
    ok: true,
    rolledUp: result.rolled_up ?? 0,
    scored: result.scored ?? 0,
    purgedEvents: result.purged_events ?? 0,
  };
}
