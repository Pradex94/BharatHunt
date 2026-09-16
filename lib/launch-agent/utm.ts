/**
 * UTM-tagged links for launch traffic.
 *
 * BharatHunt cannot see traffic that arrives at a maker's own website from
 * another platform — that shows up only in the maker's analytics. What it can do
 * is hand them links tagged so that traffic is attributable there. The UI says
 * exactly that, and never shows a traffic number it did not measure.
 */

/** Registry slug → the `utm_source` value (short, conventional names). */
const SOURCE_OVERRIDES: Record<string, string> = {
  "product-hunt": "producthunt",
  "show-hn": "hackernews",
  "reddit-sideproject": "reddit",
  "indie-hackers": "indiehackers",
  "tiny-startups": "tinystartups",
  "launching-next": "launchingnext",
};

export function utmSourceFor(platformSlug: string): string {
  return SOURCE_OVERRIDES[platformSlug] ?? platformSlug.replace(/[^a-z0-9]+/g, "");
}

/** The URL with only its `utm_*` parameters removed. */
export function stripUtm(url: string): string {
  try {
    const parsed = new URL(url);
    for (const key of [...parsed.searchParams.keys()]) {
      if (key.startsWith("utm_")) parsed.searchParams.delete(key);
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * The URL with `utm_source`, `utm_medium=launch` and `utm_campaign=bharathunt_launch_agent`.
 * Existing UTM parameters the maker put in their link are left alone; a
 * non-http(s) or unparseable URL is returned unchanged.
 */
export function buildUtmUrl(url: string, platformSlug: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return url;
    if (!parsed.searchParams.has("utm_source")) parsed.searchParams.set("utm_source", utmSourceFor(platformSlug));
    if (!parsed.searchParams.has("utm_medium")) parsed.searchParams.set("utm_medium", "launch");
    if (!parsed.searchParams.has("utm_campaign")) parsed.searchParams.set("utm_campaign", "bharathunt_launch_agent");
    return parsed.toString();
  } catch {
    return url;
  }
}
