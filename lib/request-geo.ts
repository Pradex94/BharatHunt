/**
 * Coarse location for the current request, from the edge's geo headers.
 *
 * Server-only — `next/headers` can't run in the browser.
 *
 * The edge resolves the client IP and forwards the result as request headers,
 * so there is no lookup to do and no third-party geo service to call. We read
 * only the derived fields: **the visitor's IP is never read, logged or
 * stored**, and nothing finer than a state is kept. (The *connecting* address
 * is looked at, once, to tell whether the request came through Cloudflare and
 * therefore which set of geo headers is the honest one — it is compared to a
 * list of edge ranges and then dropped.)
 *
 * This is a hint, not a fact. VPNs, corporate proxies and Indian mobile
 * carriers (which commonly present a whole circle from one hub city) all move
 * the apparent location, so the detected state is only ever used to *prefill* a
 * field the maker can correct before publishing — see `lib/actions/products.ts`.
 */

import { headers } from "next/headers";

import { isCloudflareIp } from "@/lib/cloudflare";
import { normalizeIndiaStateCode } from "@/lib/india-states";
import { connectingIpFrom } from "@/lib/rate-limit-ip";

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

/*
 * Cloudflare's country header uses two placeholders that are not countries:
 * "XX" when it could not resolve one, "T1" for traffic arriving over Tor.
 * Neither is a location, so both read as unknown.
 */
const UNRESOLVED_COUNTRIES = new Set(["XX", "T1"]);

export async function detectLocation(): Promise<DetectedLocation> {
  // Locally there are no edge headers at all, so this returns EMPTY in dev —
  // expected, and the form just starts blank.
  const h = await headers();
  const get = (name: string) => h.get(name);

  /*
   * Behind Cloudflare's proxy the platform resolves the *Cloudflare* data
   * centre, not the visitor: every Indian request would look like Mumbai or
   * Delhi. Cloudflare's own headers describe the real client, so they win when
   * the connection came from a Cloudflare address — and only then, since these
   * are ordinary request headers anyone could otherwise set. `cf-region-code`
   * and `cf-ipcity` need the "Add visitor location headers" managed transform
   * turned on; without it only the country arrives, and the state falls back to
   * whatever the platform resolved.
   */
  const viaCloudflare = isCloudflareIp(connectingIpFrom(get));

  const cfCountry = viaCloudflare ? h.get("cf-ipcountry")?.toUpperCase() : null;
  const country =
    (cfCountry && !UNRESOLVED_COUNTRIES.has(cfCountry) ? cfCountry : null) ??
    h.get("x-vercel-ip-country")?.toUpperCase() ??
    null;

  const city = decodeCity((viaCloudflare ? h.get("cf-ipcity") : null) ?? h.get("x-vercel-ip-city"));

  // Subdivision codes are only unambiguous within their country: "GA" is Goa
  // in India and Georgia in the US. Resolve a state only for Indian requests.
  const region =
    (viaCloudflare ? (h.get("cf-region-code") ?? h.get("cf-region")) : null) ??
    h.get("x-vercel-ip-country-region");
  const stateCode = country === "IN" ? normalizeIndiaStateCode(region) : null;

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
