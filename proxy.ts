import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export default clerkMiddleware((_auth, request) => {
  // /advertise was removed, but old Server Action clients can continue to
  // replay POST requests to that path. Reject them before Next.js or any
  // email/database code gets a chance to run.
  if (request.nextUrl.pathname === "/advertise") {
    return new NextResponse(null, { status: 410 });
  }
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
