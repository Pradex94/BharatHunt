/**
 * The GA4 tag, wired to the site's own cookie consent.
 *
 * The banner in `components/layout/cookie-consent.tsx` tells visitors we use
 * "optional [cookies] to understand how Bharat Hunt is used" and offers a
 * Decline button. Loading gtag.js the way the install snippet suggests — plain
 * `<script>` in `<head>`, firing for everyone — would make that button
 * decorative and the sentence untrue. So this uses Google Consent Mode v2
 * instead: the tag always loads (so the install stays verifiable in Tag
 * Assistant), but storage is **denied by default** and only granted once
 * someone accepts. Until then GA4 still receives cookieless pings, which is the
 * behaviour `app/cookies` describes.
 *
 * The script itself is built in `lib/analytics.ts`; this file is only the
 * placement. And placement is the part that is easy to get wrong.
 *
 * **This file must stay a Server Component.** `next/script`'s
 * `beforeInteractive` strategy is only injected into the server-rendered
 * `<head>` when it is rendered from server code. Add `"use client"` here and
 * Next silently downgrades it: the script gets pushed into the client-side
 * `self.__next_s` queue and runs after the framework bootstraps, far later than
 * the tag asks for. The live consent updater lives in `consent-sync.tsx` for
 * exactly this reason.
 */

import { GA_ENABLED } from "@/lib/constants";
import { analyticsBootstrapScript } from "@/lib/analytics";

/**
 * Consent defaults, then the GA4 loader and config.
 *
 * **Render this inside an explicit `<head>` element in the root layout.** That
 * requirement is not decoration — two more obvious placements were measured
 * against the rendered HTML of a production build and both failed:
 *
 *   - `next/script` with `strategy="beforeInteractive"` documents itself as
 *     "always injected inside the head". That holds for `src` scripts only. An
 *     **inline** script is pushed into Next's client-side `self.__next_s`
 *     queue and does not run until the framework bootstraps — it appeared at
 *     byte ~4983, inside `<body>`, wrapped in `(self.__next_s=...).push(...)`.
 *   - A raw `<script>` placed between `<html>` and `<body>` is not hoisted
 *     either. React only hoists `<title>`, `<meta>`, `<link>` and
 *     `<script async src>`; an inline script renders in place, which resolved
 *     to the first position inside `<body>` (byte 4789, with `</head>` ending
 *     at 4698).
 *
 * Wrapped in `<head>` it lands where the tag asks for it: consent defaults and
 * the loader before `</head>`.
 *
 * If you move this, re-check the built HTML rather than trusting the placement
 * to survive — none of the three behaviours above are obvious from the source.
 */
export function GoogleAnalytics() {
  if (!GA_ENABLED) return null;

  return <script dangerouslySetInnerHTML={{ __html: analyticsBootstrapScript() }} />;
}
