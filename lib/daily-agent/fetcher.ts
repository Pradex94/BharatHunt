import "server-only";

import { cacheRemember } from "@/lib/cache";
import type { SubrequestBudget } from "@/lib/funding/subrequest-budget";
import { assertPublicHost } from "@/lib/safe-fetch";

import type { FetchedPage } from "./extract";
import { DISALLOW_ALL, isPathAllowed, rulesForStatus, type RobotsRules } from "./robots";

/**
 * Every outbound request the agent makes goes through here.
 *
 * Politeness and safety, in the order a request meets them:
 *   1. the per-invocation budget (`SubrequestBudget`) — a request that does not
 *      fit is not made, so a batch stops cleanly instead of being killed at the
 *      platform's subrequest ceiling;
 *   2. robots.txt for the host (site pages only; APIs built for this are not
 *      crawled), cached per host for a day in Redis and for the invocation in
 *      memory, so a domain's robots.txt is fetched at most once a day;
 *   3. at most one request a second to any one host;
 *   4. the SSRF guard on every hop, redirects followed by hand;
 *   5. a timeout and a byte cap on every response;
 *   6. bounded exponential backoff on 429/503, honouring a short Retry-After.
 *
 * We identify ourselves honestly, with a URL explaining what the bot is.
 */

const USER_AGENT = "Mozilla/5.0 (compatible; BharatHuntBot/1.0; +https://bharathunt.org/daily-5)";
const MAX_REDIRECTS = 4;
const PAGE_MAX_BYTES = 600 * 1024;
const API_MAX_BYTES = 2 * 1024 * 1024;
const PER_HOST_INTERVAL_MS = 1000;
const ROBOTS_TTL_SECONDS = 24 * 60 * 60;
const MAX_RETRIES = 2;
const MAX_RETRY_AFTER_MS = 5000;

export type FetchFailure =
  | { ok: false; kind: "robots"; url: string }
  | { ok: false; kind: "budget"; url: string }
  | { ok: false; kind: "http"; url: string; status: number }
  | { ok: false; kind: "network"; url: string; message: string }
  | { ok: false; kind: "not_html"; url: string };

export type PageResult = ({ ok: true } & FetchedPage) | FetchFailure;

type RawResponse = { status: number; url: string; body: string; contentType: string; ms: number };

class BudgetExhausted extends Error {}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readCapped(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let text = "";
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      text += decoder.decode(value, { stream: true });
      if (total >= maxBytes) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return text + decoder.decode();
}

export type Fetcher = ReturnType<typeof createFetcher>;

export function createFetcher(options: { timeoutMs: number; budget: SubrequestBudget }) {
  const robotsMemo = new Map<string, Promise<RobotsRules>>();
  const lastHit = new Map<string, number>();
  let requests = 0;

  async function politeWait(host: string) {
    const last = lastHit.get(host);
    const wait = last === undefined ? 0 : last + PER_HOST_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastHit.set(host, Date.now());
  }

  /** One GET, redirects followed by hand with the SSRF guard on each hop. */
  async function getOnce(startUrl: string, accept: string, maxBytes: number): Promise<RawResponse> {
    let current = startUrl;
    const started = Date.now();
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const url = new URL(current);
      if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only http(s) URLs are fetched");
      if (!options.budget.canAfford(1)) throw new BudgetExhausted();
      await assertPublicHost(url.hostname);
      await politeWait(url.hostname);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), options.timeoutMs);
      let response: Response;
      try {
        options.budget.spend(1);
        requests += 1;
        response = await fetch(current, {
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
          cache: "no-store",
          headers: { "User-Agent": USER_AGENT, Accept: accept, "Accept-Language": "en-IN,en;q=0.9" },
        });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") throw new Error(`Timed out after ${options.timeoutMs}ms`);
        throw error;
      } finally {
        clearTimeout(timer);
      }

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        await response.body?.cancel().catch(() => {});
        if (!location) throw new Error("Redirect without a Location header");
        current = new URL(location, current).toString();
        continue;
      }

      const body = await readCapped(response, maxBytes);
      return {
        status: response.status,
        url: current,
        body,
        contentType: response.headers.get("content-type") ?? "",
        ms: Date.now() - started,
      };
    }
    throw new Error("Too many redirects");
  }

  /** `getOnce` with bounded exponential backoff on 429 and 503. */
  async function get(url: string, accept: string, maxBytes: number): Promise<RawResponse> {
    for (let attempt = 0; ; attempt += 1) {
      const response = await getOnce(url, accept, maxBytes);
      if ((response.status !== 429 && response.status !== 503) || attempt >= MAX_RETRIES) return response;
      const backoff = 600 * 2 ** attempt;
      await sleep(Math.min(MAX_RETRY_AFTER_MS, backoff));
    }
  }

  async function loadRobots(origin: string): Promise<RobotsRules> {
    try {
      const response = await get(`${origin}/robots.txt`, "text/plain,*/*;q=0.5", 256 * 1024);
      return rulesForStatus(response.status, response.body);
    } catch (error) {
      if (error instanceof BudgetExhausted) throw error;
      // Unreachable robots.txt: RFC 9309 says assume complete disallow.
      return DISALLOW_ALL;
    }
  }

  async function robotsFor(origin: string): Promise<RobotsRules> {
    let memo = robotsMemo.get(origin);
    if (!memo) {
      memo = cacheRemember(`bh:daily5:robots:${origin}`, ROBOTS_TTL_SECONDS, () => loadRobots(origin));
      robotsMemo.set(origin, memo);
    }
    return memo;
  }

  /** Whether robots.txt lets us read this URL. */
  async function robotsAllows(url: string): Promise<boolean> {
    const parsed = new URL(url);
    const rules = await robotsFor(parsed.origin);
    return isPathAllowed(rules, `${parsed.pathname}${parsed.search}`);
  }

  return {
    get requestCount() {
      return requests;
    },

    robotsAllows,

    /** A product's web page, after robots.txt. */
    async fetchPage(url: string): Promise<PageResult> {
      try {
        if (!(await robotsAllows(url))) return { ok: false, kind: "robots", url };
        const response = await get(url, "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5", PAGE_MAX_BYTES);
        if (response.status < 200 || response.status >= 300) {
          return { ok: false, kind: "http", url, status: response.status };
        }
        if (response.contentType && !/html|xml/i.test(response.contentType)) return { ok: false, kind: "not_html", url };
        return { ok: true, url: response.url, html: response.body, status: response.status, ms: response.ms };
      } catch (error) {
        if (error instanceof BudgetExhausted) return { ok: false, kind: "budget", url };
        return { ok: false, kind: "network", url, message: error instanceof Error ? error.message : String(error) };
      }
    },

    /** A public API built to be called (Algolia HN search). No robots.txt; same budget and backoff. */
    async fetchApi(url: string, accept: string): Promise<string> {
      const response = await get(url, accept, API_MAX_BYTES);
      if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status}`);
      return response.body;
    },
  };
}

export { BudgetExhausted };
