"use client";

import { useSyncExternalStore } from "react";

import { getConsent, subscribeConsent, type ConsentValue } from "@/lib/cookie-consent";

/**
 * Reactive cookie-consent value. `useSyncExternalStore` reads the cookie as a
 * client snapshot (with a stable `null` server snapshot), so there's no
 * `setState`-in-effect and no hydration mismatch — the value simply updates
 * whenever `setConsent`/`clearConsent` fire the change event.
 */
export function useConsent(): ConsentValue | null {
  return useSyncExternalStore(subscribeConsent, getConsent, () => null);
}

/**
 * `false` during SSR and the hydration render, then `true` — lets client-only
 * UI (the consent banner) mount without a flash for visitors who already chose.
 */
export function useIsHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}
