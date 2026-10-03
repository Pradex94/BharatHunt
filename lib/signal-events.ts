/**
 * The engagement events BharatHunt records, and the rules for accepting them.
 *
 * Framework-agnostic (no `next/*`, no database), so the endpoint, the client
 * beacon and `npm test` share one definition. The event names are the
 * `product_events.event_type` values (20261004000000); the analytics names the
 * product spec uses map onto them:
 *
 *   product_view → view            product_save / unsave → bookmark / unbookmark
 *   website_click → website_click  product_compare_add / remove → compare_add / compare_remove
 *   search_result_click → search_click
 *   ai_match_result_click → match_click, plus match_impression for results shown
 *
 * Searches themselves (search, ai_match_search) go to `search_queries`, and
 * collection events are read from the list tables — neither belongs to a
 * single product, which `product_events` requires.
 */

export const SIGNAL_EVENTS = [
  "view",
  "website_click",
  "bookmark",
  "unbookmark",
  "compare_add",
  "compare_remove",
  "match_impression",
  "match_click",
  "search_click",
] as const;

export type SignalEvent = (typeof SIGNAL_EVENTS)[number];

export type SignalInput = { event: SignalEvent; productId: string; surface: string | null };

/** One beacon carries at most this many events (a page of match impressions). */
export const MAX_EVENTS_PER_BEACON = 12;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SURFACE = /^[a-z][a-z-]{0,23}$/;

/**
 * Untrusted beacon body → valid, de-duplicated events. Anything malformed is
 * dropped rather than rejected: a beacon has no one to report an error to.
 */
export function parseSignalPayload(body: unknown): SignalInput[] {
  const events = (body as { events?: unknown } | null)?.events;
  if (!Array.isArray(events)) return [];

  const seen = new Set<string>();
  const valid: SignalInput[] = [];
  for (const raw of events.slice(0, MAX_EVENTS_PER_BEACON * 2)) {
    const { e, p, s } = (raw ?? {}) as { e?: unknown; p?: unknown; s?: unknown };
    if (typeof e !== "string" || !(SIGNAL_EVENTS as readonly string[]).includes(e)) continue;
    if (typeof p !== "string" || !UUID.test(p)) continue;
    const key = `${e}:${p.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    valid.push({
      event: e as SignalEvent,
      productId: p.toLowerCase(),
      surface: typeof s === "string" && SURFACE.test(s) ? s : null,
    });
    if (valid.length >= MAX_EVENTS_PER_BEACON) break;
  }
  return valid;
}

/**
 * Hours since the epoch. With the unique index on (product, event, session,
 * bucket), a session counts at most once per product, event and hour.
 */
export function dedupBucket(at: Date = new Date()): number {
  return Math.floor(at.getTime() / 3_600_000);
}
