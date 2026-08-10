"use client";

/**
 * Pushes a Consent Mode update when the visitor changes their cookie choice
 * without reloading.
 *
 * Split out from `google-tag-manager.tsx` because that file must stay a Server
 * Component: `next/script`'s `beforeInteractive` strategy only gets injected
 * into the server-rendered `<head>` from server code. Marked `"use client"`
 * there, the whole subtree gets queued into Next's client-side script queue
 * instead and the tag stops loading as early as GTM's install instructions ask
 * for. This is the only part that genuinely needs the client.
 */

import { useEffect, useRef } from "react";

import type { ConsentValue } from "@/lib/cookie-consent";
import { useConsent } from "@/hooks/use-cookie-consent";
import { CONSENT_KEYS } from "./consent-keys";

declare global {
  interface Window {
    dataLayer?: unknown[];
    /** Defined globally by the GTM bootstrap script. */
    gtag?: (...args: unknown[]) => void;
  }
}

export function ConsentSync() {
  const consent = useConsent();
  const applied = useRef<ConsentValue | null | undefined>(undefined);

  useEffect(() => {
    // The bootstrap script already applied the stored value, so the first run
    // only records it. Re-pushing it would be a redundant hit.
    if (applied.current === undefined) {
      applied.current = consent;
      return;
    }
    if (applied.current === consent) return;
    applied.current = consent;

    // Undecided again (consent cleared) means back to denied.
    const state = consent === "accepted" ? "granted" : "denied";
    const signals = Object.fromEntries(CONSENT_KEYS.map((key) => [key, state]));

    // `gtag` is defined globally by the bootstrap script. If that was blocked
    // (ad blocker, CSP), there is no container listening -- so do nothing
    // rather than push a lone message into a dataLayer nobody reads.
    window.gtag?.("consent", "update", signals);
  }, [consent]);

  return null;
}
