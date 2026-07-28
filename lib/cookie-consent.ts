/**
 * Cookie-consent state for the platform.
 *
 * The choice is stored in a first-party cookie (not localStorage) so that a
 * future server read — or an analytics gate — can see it too. This module is
 * framework-agnostic and safe to import from client components: every function
 * guards on `document`/`window` and no-ops during SSR.
 */

export const CONSENT_COOKIE = "bh_cookie_consent";

/** Remember the choice for a year, matching common consent-refresh cadence. */
export const CONSENT_MAX_AGE = 60 * 60 * 24 * 365;

/** Fired on any set/clear so React (useSyncExternalStore) and the banner update. */
const CONSENT_EVENT = "bh:cookie-consent-changed";

export type ConsentValue = "accepted" | "declined";

/** Subscribe to consent changes; returns an unsubscribe fn (no-op on server). */
export function subscribeConsent(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CONSENT_EVENT, callback);
  return () => window.removeEventListener(CONSENT_EVENT, callback);
}

function emitConsentChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CONSENT_EVENT));
}

/** Current choice, or `null` if the visitor hasn't decided yet. */
export function getConsent(): ConsentValue | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${CONSENT_COOKIE}=`));
  const value = match?.slice(CONSENT_COOKIE.length + 1);
  return value === "accepted" || value === "declined" ? value : null;
}

/** Persist a choice. `Secure` is added only over HTTPS so dev (http) still works. */
export function setConsent(value: ConsentValue): void {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${value}; path=/; max-age=${CONSENT_MAX_AGE}; SameSite=Lax${secure}`;
  emitConsentChange();
}

/** Forget the choice — the banner will show again on next load. */
export function clearConsent(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${CONSENT_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
  emitConsentChange();
}
