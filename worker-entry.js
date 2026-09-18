/**
 * Worker entrypoint — everything that is decided before the OpenNext handler
 * (and with it the whole Next.js server bundle) is loaded.
 *
 * In order, per request:
 *
 *   1. Scanner probes get a static 404.           (lib/edge-policy.ts isProbePath)
 *   2. www is redirected to the apex.             (canonicalRedirect)
 *   3. Signed-out GETs of public pages are answered from the Workers Cache API,
 *      stale-while-revalidate.                    (edgeCacheRuleFor + friends)
 *   4. Everything else goes to OpenNext, and the ISR `Cache-Control` it writes
 *      is made browser-safe on the way out.       (withBrowserSafeCaching)
 *
 * Why 1-3 live here
 * -----------------
 * `wrangler tail` against the live Worker (2026-09-19) measured the CPU cost of
 * reaching the OpenNext handler at all: 7-44 ms for `/robots.txt`, 9-92 ms for
 * a junk 404, 50-900 ms for a dynamic page. The Workers Free plan allows 10 ms
 * per request, and `exceededResources` (Error 1102) was 200-700 requests a day.
 * A response produced in this file never evaluates the Next.js bundle and costs
 * about a millisecond. The decisions themselves are pure functions in
 * lib/edge-policy.ts, tested by `npm test`.
 *
 * Why 4 exists
 * ------------
 * OpenNext answers an ISR/prerendered route with
 *
 *     Cache-Control: s-maxage=<ttl>, stale-while-revalidate=2592000
 *
 * (see `fixISRHeaders` in @opennextjs/aws/dist/core/routing/util.js). That
 * header is written for CloudFront, which consumes it and hands the browser
 * something else. Nothing does that here: Workers-on-a-route return the
 * Worker's response to the client verbatim, so the header reached browsers
 * unchanged — and it has no `max-age` at all.
 *
 * A browser reads that as "stale immediately, but you may serve the stale copy
 * for 30 days while you revalidate". So a returning visitor got the HTML from
 * the *last* deploy out of their disk cache. Every `/_next/static/*` URL in
 * that HTML is content-hashed and the previous build's assets are gone after a
 * deploy, so all of them 404 at once:
 *
 *   - the next/font stylesheet 404s, `--font-sans` is never defined, and the
 *     whole page falls back to the browser's default serif;
 *   - every JS chunk 404s, nothing hydrates, so the navbar sits on its Clerk
 *     skeleton (no "Log in" button) and search, menus, filters, upvotes and
 *     the mobile sheet are all inert.
 *
 * One stale document, three unrelated-looking bugs. Vercel sends
 * `public, max-age=0, must-revalidate` to browsers for exactly these routes;
 * this matches that, and parks the original TTL on `CDN-Cache-Control` so a
 * Cloudflare cache rule can still use it without the browser ever seeing it.
 * The same failure is why the edge cache key includes the deployed version.
 *
 * Only responses carrying `s-maxage` are touched — that is the OpenNext ISR
 * header and nothing else. Dynamic routes already send
 * `private, no-cache, no-store, ...` and pass through untouched, as do static
 * assets, which the assets binding serves before this Worker is ever invoked
 * (their caching is set in `public/_headers`).
 */

import { AsyncLocalStorage } from "node:async_hooks";

import openNextWorker from "./.open-next/worker.js";
import {
  canonicalRedirect,
  edgeCacheKey,
  edgeCacheRuleFor,
  freshnessOf,
  isAnonymousRequest,
  isCacheableRequestShape,
  isLikelyBot,
  isProbePath,
  isStorableResponse,
  productSlugFromPath,
  routeLabel,
  subrequestKind,
} from "./lib/edge-policy.ts";

// Durable Objects must be re-exported from the entrypoint wrangler bundles.
export { DOQueueHandler } from "./.open-next/worker.js";
export { DOShardedTagCache } from "./.open-next/worker.js";
export { BucketCachePurge } from "./.open-next/worker.js";

/** What a browser may do with a page it has already fetched: re-check it. */
const BROWSER_REVALIDATE = "public, max-age=0, must-revalidate";

function withBrowserSafeCaching(response) {
  const cacheControl = response.headers.get("cache-control");
  if (!cacheControl?.includes("s-maxage")) return response;

  const headers = new Headers(response.headers);
  headers.set("cdn-cache-control", cacheControl);
  headers.set("cache-control", BROWSER_REVALIDATE);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// ── Telemetry ────────────────────────────────────────────────────────────
//
// One JSON line per sampled request, into Workers Logs (observability is on in
// wrangler.jsonc). Sampled because the logs have a daily cap on the Free plan
// and because the point is proportions, not a ledger. Always logged: 5xx.
//
// Recorded: route label (slugs collapsed, no query string), method, status,
// wall time, edge-cache outcome, response bytes, colo, whether the user agent
// declares itself a bot, and how many subrequests went to the database, Redis,
// Clerk, an AI API or anywhere else. Never recorded: IPs, cookies, headers,
// query strings, bodies.
//
// CPU time is not measurable from inside a Worker; Workers Observability
// already records it per invocation, and this line shares its request id.

const telemetry = new AsyncLocalStorage();
const DEFAULT_SAMPLE_RATE = 0.05;

const platformFetch = globalThis.fetch;
globalThis.fetch = function countedFetch(input, init) {
  const store = telemetry.getStore();
  if (store) {
    try {
      const url = input instanceof Request ? input.url : String(input);
      store.subrequests[subrequestKind(new URL(url).hostname)] += 1;
    } catch {
      // A malformed URL is fetch's problem to report, not ours.
    }
  }
  return platformFetch.call(globalThis, input, init);
};

function sampleRate(env) {
  const raw = Number(env.EDGE_TELEMETRY_SAMPLE_RATE);
  return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : DEFAULT_SAMPLE_RATE;
}

function newTelemetryRecord(request, url) {
  return {
    route: routeLabel(url.pathname),
    method: request.method,
    cache: "BYPASS",
    colo: request.cf?.colo ?? null,
    bot: isLikelyBot(request.headers.get("user-agent")),
    subrequests: { db: 0, cache: 0, auth: 0, ai: 0, external: 0 },
  };
}

function emit(record, response, startedAt, bytes) {
  console.log(
    JSON.stringify({
      event: "edge_request",
      ...record,
      status: response.status,
      durationMs: Date.now() - startedAt,
      bytes,
    }),
  );
}

/**
 * Logs once the body has been fully sent, so subrequests made while a page
 * streams are counted and the byte total is the real one. Only sampled
 * requests pay for the TransformStream.
 */
function logWhenSent(response, record, startedAt, ctx) {
  if (!response.body) {
    emit(record, response, startedAt, 0);
    return response;
  }
  let bytes = 0;
  let resolveDone;
  const done = new Promise((resolve) => (resolveDone = resolve));
  const counter = new TransformStream({
    transform(chunk, controller) {
      bytes += chunk.byteLength;
      controller.enqueue(chunk);
    },
    flush() {
      resolveDone();
    },
  });
  ctx.waitUntil(done.then(() => emit(record, response, startedAt, bytes)));
  return new Response(response.body.pipeThrough(counter), response);
}

// ── Edge cache ───────────────────────────────────────────────────────────

/** When a stored copy was rendered, epoch ms. Stripped before it is served. */
const STORED_AT = "x-bh-stored-at";

/**
 * How long one isolate's background re-render holds the entry. The stale copy
 * is re-stored looking this many seconds away from stale, so the other
 * isolates in this data centre keep serving it rather than all re-rendering the
 * same page at once — a cache stampede is exactly the burst of CPU this file
 * exists to avoid. If the re-render fails, the lease lapses and the next
 * request tries again.
 */
const LEASE_SECONDS = 30;

/** Keys this isolate is already re-rendering. The in-isolate half of the lease. */
const revalidating = new Set();

/** The response as stored: its own TTL, a timestamp, nothing per-request. */
function forStorage(response, storedAt, rule) {
  const headers = new Headers(response.headers);
  headers.set("cache-control", `public, max-age=${rule.fresh + rule.stale}`);
  headers.set(STORED_AT, String(storedAt));
  // The Cache API ignores Vary except for encoding, and the only thing Next
  // varies on is router headers, which never reach this cache.
  headers.delete("vary");
  headers.delete("cdn-cache-control");
  headers.delete("set-cookie");
  return new Response(response.body, { status: response.status, headers });
}

/** A stored copy as a browser should receive it. */
function forClient(stored, outcome, method) {
  const headers = new Headers(stored.headers);
  const storedAt = Number(headers.get(STORED_AT));
  headers.delete(STORED_AT);
  const isImage = (headers.get("content-type") ?? "").startsWith("image/");
  // Pages: re-check every time (see withBrowserSafeCaching). Share cards are
  // fetched by unfurlers, not browsers mid-session, so an hour is harmless.
  headers.set("cache-control", isImage ? "public, max-age=3600" : BROWSER_REVALIDATE);
  headers.set("x-bh-cache", outcome);
  if (Number.isFinite(storedAt)) {
    headers.set("age", String(Math.max(0, Math.floor((Date.now() - storedAt) / 1000))));
  }
  return new Response(method === "HEAD" ? null : stored.body, { status: stored.status, headers });
}

/**
 * The request a background re-render sends: the same URL, anonymous by
 * construction, carrying only what the app reads to render a public page.
 * The client address is forwarded so the app's per-IP limiter charges the
 * visitor who triggered it rather than one shared "unknown" bucket.
 */
function anonymousCopy(request) {
  const headers = new Headers();
  for (const name of [
    "accept",
    "accept-language",
    "user-agent",
    "cf-connecting-ip",
    "x-real-ip",
    "x-forwarded-for",
    "x-forwarded-proto",
    "cf-ipcountry",
  ]) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  return new Request(request.url, { method: "GET", headers });
}

/**
 * Keeps `products.view_count` counting visits that the cache answered.
 *
 * The product page increments it on every render (`increment_view_count`,
 * app/products/[slug]/page.tsx). A cached hit renders nothing, so without this
 * a popular product would count one view per cache lifetime instead of one per
 * visit. Two cheap subrequests, off the response path, fail-silent — the same
 * contract as the page's own call, which does not check its result either.
 */
const productIds = new Map();
const PRODUCT_ID_CACHE_LIMIT = 500;

async function countProductView(env, slug) {
  const base = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!base || !key) return;
  const auth = { apikey: key, authorization: `Bearer ${key}` };

  try {
    let id = productIds.get(slug);
    if (!id) {
      const lookup = await fetch(
        `${base}/rest/v1/products?select=id&status=eq.published&limit=1&slug=eq.${encodeURIComponent(slug)}`,
        { headers: auth },
      );
      if (!lookup.ok) return;
      id = (await lookup.json())?.[0]?.id;
      if (!id) return;
      if (productIds.size >= PRODUCT_ID_CACHE_LIMIT) productIds.clear();
      productIds.set(slug, id);
    }
    await fetch(`${base}/rest/v1/rpc/increment_view_count`, {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ target_product_id: id }),
    });
  } catch {
    // A lost view is not worth an error.
  }
}

/**
 * Answers a signed-out request for a public page from the Cache API, or
 * renders it through Next.js and stores the result.
 *
 * fresh  → the stored copy.
 * stale  → the stored copy, and (once per data centre, see LEASE_SECONDS) a
 *          background re-render that replaces it.
 * miss   → a normal render, stored for the next visitor.
 */
async function serveCached(request, env, ctx, url, rule, record) {
  const cache = caches.default;
  const key = new Request(edgeCacheKey(url, env.CF_VERSION_METADATA.id), { method: "GET" });
  const slug = productSlugFromPath(url.pathname);
  const stored = await cache.match(key);

  if (stored) {
    const state = freshnessOf(Number(stored.headers.get(STORED_AT)), Date.now(), rule);

    if (state === "fresh") {
      record.cache = "HIT";
      if (slug) ctx.waitUntil(countProductView(env, slug));
      return forClient(stored, "HIT", request.method);
    }

    if (state === "stale") {
      record.cache = "STALE";
      if (!revalidating.has(key.url)) {
        revalidating.add(key.url);
        const leased = stored.clone();
        ctx.waitUntil(
          (async () => {
            try {
              const leaseStart = Date.now() - (rule.fresh - LEASE_SECONDS) * 1000;
              await cache.put(key, forStorage(leased, leaseStart, rule));
              // The re-render is itself a product-page render, which counts
              // this view — so no separate beacon on this path.
              const fresh = await openNextWorker.fetch(anonymousCopy(request), env, ctx);
              if (isStorableResponse(fresh.status, (name) => fresh.headers.get(name))) {
                await cache.put(key, forStorage(fresh, Date.now(), rule));
              }
            } catch {
              // The lease lapses on its own; the next visitor retries.
            } finally {
              revalidating.delete(key.url);
            }
          })(),
        );
      } else if (slug) {
        ctx.waitUntil(countProductView(env, slug));
      }
      return forClient(stored, "STALE", request.method);
    }
  }

  // Miss or expired. HEAD has no body to store, so it is only passed through.
  record.cache = "MISS";
  const response = await openNextWorker.fetch(request, env, ctx);
  if (request.method === "GET" && isStorableResponse(response.status, (name) => response.headers.get(name))) {
    const [forVisitor, forCache] = response.body ? response.body.tee() : [null, null];
    ctx.waitUntil(cache.put(key, forStorage(new Response(forCache, response), Date.now(), rule)).catch(() => {}));
    const headers = new Headers(response.headers);
    headers.set("x-bh-cache", "MISS");
    return withBrowserSafeCaching(new Response(forVisitor, { status: response.status, headers }));
  }
  return withBrowserSafeCaching(response);
}

// ── Router ───────────────────────────────────────────────────────────────

async function route(request, env, ctx, url, record) {
  if (isProbePath(url.pathname)) {
    record.cache = "PROBE";
    return new Response("Not found", {
      status: 404,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        // Browsers and shared caches may keep this; nothing here will ever exist.
        "cache-control": "public, max-age=86400",
      },
    });
  }

  const redirectTo = canonicalRedirect(url);
  if (redirectTo) {
    record.cache = "REDIRECT";
    return Response.redirect(redirectTo, 308);
  }

  const rule = edgeCacheRuleFor(url.pathname, url.searchParams);
  if (
    rule &&
    env.CF_VERSION_METADATA?.id &&
    typeof caches !== "undefined" &&
    isCacheableRequestShape(request.method, (name) => request.headers.get(name)) &&
    isAnonymousRequest(request.headers.get("cookie"), url.searchParams)
  ) {
    return serveCached(request, env, ctx, url, rule, record);
  }

  return withBrowserSafeCaching(await openNextWorker.fetch(request, env, ctx));
}

const worker = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const record = newTelemetryRecord(request, url);
    const startedAt = Date.now();

    if (Math.random() >= sampleRate(env)) {
      const response = await route(request, env, ctx, url, record);
      // Subrequests are not counted on this path; the line still says which
      // route failed, how, and whether the cache was involved.
      if (response.status >= 500) emit(record, response, startedAt, null);
      return response;
    }

    return telemetry.run(record, async () => {
      const response = await route(request, env, ctx, url, record);
      return logWhenSent(response, record, startedAt, ctx);
    });
  },
};

export default worker;
