/**
 * Coarse location for the current request, from Cloudflare's edge metadata.
 *
 * Server-only.
 *
 * On Cloudflare Workers the platform attaches the resolved geo to the request's
 * `cf` object (`getCloudflareContext().cf`). Unlike request headers, `cf` is
 * populated by Cloudflare's edge and cannot be set by the client, so it is the
 * honest, un-spoofable source — there is no longer any need to check whether the
 * request came *through* Cloudflare (it always does now that the app itself runs
 * on Workers). We read only the derived fields: **the visitor's IP is never
 * read, logged or stored**, and nothing finer than a state is kept. This also
 * removes the old dependency on the "Add visitor location headers" managed
 * transform — `cf.regionCode` and `cf.city` are present without it.
 *
 * This is a hint, not a fact. VPNs, corporate proxies and Indian mobile carriers
 * (which commonly present a whole circle from one hub city) all move the apparent
 * location, so the detected state is only ever used to *prefill* a field the
 * maker can correct before publishing — see `lib/actions/products.ts`.
 */

import { getCloudflareContext } from "@opennextjs/cloudflare";

import { normalizeIndiaStateCode } from "@/lib/india-states";

export type DetectedLocation = {
  /** ISO 3166-2:IN code, or null when the request isn't from India / is unknown. */
  stateCode: string | null;
  /** ISO 3166-1 alpha-2, e.g. "IN". Null on localhost. */
  country: string | null;
  /** Nearest city Cloudflare could resolve — shown for context, never stored. */
  city: string | null;
};

const EMPTY: DetectedLocation = { stateCode: null, country: null, city: null };

/*
 * Cloudflare's country uses two placeholders that are not countries: "XX" when
 * it could not resolve one, "T1" for traffic arriving over Tor. Neither is a
 * location, so both read as unknown.
 */
const UNRESOLVED_COUNTRIES = new Set(["XX", "T1"]);

export async function detectLocation(): Promise<DetectedLocation> {
  // Locally (`next dev` without the Workers runtime) there is no `cf` object, so
  // this returns EMPTY in dev — expected, and the form just starts blank.
  let cf: IncomingRequestCfProperties | undefined;
  try {
    cf = (await getCloudflareContext({ async: true })).cf;
  } catch {
    return EMPTY;
  }
  if (!cf) return EMPTY;

  const rawCountry = typeof cf.country === "string" ? cf.country.toUpperCase() : null;
  const country =
    rawCountry && !UNRESOLVED_COUNTRIES.has(rawCountry) ? rawCountry : null;

  const city = typeof cf.city === "string" && cf.city ? cf.city : null;

  // Subdivision codes are only unambiguous within their country: "GA" is Goa in
  // India and Georgia in the US. Resolve a state only for Indian requests.
  const region = typeof cf.regionCode === "string" ? cf.regionCode : null;
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
