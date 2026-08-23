"use client";

/**
 * Pushes a Consent Mode update when the visitor changes their cookie choice
 * without reloading.
 *
 * Split out from `google-analytics.tsx` because that file must stay a Server
 * Component — see the note there. This is the only part that genuinely needs
 * the client.
 */

import { useEffect, useRef } from "react";

import type { ConsentValue } from "@/lib/cookie-consent";
import { useConsent } from "@/hooks/use-cookie-consent";
import { updateConsentSignals } from "@/lib/analytics";

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
    updateConsentSignals(consent === "accepted");
  }, [consent]);

  return null;
}
