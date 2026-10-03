/**
 * Fire-and-forget engagement beacons, for client components. Uses
 * `navigator.sendBeacon` so a click that navigates away still gets recorded,
 * with a keepalive fetch as the fallback. Never throws, never awaits.
 *
 * No cookies, no identifiers: the server derives a daily-rotating anonymous
 * session hash itself (lib/signals.ts).
 */

import type { SignalEvent } from "@/lib/signal-events";

const ENDPOINT = "/api/signals";

export type ClientSignal = { event: SignalEvent; productId: string; surface?: string };

export function sendSignals(signals: ClientSignal[]): void {
  if (typeof window === "undefined" || signals.length === 0) return;
  const body = JSON.stringify({
    events: signals.map((signal) => ({ e: signal.event, p: signal.productId, s: signal.surface })),
  });
  try {
    if (navigator.sendBeacon?.(ENDPOINT, new Blob([body], { type: "application/json" }))) return;
  } catch {
    // Fall through to fetch.
  }
  fetch(ENDPOINT, {
    method: "POST",
    body,
    keepalive: true,
    headers: { "content-type": "application/json" },
  }).catch(() => {});
}

export function sendSignal(event: SignalEvent, productId: string, surface?: string): void {
  sendSignals([{ event, productId, surface }]);
}
