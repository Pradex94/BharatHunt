import { clerkMiddleware } from "@clerk/nextjs/server";
import type { NextRequest } from "next/server";

import { isBackgroundRequest, isDocumentRequest, isProbePath } from "@/lib/edge-policy";
import { anonymizeIp, checkRateLimit, clientIpFrom } from "@/lib/rate-limit";

/**
 * Global per-IP rate limit, applied before anything else the request would do.
 *
 * This is the safety net. The per-endpoint limits in the server actions are
 * finer-grained but only fire once a request has already reached an action;
 * this bounds *every* application request from a single address, whatever it
 * targets. Per the Next.js proxy docs, Server Functions are POST requests to
 * the route they live on, so this covers Server Actions as well as page and RSC
 * requests — there is no path into the app that skips it except the static
 * assets excluded by the matcher below.
 *
 * Ordering matters: the check runs before Clerk resolves a session and before
 * any route work, so a flood costs one Redis call rather than a database query
 * or an email send. Repeat offenders inside the same window are answered from
 * the limiter's in-process cache and cost nothing at all.
 *
 * It throttles, it does not ban. Exceeding the limit yields a 429 with a
 * `Retry-After`, and access resumes on its own once the window slides — which
 * matters because offices, universities, campus Wi-Fi and mobile CGNAT put many
 * legitimate users behind one address.
 */
async function enforceGlobalIpLimit(request: NextRequest): Promise<Response | null> {
  const header = (name: string) => request.headers.get(name);
  const ip = clientIpFrom(header);
  // Background requests (prefetches, client navigations, actions) have their
  // own budget. A page of links prefetches each one in view; counting those as
  // page loads once locked an admin out of the site after a few visits to the
  // product tables (2026-10-04). A refused background request makes the router
  // fall back to a full page load, which is counted — and allowed — separately.
  const scope = isBackgroundRequest(header) ? "globalIpBackground" : "globalIp";
  const result = await checkRateLimit(scope, `ip:${ip}`);

  if (result.ok) return null;

  // Truncated IP only — enough to correlate an attack, not a full identifier.
  // No headers, no body, no tokens.
  console.warn(
    JSON.stringify({
      event: "rate_limit_exceeded",
      scope,
      ip: anonymizeIp(ip),
      path: request.nextUrl.pathname,
      method: request.method,
      limit: result.limit,
      retryAfter: result.retryAfter,
      at: new Date().toISOString(),
    }),
  );

  const headers = {
    "retry-after": String(result.retryAfter),
    "x-ratelimit-limit": String(result.limit),
    "x-ratelimit-remaining": "0",
    // Never cache a 429 — the next window must be able to succeed.
    "cache-control": "no-store",
  };

  // A person loading a page gets a page, not a JSON string.
  if (isDocumentRequest(request.method, header)) {
    return new Response(rateLimitPage(result.retryAfter), {
      status: 429,
      headers: { ...headers, "content-type": "text/html; charset=utf-8" },
    });
  }

  return new Response(JSON.stringify({ error: "Too many requests. Please try again later." }), {
    status: 429,
    headers: { ...headers, "content-type": "application/json" },
  });
}

/** Self-contained (no app assets — those would be limited too), refreshes itself when the window passes. */
function rateLimitPage(retryAfter: number): string {
  const seconds = Math.max(1, Math.min(retryAfter, 120));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="${seconds}"><meta name="robots" content="noindex"><title>Slow down a moment · Bharat Hunt</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#fff9f5;color:#17140f;font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:16px}main{max-width:28rem;text-align:center}h1{font-size:1.5rem;margin:0 0 .5rem}p{color:#4b5563;margin:0 0 1rem}a{color:#ff6b1a;font-weight:600}</style></head><body><main><h1>Too many requests from your connection</h1><p>Bharat Hunt limits how fast one address can load pages. This page will reload by itself in about ${seconds} seconds.</p><p><a href="/">Back to Bharat Hunt</a></p></main></body></html>`;
}

export default clerkMiddleware(async (_auth, request) => {
  // Exploit probes (`/.env`, `/wp-admin`, `*.php`, ...) are answered before
  // they cost a rate-limit round trip or a rendered not-found page. On Workers,
  // worker-entry.js already answers these before this file is loaded; this is
  // the same rule for every other host (Vercel, `next start`).
  if (isProbePath(request.nextUrl.pathname)) {
    return new Response("Not found", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=86400" },
    });
  }

  // Returning a Response from the handler short-circuits the chain, so nothing
  // downstream runs for a rejected request.
  const limited = await enforceGlobalIpLimit(request);
  if (limited) return limited;
});

/**
 * Clerk's recommended matcher, verbatim from
 * https://clerk.com/docs/reference/nextjs/clerk-middleware
 *
 * The previous version only excluded `_next/static`, `_next/image` and
 * `favicon.ico`, so every other static asset woke the middleware for nothing --
 * production logs showed `clerkMiddleware` running on `GET /favicon.png`. In
 * Next 16 this file is `proxy.ts` and runs on the Node runtime, so each of
 * those is a real function invocation, not a free one.
 *
 * That exclusion list now does double duty: it is also what keeps the rate
 * limiter off CSS, fonts and images, so a page load spends one unit of an IP's
 * budget rather than one per asset.
 *
 * Note what stays covered: `/sitemap.xml` and `/robots.txt` are dynamic routes
 * here, and neither `.xml` nor `.txt` is in the exclusion list, so they still
 * pass through. Only genuinely static asset extensions are skipped, and none of
 * those ever need an auth decision.
 */
export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
    // Always run for Clerk-specific frontend API routes
    "/__clerk/(.*)",
  ],
};
