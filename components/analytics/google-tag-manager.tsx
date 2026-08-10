/**
 * Google Tag Manager, wired to the site's own cookie consent.
 *
 * The banner in `components/layout/cookie-consent.tsx` tells visitors we use
 * "optional [cookies] to understand how Bharat Hunt is used" and offers a
 * Decline button. Loading GTM the way the install snippet suggests — plain
 * `<script>` in `<head>`, firing for everyone — would make that button
 * decorative and the sentence untrue. So this uses Google Consent Mode v2
 * instead: the container always loads (so tags stay manageable from the GTM UI
 * and Tag Assistant can verify the install), but storage is **denied by
 * default** and only granted once someone accepts.
 *
 * **This file must stay a Server Component.** `next/script`'s
 * `beforeInteractive` strategy is only injected into the server-rendered
 * `<head>` when it is rendered from server code. Add `"use client"` here and
 * Next silently downgrades it: the script gets pushed into the client-side
 * `self.__next_s` queue and runs after the framework bootstraps, which is far
 * later than GTM asks for. The live consent updater lives in `consent-sync.tsx`
 * for exactly this reason.
 *
 * Ordering is the other half of the trick. `gtag('consent', 'default', ...)`
 * has to run before `gtm.js` executes, or the container briefly runs
 * unconsented. Putting both in a single script guarantees it.
 *
 * The bootstrap reads the consent cookie itself rather than taking it as a
 * prop, because it runs before React hydrates and the value has to be right on
 * the very first paint for a returning visitor.
 */

import { CONSENT_COOKIE } from "@/lib/cookie-consent";
import { GTM_ID } from "@/lib/constants";
import { CONSENT_KEYS } from "./consent-keys";

function consentPayload(state: "granted" | "denied"): string {
  return JSON.stringify(Object.fromEntries(CONSENT_KEYS.map((key) => [key, state])));
}

/**
 * Consent defaults + the GTM loader, as one inline script.
 *
 * `wait_for_update` gives a visitor who is mid-decision a moment before tags
 * settle on denied.
 */
function bootstrapScript(gtmId: string): string {
  return `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
var bhConsent = document.cookie.split('; ').find(function (row) {
  return row.indexOf('${CONSENT_COOKIE}=') === 0;
});
var bhGranted = bhConsent === '${CONSENT_COOKIE}=accepted';
gtag('consent', 'default', Object.assign(
  bhGranted ? ${consentPayload("granted")} : ${consentPayload("denied")},
  { wait_for_update: 500 }
));
(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${gtmId}');
`.trim();
}

/**
 * Head half: consent defaults, then the container.
 *
 * **Render this inside an explicit `<head>` element in the root layout.** That
 * requirement is not decoration -- two more obvious placements were measured
 * against the rendered HTML of a production build and both failed:
 *
 *   - `next/script` with `strategy="beforeInteractive"` documents itself as
 *     "always injected inside the head". That holds for `src` scripts only. An
 *     **inline** script is pushed into Next's client-side `self.__next_s`
 *     queue and does not run until the framework bootstraps -- it appeared at
 *     byte ~4983, inside `<body>`, wrapped in `(self.__next_s=...).push(...)`.
 *   - A raw `<script>` placed between `<html>` and `<body>` is not hoisted
 *     either. React only hoists `<title>`, `<meta>`, `<link>` and
 *     `<script async src>`; an inline script renders in place, which resolved
 *     to the first position inside `<body>` (byte 4789, with `</head>` ending
 *     at 4698).
 *
 * Wrapped in `<head>` it lands where GTM asks for it: consent defaults at byte
 * ~4900 and the loader at ~5424, both before `</head>` at 5632.
 *
 * If you move this, re-check the built HTML rather than trusting the placement
 * to survive -- none of the three behaviours above are obvious from the source.
 */
export function GoogleTagManager() {
  if (!GTM_ID) return null;

  return <script dangerouslySetInnerHTML={{ __html: bootstrapScript(GTM_ID) }} />;
}

/**
 * Body half: the `<noscript>` fallback GTM asks for immediately after `<body>`.
 *
 * Kept separate from the loader because it has to live in a different place in
 * the document. It carries no consent gate of its own — with JavaScript off
 * there is no Consent Mode to speak of, and this iframe sets no cookies by
 * itself; it only fires tags configured to run without them.
 */
export function GoogleTagManagerNoScript() {
  if (!GTM_ID) return null;

  return (
    <noscript>
      <iframe
        src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
        height="0"
        width="0"
        style={{ display: "none", visibility: "hidden" }}
        title="Google Tag Manager"
      />
    </noscript>
  );
}
