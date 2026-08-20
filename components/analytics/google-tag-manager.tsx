/**
 * The Google tags — Tag Manager and GA4 — wired to the site's own cookie consent.
 *
 * The banner in `components/layout/cookie-consent.tsx` tells visitors we use
 * "optional [cookies] to understand how Bharat Hunt is used" and offers a
 * Decline button. Loading these the way the install snippets suggest — plain
 * `<script>` in `<head>`, firing for everyone — would make that button
 * decorative and the sentence untrue. So this uses Google Consent Mode v2
 * instead: the tags always load (so they stay manageable from the GTM UI and
 * Tag Assistant can verify the install), but storage is **denied by default**
 * and only granted once someone accepts. Until then GA4 still receives
 * cookieless pings, which is the behaviour `app/cookies` describes.
 *
 * **Both tags share one bootstrap script, and that is deliberate.**
 * `gtag('consent', 'default', ...)` has to run before either loader executes,
 * or the tags briefly run unconsented. Separate `<script>` elements do not
 * guarantee that ordering; one script does. They also share the single
 * `window.dataLayer` and the single `gtag()` shim, which is what lets one
 * consent update reach both.
 *
 * **This file must stay a Server Component.** `next/script`'s
 * `beforeInteractive` strategy is only injected into the server-rendered
 * `<head>` when it is rendered from server code. Add `"use client"` here and
 * Next silently downgrades it: the script gets pushed into the client-side
 * `self.__next_s` queue and runs after the framework bootstraps, which is far
 * later than the tags ask for. The live consent updater lives in
 * `consent-sync.tsx` for exactly this reason.
 *
 * The bootstrap reads the consent cookie itself rather than taking it as a
 * prop, because it runs before React hydrates and the value has to be right on
 * the very first paint for a returning visitor.
 */

import { CONSENT_COOKIE } from "@/lib/cookie-consent";
import {
  GA_ENABLED,
  GA_ID,
  GOOGLE_TAGS_ENABLED,
  GTM_ENABLED,
  GTM_ID,
} from "@/lib/constants";
import { CONSENT_KEYS } from "./consent-keys";

function consentPayload(state: "granted" | "denied"): string {
  return JSON.stringify(Object.fromEntries(CONSENT_KEYS.map((key) => [key, state])));
}

/** The GTM container loader, straight from the install snippet. */
function gtmLoader(gtmId: string): string {
  return `
(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${gtmId}');`.trim();
}

/**
 * The GA4 loader and config.
 *
 * `send_page_view: false` is the important part. GA4 would otherwise count one
 * page view here and never hear about a client-side route change, because the
 * App Router navigates with `history.pushState` and never re-runs this script.
 * `ga-page-views.tsx` sends every view instead — including the first — so
 * navigations are counted with the title and URL they actually landed on.
 *
 * That means GA4's Enhanced measurement setting **"Page changes based on
 * browser history events" must be turned off** (Admin > Data streams > your
 * stream > Enhanced measurement). Left on, it fires its own page view on each
 * pushState and every navigation is counted twice.
 */
function gaLoader(gaId: string): string {
  return `
(function(d,s,i){var f=d.getElementsByTagName(s)[0],j=d.createElement(s);
j.async=true;j.src='https://www.googletagmanager.com/gtag/js?id='+i;
f.parentNode.insertBefore(j,f);})(document,'script','${gaId}');
gtag('js', new Date());
gtag('config', '${gaId}', { send_page_view: false });`.trim();
}

/**
 * Consent defaults first, then whichever loaders are configured.
 *
 * `wait_for_update` gives a visitor who is mid-decision a moment before tags
 * settle on denied.
 */
function bootstrapScript(): string {
  const loaders = [
    GTM_ENABLED ? gtmLoader(GTM_ID) : "",
    GA_ENABLED ? gaLoader(GA_ID) : "",
  ].filter(Boolean);

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
${loaders.join("\n")}
`.trim();
}

/**
 * Head half: consent defaults, then the containers.
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
 * Wrapped in `<head>` it lands where the tags ask for it: consent defaults and
 * both loaders before `</head>`.
 *
 * If you move this, re-check the built HTML rather than trusting the placement
 * to survive -- none of the three behaviours above are obvious from the source.
 */
export function GoogleTagManager() {
  if (!GOOGLE_TAGS_ENABLED) return null;

  return <script dangerouslySetInnerHTML={{ __html: bootstrapScript() }} />;
}

/**
 * Body half: the `<noscript>` fallback GTM asks for immediately after `<body>`.
 *
 * GTM-only — GA4 has no scriptless mode, so there is nothing to mirror here.
 * Kept separate from the loader because it has to live in a different place in
 * the document. It carries no consent gate of its own — with JavaScript off
 * there is no Consent Mode to speak of, and this iframe sets no cookies by
 * itself; it only fires tags configured to run without them.
 */
export function GoogleTagManagerNoScript() {
  if (!GTM_ENABLED) return null;

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
