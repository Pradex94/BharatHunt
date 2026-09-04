"use client";

/**
 * The one `investor_page_view` event for /investors.
 *
 * Separate from GA4's automatic `page_view` (components/analytics/ga-page-views.tsx)
 * because it answers a different question: that one counts visits to a URL, this
 * one records which *tier* the visitor arrived as. "How many people saw the
 * locked page and how many already had access" is the whole funnel, and it is
 * not derivable from a page path.
 *
 * Its own component, and a tiny one, so the page can stay a Server Component.
 * Firing this from inside `UnlockDirectory` or `InvestorDirectory` would tie the
 * count to whichever of them happened to render, which is exactly the variable
 * being measured.
 *
 * The ref, not an empty dependency array, is what keeps it to one event: React
 * double-invokes effects in development, and `trackEvent` has no idea it is
 * being asked twice.
 */

import { useEffect, useRef } from "react";

import { trackEvent } from "@/lib/analytics";

export function InvestorPageAnalytics({
  tier,
}: {
  tier: "visitor" | "free_signed_in" | "paid";
}) {
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    trackEvent("investor_page_view", { location: "investors", tier });
  }, [tier]);

  return null;
}
