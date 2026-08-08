/**
 * Coarse location for the current request, from Vercel's edge geo headers.
 *
 * Server-only — `next/headers` can't run in the browser.
 *
 * Vercel resolves the client IP at the edge and forwards the result as request
 * headers, so there is no lookup to do and no third-party geo service to call.
 * We deliberately read only the derived fields: **the IP itself is never read,
 * logged or stored**, and nothing finer than a state is kept.
 *
 * This is a hint, not a fact. VPNs, corporate proxies and Indian mobile
 * carriers (which commonly present a whole circle from one hub city) all move
 * the apparent location, so the detected state is only ever used to *prefill* a
 * field the maker can correct before publishing — see `lib/actions/products.ts`.
 */

import { headers } from "next/headers";

import { normalizeIndiaStateCode } from "@/lib/india-states";

export type DetectedLocation = {
  /** ISO 3166-2:IN code, or null when the request isn't from India / is unknown. */
  stateCode: string | null;
  /** ISO 3166-1 alpha-2, e.g. "IN". Null on localhost. */
  country: string | null;
  /** Nearest city Vercel could resolve — shown for context, never stored. */
  city: string | null;
};

const EMPTY: DetectedLocation = { stateCode: null, country: null, city: null };

/** Vercel percent-encodes the city so non-ASCII names survive the header. */
function decodeCity(value: string | null): string | null {
  if (!value) return null;
  try {
    return decodeURIComponent(value) || null;
  } catch {
    return value;
  }
}

export async function detectLocation(): Promise<DetectedLocation> {
  // Locally there are no edge headers at all, so this returns EMPTY in dev —
  // expected, and the form just starts blank.
  const h = await headers();

  const country = h.get("x-vercel-ip-country")?.toUpperCase() ?? null;
  const city = decodeCity(h.get("x-vercel-ip-city"));

  // Subdivision codes are only unambiguous within their country: "GA" is Goa
  // in India and Georgia in the US. Resolve a state only for Indian requests.
  const stateCode =
    country === "IN" ? normalizeIndiaStateCode(h.get("x-vercel-ip-country-region")) : null;

  return { stateCode, country, city };
}

/** Convenience for callers that only want the state. */
export async function detectStateCode(): Promise<string | null> {
  try {
    return (await detectLocation()).stateCode;
  } catch {
    // Detection is never worth failing a launch over.
    return EMPTY.stateCode;
  }
}
