/**
 * What the edge decides before Next.js is ever loaded.
 *
 * Framework-agnostic on purpose (no `server-only`, no `next/*`, no imports at
 * all), the same contract as lib/rate-limit-core.ts: it is imported by
 * `worker-entry.js`, which runs ahead of the OpenNext handler, by `proxy.ts`,
 * and by `npm test` in plain Node.
 *
 * Why this layer exists
 * ---------------------
 * Measured on the live Worker with `wrangler tail` (2026-09-19): a request that
 * reaches the OpenNext handler costs 7-44 ms of CPU even for `/robots.txt`, a
 * junk 404 costs 9-92 ms, and a dynamic page 50-900 ms. The Workers Free plan
 * allows 10 ms. Anything answered *here* — a scanner probe, the www redirect, a
 * cached page for a signed-out visitor — costs about a millisecond, because the
 * Next.js server bundle is never evaluated for it.
 *
 * Every decision in this file fails towards "let Next.js handle it". A path the
 * rules do not recognise is rendered exactly as before; the worst a gap here
 * can cost is the CPU it would have cost anyway.
 */

// ── Scanner probes ───────────────────────────────────────────────────────

/**
 * File extensions this site never serves from a route. Every real slug is
 * `[a-z0-9-]` (lib/actions/products.ts, lib/ai-news/normalize.ts,
 * lib/funding/normalize.ts), so a path ending in one of these is a probe for
 * somebody else's stack. `.xml`, `.txt` and `.json` are deliberately absent:
 * `/sitemap.xml` and `/robots.txt` are real routes.
 */
const PROBE_EXTENSIONS = new Set([
  "php", "php3", "php4", "php5", "php7", "phtml", "phar",
  "asp", "aspx", "ashx", "asmx", "jsp", "jspx", "do", "action", "cgi", "pl",
  "env", "bak", "backup", "old", "orig", "save", "swp", "tmp",
  "sql", "sqlite", "sqlite3", "db", "mdb", "dump",
  "log", "ini", "conf", "cfg", "config", "properties", "yml", "yaml", "toml",
  "pem", "key", "crt", "p12", "pfx", "jks",
  "tar", "gz", "tgz", "bz2", "rar", "7z", "war", "jar",
]);

/**
 * First path segments that only exist on other platforms. First segment only:
 * `/products/wp-rocket` is a plausible real launch, `/wp-admin` is not.
 */
const PROBE_ROOTS = new Set([
  "wp-admin", "wp-content", "wp-includes", "wp-json", "wp-login.php", "wp-config.php",
  "wordpress", "wp", "blog-wp", "xmlrpc.php",
  "phpmyadmin", "pma", "myadmin", "mysql", "adminer",
  "cgi-bin", "vendor", "node_modules", "actuator", "solr", "jenkins", "manager",
  "owa", "ecp", "autodiscover", "boaform", "hnap1", "telescope", "_ignition",
  "server-status", "debug", "console", "shell", "phpunit",
]);

/**
 * Whether `pathname` is an exploit/credential probe that no page on this site
 * answers. Such requests get a tiny static 404 instead of a rendered
 * not-found page.
 *
 * On 2026-09-18 one scanner (`curl/8.7.1`, 185.177.72.0/24) sent 21,351
 * requests — 85% of that day's Worker traffic — for paths like
 * `/root/.aws/config`, `/api/smtp/mail_config%2ejson` and `/*%2eenv%2ewww`.
 * The `%2e` spelling is why the path is decoded before matching.
 */
export function isProbePath(pathname: string): boolean {
  let path = pathname;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    // Malformed escapes are themselves a scanner tell.
    return true;
  }
  path = path.toLowerCase();

  const segments = path.split("/").filter(Boolean);
  if (segments.length === 0) return false;

  if (PROBE_ROOTS.has(segments[0])) return true;

  for (const segment of segments) {
    // Dotfiles and dot-directories (`.env`, `.git/config`, `.aws/credentials`).
    // `.well-known` is the one legitimate dot-directory on the web.
    if (segment.startsWith(".") && segment !== ".well-known") return true;
    // `.env.staging`, `*.env.www`, `app.env.bak`: an env file under any name.
    if (segment.includes(".env")) return true;
  }

  const last = segments[segments.length - 1];
  const dot = last.lastIndexOf(".");
  if (dot > 0 && PROBE_EXTENSIONS.has(last.slice(dot + 1))) return true;

  return false;
}

// ── Canonical host ───────────────────────────────────────────────────────

export const CANONICAL_HOST = "bharathunt.org";

/**
 * The www → apex redirect, answered at the edge.
 *
 * next.config.ts has the same rule and it stays: it is what serves the
 * redirect on Vercel. On Workers, though, a next.config redirect only runs
 * once the OpenNext routing layer is loaded, and on 2026-09-18 12,175 requests
 * arrived on www — each one paying that cost to be told to go elsewhere.
 *
 * Returns the absolute target, or null when `url` is already canonical. The
 * status is 308 to match `permanent: true` in next.config.ts.
 */
export function canonicalRedirect(url: URL): string | null {
  if (url.hostname !== `www.${CANONICAL_HOST}`) return null;
  return `https://${CANONICAL_HOST}${url.pathname}${url.search}`;
}

// ── Anonymous edge cache ─────────────────────────────────────────────────

export type EdgeCacheRule = {
  /** Seconds a stored page is served without question. */
  fresh: number;
  /**
   * Seconds past `fresh` during which the stored page is still served, while
   * one request re-renders it in the background (stale-while-revalidate).
   * Past this it is a plain miss.
   */
  stale: number;
};

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/*
 * Freshness per page family. The ceiling on what an anonymous visitor can see
 * go stale is `fresh`, plus one visitor during `stale` — signed-in visitors
 * always bypass this cache (see `isAnonymousRequest`), so a maker or admin
 * never sees their own change delayed.
 *
 *  - Listings that move with upvotes: two minutes, the same order of magnitude
 *    as the Redis TTLs underneath them (services/products.ts, 60-300 s).
 *  - AI and funding: five minutes. Ingestion runs once a day plus a manual
 *    "Run now" (.github/workflows/ingest.yml), so this is generous.
 *  - Editorial pages: ten minutes.
 *  - robots, sitemap and share cards: hours, not minutes.
 */
const PAGE_RULES: { match: (path: string) => boolean; rule: EdgeCacheRule }[] = [
  { match: (p) => p === "/robots.txt", rule: { fresh: DAY, stale: 7 * DAY } },
  { match: (p) => p === "/sitemap.xml", rule: { fresh: HOUR, stale: DAY } },
  // Share cards: the root one and every product's.
  {
    match: (p) => p === "/opengraph-image" || /^\/products\/[a-z0-9-]+\/opengraph-image$/.test(p),
    rule: { fresh: DAY, stale: 7 * DAY },
  },
  {
    match: (p) => p === "/" || p === "/marketplace" || /^\/products\/[a-z0-9-]+$/.test(p),
    rule: { fresh: 2 * MINUTE, stale: HOUR },
  },
  {
    match: (p) =>
      p === "/ai" ||
      /^\/ai\/[a-z0-9-]+$/.test(p) ||
      p === "/funding" ||
      /^\/funding\/[a-z0-9-]+(\/[a-z0-9-]+)?$/.test(p) ||
      p === "/investors" ||
      p === "/categories" ||
      /^\/categories\/[a-z0-9-]+$/.test(p) ||
      p === "/collections" ||
      /^\/collections\/[a-z0-9-]+$/.test(p),
    rule: { fresh: 5 * MINUTE, stale: HOUR },
  },
  {
    match: (p) =>
      p === "/blog" ||
      /^\/blog\/[a-z0-9-]+$/.test(p) ||
      ["/about", "/faq", "/terms", "/privacy", "/cookies", "/advertise", "/launch-agent", "/promote"].includes(p),
    rule: { fresh: 10 * MINUTE, stale: HOUR },
  },
];

/**
 * Query parameters that never change what a page renders. Stripped from the
 * cache key so a shared link with `?utm_source=whatsapp` does not start a new
 * cache entry per campaign.
 */
const IGNORED_PARAMS = /^(utm_[a-z]+|fbclid|gclid|gbraid|wbraid|msclkid|mc_cid|mc_eid|ref|igshid|si)$/;

/**
 * The cache rule for a request's path and query, or null when it must always
 * reach Next.js.
 *
 * Only public, identical-for-every-signed-out-visitor pages are listed; this
 * is an allowlist, so a new route is uncached until someone adds it here.
 * `/submit`, `/dashboard`, `/admin`, `/api`, auth pages, the product edit form
 * and checkout are absent on purpose.
 *
 * Search results (`?q=`) are not cached: every query is its own URL, almost
 * none repeat, and they would only push useful pages out of the cache.
 */
export function edgeCacheRuleFor(pathname: string, searchParams: URLSearchParams): EdgeCacheRule | null {
  if (searchParams.has("q")) return null;
  // An RSC request asked for by URL rather than header. Never a document.
  if (searchParams.has("_rsc")) return null;
  for (const { match, rule } of PAGE_RULES) {
    if (match(pathname)) return rule;
  }
  return null;
}

/**
 * Whether a request is a plain document/asset fetch that a cached copy can
 * answer. Router requests (RSC payloads, prefetches, segment prefetches) and
 * Server Actions carry headers whose values change the response for the same
 * URL, and Workers' Cache API ignores `Vary` — so they always go to Next.js.
 */
export function isCacheableRequestShape(method: string, header: (name: string) => string | null): boolean {
  if (method !== "GET" && method !== "HEAD") return false;
  // OpenNext's ISR queue revalidates a page by sending this Worker a cookie-less
  // HEAD with these two headers (@opennextjs/cloudflare durable-objects/queue.js)
  // and treats anything but `x-nextjs-cache: REVALIDATED` as fatal. Answering
  // it from this cache would silently stop every ISR page from ever refreshing.
  if (header("x-prerender-revalidate") !== null || header("x-isr") !== null) return false;
  if (header("rsc") !== null) return false;
  if (header("next-router-prefetch") !== null) return false;
  if (header("next-router-segment-prefetch") !== null) return false;
  if (header("next-router-state-tree") !== null) return false;
  if (header("next-action") !== null) return false;
  // A client that asked for a fresh copy gets one.
  if (/no-cache/i.test(header("cache-control") ?? "")) return false;
  return true;
}

/**
 * Whether the request carries no signed-in Clerk state.
 *
 * Clerk's cookie names (verified against @clerk/backend's constants):
 * `__session`, `__client_uat`, `__refresh`, `__clerk_db_jwt`,
 * `__clerk_handshake`, `__clerk_redirect_count` — each optionally suffixed
 * (`__session_<suffix>`). A signed-out browser holds `__client_uat=0`, which
 * is anonymous. Any other value of it means the browser has, or had, a
 * session, and Clerk's middleware must see the request (a handshake may be
 * due), so it bypasses the cache.
 */
export function isAnonymousRequest(cookieHeader: string | null, searchParams: URLSearchParams): boolean {
  for (const key of searchParams.keys()) {
    if (key.startsWith("__clerk")) return false;
  }
  if (!cookieHeader) return true;

  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    const name = (eq === -1 ? part : part.slice(0, eq)).trim();
    const value = eq === -1 ? "" : part.slice(eq + 1).trim();

    if (name.startsWith("__session") || name.startsWith("__refresh") || name.startsWith("__clerk")) {
      return false;
    }
    if (name.startsWith("__client_uat") && value !== "" && value !== "0") return false;
  }
  return true;
}

/**
 * The cache key for a request: a synthetic URL that includes the deployed
 * version, so a deploy can never serve a document that points at the previous
 * build's (deleted) `/_next/static` chunks — the failure recorded at the top
 * of worker-entry.js. Tracking parameters are dropped and the rest sorted, so
 * `?a=1&b=2` and `?b=2&a=1` share an entry.
 */
export function edgeCacheKey(url: URL, version: string): string {
  const params = [...url.searchParams.entries()]
    .filter(([key]) => !IGNORED_PARAMS.test(key))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const query = new URLSearchParams(params).toString();
  return `https://${url.hostname}/__edge-cache/${encodeURIComponent(version)}${url.pathname}${query ? `?${query}` : ""}`;
}

export type CacheFreshness = "fresh" | "stale" | "expired";

/** Where a stored page sits in its rule's lifetime. */
export function freshnessOf(storedAtMs: number, nowMs: number, rule: EdgeCacheRule): CacheFreshness {
  const ageSeconds = (nowMs - storedAtMs) / 1000;
  if (!(ageSeconds >= 0)) return "expired"; // NaN or a clock that ran backwards
  if (ageSeconds < rule.fresh) return "fresh";
  if (ageSeconds < rule.fresh + rule.stale) return "stale";
  return "expired";
}

/**
 * Whether a response from Next.js may be stored for anonymous visitors.
 *
 * 200 only: a 404 for a mistyped slug is not worth a cache entry, and nothing
 * else is a page. A `Set-Cookie` means the response was written for one
 * browser. The content type must be one of the four this allowlist produces.
 */
export function isStorableResponse(status: number, header: (name: string) => string | null): boolean {
  if (status !== 200) return false;
  if (header("set-cookie") !== null) return false;
  const type = (header("content-type") ?? "").toLowerCase();
  return (
    type.startsWith("text/html") ||
    type.startsWith("image/") ||
    type.startsWith("application/xml") ||
    type.startsWith("text/plain")
  );
}

/** `/products/<slug>` → `<slug>`, for the view counter; null for anything else. */
export function productSlugFromPath(pathname: string): string | null {
  const match = /^\/products\/([a-z0-9-]+)$/.exec(pathname);
  return match ? match[1] : null;
}

// ── Telemetry ────────────────────────────────────────────────────────────

/**
 * A low-cardinality label for a path, so a log search groups every product
 * page together instead of one line per slug. Never contains a query string
 * (search terms are user input).
 */
export function routeLabel(pathname: string): string {
  if (pathname === "/") return "/";
  const segments = pathname.split("/").filter(Boolean);
  const [first, second, third] = segments;
  if (first === "_next") return "/_next/*";
  if (first === "api") return `/api/${second ?? ""}`.replace(/\/$/, "");
  if (segments.length === 1) return `/${first}`;
  if (first === "products" && third === "opengraph-image") return "/products/:slug/opengraph-image";
  if (first === "products" && third === "edit") return "/products/:slug/edit";
  if (first === "funding" && second === "guides") return segments.length > 2 ? "/funding/guides/:slug" : "/funding/guides";
  if (first === "funding" && second === "investors") return "/funding/investors";
  if (first === "dashboard" || first === "admin") return `/${first}/${second}${segments.length > 2 ? "/*" : ""}`;
  return `/${first}/:slug`;
}

/** Where a subrequest went, by host. Nothing else about it is recorded. */
export type SubrequestKind = "db" | "cache" | "auth" | "ai" | "external";

export function subrequestKind(host: string): SubrequestKind {
  if (host.endsWith(".supabase.co")) return "db";
  if (host.endsWith(".upstash.io")) return "cache";
  if (host.endsWith("clerk.com") || host.endsWith("clerk.dev") || host.startsWith("clerk.") || host.endsWith(".clerk.accounts.dev")) {
    return "auth";
  }
  if (host === "api.anthropic.com" || host === "api.openai.com") return "ai";
  return "external";
}

/** Self-declared crawlers. Coarse on purpose: it answers "how much is bots". */
export function isLikelyBot(userAgent: string | null): boolean {
  if (!userAgent) return true;
  return /bot|crawl|spider|slurp|facebookexternalhit|embedly|preview|curl|wget|python-requests|go-http-client|httpclient|headless/i.test(userAgent);
}
