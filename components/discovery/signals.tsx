"use client";

import { useEffect } from "react";

import { sendSignal, sendSignals } from "@/lib/signals-client";
import type { SignalEvent } from "@/lib/signal-events";

/**
 * Records a product view from the browser rather than the server render.
 * Product pages can be served from a cache that never reaches the server, and
 * most bots do not run JavaScript — so a beacon counts people more honestly
 * than the render does. Renders nothing.
 */
export function ProductViewBeacon({ productId }: { productId: string }) {
  useEffect(() => {
    sendSignal("view", productId, "product");
  }, [productId]);
  return null;
}

/** Records impressions for a set of results once, when they are shown. */
export function ImpressionBeacon({
  productIds,
  event,
  surface,
}: {
  productIds: string[];
  event: SignalEvent;
  surface: string;
}) {
  const key = productIds.join(",");
  useEffect(() => {
    if (!key) return;
    sendSignals(key.split(",").map((productId) => ({ event, productId, surface })));
  }, [key, event, surface]);
  return null;
}

/**
 * An outbound link to a product's own site that records the click. Keeps the
 * caller's `rel` (dofollow and referrer behaviour are deliberate on product
 * pages) and adds nothing to the URL.
 */
export function TrackedExternalLink({
  productId,
  surface,
  ...anchor
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & { productId: string; surface: string }) {
  return (
    <a
      {...anchor}
      onClick={(event) => {
        sendSignal("website_click", productId, surface);
        anchor.onClick?.(event);
      }}
    />
  );
}

/**
 * Wraps a result (a card, a row) and records `event` when any link to the
 * product inside it is followed. Capture phase, so it sees the click before
 * client navigation does.
 */
export function SignalClickArea({
  productId,
  event,
  surface,
  className,
  children,
}: {
  productId: string;
  event: SignalEvent;
  surface: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={className}
      onClickCapture={(click) => {
        const target = click.target as HTMLElement | null;
        if (target?.closest('a[href^="/products/"]')) sendSignal(event, productId, surface);
      }}
    >
      {children}
    </div>
  );
}
