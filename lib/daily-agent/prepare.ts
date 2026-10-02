/**
 * Stage 1's cheap filtering, between discovery and anything that costs a
 * request: drop platform pages, key every candidate by its site (or its name,
 * when a headline gave no link), merge the same product found by two sources,
 * and keep the most promising `max`.
 *
 * Shared by the batch runner (lib/daily-agent/run.ts) and the dry-run script
 * (scripts/daily-agent-dry-run.mjs), so the script tests the real rule rather
 * than a copy. Pure, so `tests/` can pin it.
 */

import { isNotAProductSite, nameKey, normalizeSite } from "./domain.ts";
import type { RawCandidate } from "./types.ts";

export type PreparedCandidate = RawCandidate & {
  /** The duplicate key: registrable domain, or `name:<folded>` for a name-only candidate. */
  key: string;
  /** Canonical home URL, or null until a name-only candidate is resolved. */
  homeUrl: string | null;
};

export function prepareCandidates(raw: RawCandidate[], max: number): PreparedCandidate[] {
  const merged = new Map<string, PreparedCandidate>();
  for (const candidate of raw) {
    const site = candidate.websiteUrl ? normalizeSite(candidate.websiteUrl) : null;
    if (candidate.websiteUrl && (!site || isNotAProductSite(candidate.websiteUrl))) continue;
    const folded = nameKey(candidate.name);
    const key = site?.key ?? (folded.length >= 3 ? `name:${folded}` : null);
    if (!key) continue;
    const existing = merged.get(key);
    if (existing) {
      // Two sources agreeing is itself a signal, so the merged score rises.
      existing.sourceUrls = [...new Set([...existing.sourceUrls, ...candidate.sourceUrls])];
      existing.discoverySignals = [...existing.discoverySignals, ...candidate.discoverySignals];
      existing.discoveryScore = Math.max(existing.discoveryScore, candidate.discoveryScore) + 5;
      continue;
    }
    merged.set(key, {
      ...candidate,
      sourceUrls: [...candidate.sourceUrls],
      discoverySignals: [...candidate.discoverySignals],
      key,
      homeUrl: site?.homeUrl ?? null,
    });
  }
  return [...merged.values()].sort((a, b) => b.discoveryScore - a.discoveryScore).slice(0, Math.max(0, max));
}
