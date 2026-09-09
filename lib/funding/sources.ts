import "server-only";

import { parseFeed, parseGdeltPayload, type FeedItem } from "@/lib/funding/feed-parser";

/**
 * Fetching the configured news sources.
 *
 * The parsing lives in `lib/funding/feed-parser.ts`, which is pure and tested
 * against real feed XML; this file is the part that touches the network. Three
 * source types, one output shape — everything downstream sees a `FeedItem` and
 * does not know or care whether it came from an RSS feed or a JSON API.
 *
 * On being a well-behaved client
 * ------------------------------
 * Each request identifies itself honestly (`USER_AGENT`, with a URL a publisher
 * can look up), asks for the feed formats it can parse, and gives up after
 * `FETCH_TIMEOUT_MS`. Nothing here logs in, follows a paywall, retries in a
 * tight loop or pretends to be a browser. The cadence controls live one layer
 * up, in `lib/funding/ingest.ts`: a source is skipped entirely unless its own
 * `poll_interval_minutes` has elapsed, and repeated failures back it off
 * exponentially rather than hammering it.
 *
 * The feeds that ship enabled were checked against their robots.txt before
 * being seeded — see the header of
 * `supabase/migrations/20260909020000_funding_sources_seed.sql`, which records
 * what each one permits and why two are seeded off.
 */

export type { FeedItem };

export type SourceRow = {
  id: string;
  name: string;
  source_type: string;
  feed_url: string | null;
  api_endpoint: string | null;
  publisher: string | null;
};

/**
 * Honest, and traceable back to a page that explains what this is. A publisher
 * who wants to block it can, by name, without having to guess.
 */
const USER_AGENT =
  "BharatHuntBot/1.0 (+https://bharathunt.org/funding; funding news aggregator)";

const FETCH_TIMEOUT_MS = 15_000;

/**
 * Items taken from one fetch. A feed that returns 200 of them on first run
 * would otherwise import an entire archive as "today's news"; the ingestion
 * only ever wants what is new since last time.
 */
const MAX_ITEMS_PER_SOURCE = 40;

/**
 * GDELT asks, in the body of its own 429, for no more than one request every
 * five seconds. Honoured process-wide rather than per-source, because the limit
 * is theirs and applies to the caller, not the configuration row.
 */
const GDELT_MIN_INTERVAL_MS = 5_000;
let lastGdeltRequestAt = 0;

export class SourceFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceFetchError";
  }
}

/** One bounded, identified GET. Throws `SourceFetchError` on anything but a 2xx. */
async function get(url: string, accept: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept },
      signal: controller.signal,
      redirect: "follow",
      // This is a scheduled job reading a live feed; Next's fetch cache would
      // serve it yesterday's items.
      cache: "no-store",
    });

    if (!response.ok) {
      throw new SourceFetchError(`HTTP ${response.status} ${response.statusText}`.trim());
    }
    return await response.text();
  } catch (error) {
    if (error instanceof SourceFetchError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new SourceFetchError(`Timed out after ${FETCH_TIMEOUT_MS}ms`);
    }
    throw new SourceFetchError(error instanceof Error ? error.message : "Fetch failed");
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch and parse one source into feed items. */
export async function fetchSourceItems(source: SourceRow): Promise<FeedItem[]> {
  switch (source.source_type) {
    case "rss":
    case "api": {
      const url = source.feed_url ?? source.api_endpoint;
      if (!url) throw new SourceFetchError("Source has no feed_url or api_endpoint");
      const body = await get(
        url,
        "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
      );
      return parseFeed(body).slice(0, MAX_ITEMS_PER_SOURCE);
    }

    case "gdelt": {
      const endpoint = source.api_endpoint ?? source.feed_url;
      if (!endpoint) throw new SourceFetchError("GDELT source has no api_endpoint");
      return fetchGdelt(endpoint);
    }

    case "manual":
      // Never fetched. Its rows are typed by an admin.
      return [];

    default:
      throw new SourceFetchError(`Unknown source_type "${source.source_type}"`);
  }
}

/**
 * GDELT's DOC 2.0 API, which returns JSON rather than a feed.
 *
 * A default query is appended when the configured endpoint carries none, so an
 * operator can enable the seeded row without also having to compose a GDELT
 * query string. `maxrecords` is bounded here rather than trusted from
 * configuration.
 */
async function fetchGdelt(endpoint: string): Promise<FeedItem[]> {
  const wait = GDELT_MIN_INTERVAL_MS - (Date.now() - lastGdeltRequestAt);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastGdeltRequestAt = Date.now();

  const url = new URL(endpoint);
  if (!url.searchParams.has("query")) {
    url.searchParams.set("query", '(funding OR raises OR "seed round") sourcecountry:IN');
  }
  url.searchParams.set("mode", "ArtList");
  url.searchParams.set("format", "json");
  url.searchParams.set("sort", "DateDesc");
  url.searchParams.set("maxrecords", String(MAX_ITEMS_PER_SOURCE));

  const body = await get(url.toString(), "application/json");

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    /*
     * GDELT answers a rate-limited or malformed request with a plain-text
     * apology and HTTP 200, not a 4xx — so an unparseable body is the shape its
     * errors actually arrive in, and reporting it as such is what puts the real
     * reason in front of an admin.
     */
    throw new SourceFetchError(`Non-JSON response: ${body.slice(0, 160).trim()}`);
  }

  return parseGdeltPayload(payload, MAX_ITEMS_PER_SOURCE);
}
