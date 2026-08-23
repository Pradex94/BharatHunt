"use client";

/**
 * Sends a GA4 `page_view` for every route the visitor lands on.
 *
 * The App Router navigates with `history.pushState`, so the bootstrap script in
 * `google-analytics.tsx` runs exactly once per full page load and GA4 would
 * otherwise record only the entry page — every subsequent click would be
 * invisible. That is why the config there sets `send_page_view: false`: page
 * views are sent from here instead, including the very first one, so there is a
 * single code path and no chance of the entry view being counted twice.
 *
 * Search params are part of the identity of a page here, not noise: the
 * marketplace keeps category, sort, pricing, query and page in the URL
 * (`hooks/use-update-search-params.ts`), so `/marketplace?category=ai` and
 * `/marketplace?category=devtools` are genuinely different views and reporting
 * needs to tell them apart.
 *
 * Admin and API paths never reach GA — `trackPageView` drops them
 * (`UNTRACKED_PATH_PREFIXES` in `lib/analytics.ts`).
 *
 * No consent check. That is Consent Mode's job — with `analytics_storage`
 * denied, GA4 still receives these as cookieless pings and stores nothing on
 * the device, which is exactly what `app/cookies` promises. Gating here as well
 * would only make the two mechanisms disagree.
 */

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { GA_ENABLED } from "@/lib/constants";
import { trackPageView } from "@/lib/analytics";

function GaPageViewsInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // `searchParams` is a new object identity on every render, so depend on its
  // serialised form -- otherwise this fires on renders that changed no URL.
  const query = searchParams.toString();

  useEffect(() => {
    trackPageView(query ? `${pathname}?${query}` : pathname);
  }, [pathname, query]);

  return null;
}

/**
 * The `<Suspense>` boundary is required, not stylistic. `useSearchParams` makes
 * the client tree up to the nearest boundary client-rendered, and a production
 * build of a static page that calls it without one fails outright ("Missing
 * Suspense boundary with useSearchParams"). Keeping it here rather than in the
 * root layout means a caller cannot mount this component wrongly. It renders
 * nothing, so the fallback is `null`.
 */
export function GaPageViews() {
  if (!GA_ENABLED) return null;

  return (
    <Suspense fallback={null}>
      <GaPageViewsInner />
    </Suspense>
  );
}
