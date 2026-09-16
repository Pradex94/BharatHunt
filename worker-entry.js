/**
 * Worker entrypoint — wraps the OpenNext-generated handler to fix the
 * browser-facing `Cache-Control` on cached pages.
 *
 * Why this exists
 * ---------------
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
 *
 * Only responses carrying `s-maxage` are touched — that is the OpenNext ISR
 * header and nothing else. Dynamic routes already send
 * `private, no-cache, no-store, ...` and pass through untouched, as do static
 * assets, which the assets binding serves before this Worker is ever invoked
 * (their caching is set in `public/_headers`).
 */

import openNextWorker from "./.open-next/worker.js";

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

export default {
  async fetch(request, env, ctx) {
    return withBrowserSafeCaching(await openNextWorker.fetch(request, env, ctx));
  },
};
