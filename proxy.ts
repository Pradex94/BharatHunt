import { clerkMiddleware } from "@clerk/nextjs/server";
import type { NextRequest } from "next/server";

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
  const ip = clientIpFrom((name) => request.headers.get(name));
  const result = await checkRateLimit("globalIp", `ip:${ip}`);

  if (result.ok) return null;

  // Truncated IP only — enough to correlate an attack, not a full identifier.
  // No headers, no body, no tokens.
  console.warn(
    JSON.stringify({
      event: "rate_limit_exceeded",
      scope: "globalIp",
      ip: anonymizeIp(ip),
      path: request.nextUrl.pathname,
      method: request.method,
      limit: result.limit,
      retryAfter: result.retryAfter,
      at: new Date().toISOString(),
    }),
  );

  return new Response(
    JSON.stringify({ error: "Too many requests. Please try again later." }),
    {
      status: 429,
      headers: {
        "content-type": "application/json",
        "retry-after": String(result.retryAfter),
        "x-ratelimit-limit": String(result.limit),
        "x-ratelimit-remaining": "0",
        // Never cache a 429 — the next window must be able to succeed.
        "cache-control": "no-store",
      },
    },
  );
}

export default clerkMiddleware(async (_auth, request) => {
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
