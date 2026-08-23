/**
 * Google Analytics 4 — the one place that knows how GA is loaded, gated, and fed.
 *
 * Framework-agnostic and safe to import from a client component: every function
 * guards on `window`/`document` and no-ops during SSR. `components/analytics/`
 * holds the React shells; the rules live here so the bootstrap script, the
 * page-view sender and the consent updater cannot drift apart.
 *
 * GA4 is loaded directly (gtag.js), not through Tag Manager and not through
 * `@next/third-parties`. Consent Mode defaults have to be pushed *before* the
 * loader executes, which neither of those gives us control over, and a
 * measurement setup that lives in version control is reviewable in a way UI
 * state inside one person's Google account is not.
 */

import { GA_ENABLED, GA_ID } from "@/lib/constants";
import { CONSENT_COOKIE } from "@/lib/cookie-consent";

/** The gtag.js command queue shim — variadic and untyped by design. */
type Gtag = (...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    /** Defined by the bootstrap script in `components/analytics/google-analytics.tsx`. */
    gtag?: Gtag;
  }
}

/** Extra fields on an event — GA4 accepts arbitrary custom parameters. */
export type AnalyticsParams = Record<string, unknown>;

/** The official gtag.js loader. The `?id=G-…` query is appended by callers. */
const GA_LOADER_SRC = "https://www.googletagmanager.com/gtag/js";

/**
 * Routes that must never reach GA4.
 *
 * `/admin` is internal tooling and `/api` is not a page at all, so a `page_view`
 * for either is noise at best and a leaked internal URL structure at worst.
 * Add `/dashboard` here too if signed-in maker pages should stay out of the
 * reports — one line, and both the page-view sender and any manual
 * `trackEvent` caller pick it up.
 */
export const UNTRACKED_PATH_PREFIXES = ["/admin", "/api"] as const;

/**
 * Whether a path is one we measure.
 *
 * Matches on a path *segment*, not a raw prefix: a future `/administrators`
 * page happens to start with the same letters as `/admin` and must stay
 * trackable. Query and hash are stripped first so callers can pass a full
 * `/marketplace?sort=newest` without thinking about it.
 */
export function isTrackablePath(path: string): boolean {
  const pathname = path.split("?")[0].split("#")[0];
  return !UNTRACKED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * The Google Consent Mode signals this site controls.
 *
 * `security_storage` is deliberately absent: it covers sign-in and fraud
 * prevention, which are the "essential cookies" the banner says we use either
 * way. Leaving it unset keeps it at Google's default of granted.
 */
const CONSENT_KEYS = [
  "ad_storage",
  "ad_user_data",
  "ad_personalization",
  "analytics_storage",
] as const;

type ConsentState = "granted" | "denied";

function consentSignals(state: ConsentState): Record<string, ConsentState> {
  return Object.fromEntries(CONSENT_KEYS.map((key) => [key, state] as const));
}

/**
 * The inline `<head>` script: consent defaults, then the GA4 loader and config.
 *
 * Consent defaults must be queued before the loader runs, or the tag briefly
 * measures unconsented — which is why this is one script and not two.
 *
 * It reads the consent cookie itself rather than taking it as a prop, because
 * it runs before React hydrates and the value has to be right on the very first
 * paint for a returning visitor. `wait_for_update` gives someone who is
 * mid-decision a moment before the tag settles on denied.
 *
 * `send_page_view: false` is the important half of the config. The App Router
 * navigates with `history.pushState`, so this script runs exactly once per full
 * page load; left on its own GA4 would record the entry page and nothing else.
 * `components/analytics/ga-page-views.tsx` sends every view instead, the first
 * one included, so there is a single code path and no chance of double counting.
 */
export function analyticsBootstrapScript(): string {
  const granted = JSON.stringify(consentSignals("granted"));
  const denied = JSON.stringify(consentSignals("denied"));

  return [
    "window.dataLayer = window.dataLayer || [];",
    "function gtag(){dataLayer.push(arguments);}",
    "var bhConsent = document.cookie.split('; ').find(function (row) {",
    `  return row.indexOf('${CONSENT_COOKIE}=') === 0;`,
    "});",
    "gtag('consent', 'default', Object.assign(",
    `  bhConsent === '${CONSENT_COOKIE}=accepted' ? ${granted} : ${denied},`,
    "  { wait_for_update: 500 }",
    "));",
    "(function(d,s,i){var f=d.getElementsByTagName(s)[0],j=d.createElement(s);",
    `j.async=true;j.src='${GA_LOADER_SRC}?id='+i;`,
    `f.parentNode.insertBefore(j,f);})(document,'script','${GA_ID}');`,
    "gtag('js', new Date());",
    `gtag('config', '${GA_ID}', { send_page_view: false });`,
  ].join("\n");
}

/**
 * Ensure gtag.js is present and configured. Returns whether GA is live.
 *
 * On this site the normal path is a no-op: the `<head>` bootstrap has already
 * defined `window.gtag` before any React code runs, and re-running the loader
 * would give the page two GA4 tags and double every hit. So this checks for
 * both an existing shim and an in-flight loader tag before injecting anything —
 * calling it twice, or calling it on a page that already has the bootstrap, is
 * safe.
 *
 * It exists for the case the bootstrap does not cover: mounting analytics from
 * a client component that renders outside the root layout.
 */
export function initAnalytics(): boolean {
  if (typeof window === "undefined" || !GA_ENABLED) return false;

  // The head bootstrap already ran — the common case.
  if (window.gtag) return true;
  // A loader is already in flight from an earlier call; its shim will appear.
  if (document.querySelector(`script[src^="${GA_LOADER_SRC}"]`)) return true;

  window.dataLayer = window.dataLayer ?? [];
  // gtag.js reads the `arguments` object back out of the queue, so this has to
  // be a classic function — an arrow function pushing a rest array is not the
  // same thing.
  const queue: Gtag = function gtag() {
    // gtag.js reads an Arguments object back out of the queue; a rest array is
    // not interchangeable here.
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer?.push(arguments);
  };
  window.gtag = queue;

  queue("consent", "default", { ...consentSignals("denied"), wait_for_update: 500 });

  const script = document.createElement("script");
  script.async = true;
  script.src = `${GA_LOADER_SRC}?id=${GA_ID}`;
  document.head.appendChild(script);

  queue("js", new Date());
  queue("config", GA_ID, { send_page_view: false });

  return true;
}

/**
 * Send a GA4 event.
 *
 * Silent when GA is switched off, and silent when `gtag` is missing — a blocked
 * loader (ad blocker, extension, CSP) is the normal state for a good share of
 * visitors, and analytics must never be the reason a page throws.
 */
export function trackEvent(name: string, params: AnalyticsParams = {}): void {
  if (typeof window === "undefined" || !GA_ENABLED) return;
  if (!window.gtag) return;

  window.gtag("event", name, { send_to: GA_ID, ...params });
}

/**
 * Send a `page_view` for `path` — an app path such as `/marketplace?sort=newest`.
 *
 * Excluded paths are dropped here rather than at the call site, so every route
 * that ever sends a view passes the same gate.
 */
export function trackPageView(path: string, params: AnalyticsParams = {}): void {
  if (typeof window === "undefined" || !GA_ENABLED) return;
  if (!isTrackablePath(path)) return;

  trackEvent("page_view", {
    page_path: path,
    page_location: `${window.location.origin}${path}`,
    page_title: document.title,
    ...params,
  });
}

/**
 * Push a Consent Mode update after the visitor changes their cookie choice.
 *
 * No-ops when the loader was blocked: pushing a lone message into a dataLayer
 * nobody reads accomplishes nothing.
 */
export function updateConsentSignals(granted: boolean): void {
  if (typeof window === "undefined") return;

  window.gtag?.("consent", "update", consentSignals(granted ? "granted" : "denied"));
}
