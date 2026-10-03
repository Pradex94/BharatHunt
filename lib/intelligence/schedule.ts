import "server-only";

import { after } from "next/server";

import { reindexProductIntelligence } from "./reindex";

/**
 * Refresh Product Intelligence after the response, when the catalogue just
 * changed: a Daily 5 pick published, a maker launch approved, a listing edited
 * or deleted. The new product gets its knowledge and similar products within
 * seconds instead of waiting for the hourly job — so a Daily 5 discovery is
 * eligible for Product Match, similar products and comparisons the moment it
 * goes live, like any other launch.
 *
 * Cheap by construction: the indexer compares content hashes and skips
 * unchanged products, and only rewrites similarity when something changed.
 * Never throws and never delays the request; the hourly job is the backstop.
 */
export function scheduleIntelligenceRefresh(reason: string): void {
  try {
    after(async () => {
      try {
        const result = await reindexProductIntelligence();
        console.log(JSON.stringify({ event: "intelligence_refresh", reason, ...result, at: new Date().toISOString() }));
      } catch (error) {
        console.error(`[intelligence] refresh after ${reason} failed:`, error instanceof Error ? error.message : error);
      }
    });
  } catch {
    // Outside a request scope (a script, a test): the hourly job covers it.
  }
}
