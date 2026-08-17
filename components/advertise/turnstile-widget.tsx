"use client";

/**
 * Cloudflare Turnstile challenge for the advertise inquiry form.
 *
 * Rendered explicitly (rather than via the auto-render class) so the token
 * lives in React state and reaches the Server Action through a plain hidden
 * input. `lib/actions/ad-inquiry.ts` re-verifies that token server-side — this
 * widget is the UX half of the check, never the enforcement.
 */

import Script from "next/script";
import { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Ref } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

/**
 * Whether a site key is configured. Without one there is no challenge to solve
 * and the server rejects every submission (it fails closed), so the form shows
 * an email fallback instead of a button that could never succeed.
 */
export const isTurnstileConfigured = Boolean(siteKey);

/**
 * Turnstile tokens are single-use, so a submission the server rejected has
 * spent its token; without a reset the next attempt replays a dead token and
 * fails the check forever. The form calls `reset()` when an attempt comes back
 * with an error.
 */
export type TurnstileHandle = { reset: () => void };

type TurnstileWidgetProps = {
  onTokenChange: (token: string) => void;
  ref?: Ref<TurnstileHandle>;
};

export function TurnstileWidget({ onTokenChange, ref }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | undefined>(undefined);
  const [scriptReady, setScriptReady] = useState(false);
  const [token, setToken] = useState("");

  // The Turnstile callbacks outlive the render that created them, so reach the
  // parent through a ref: a new `onTokenChange` identity must not tear down and
  // re-render the challenge (which would drop a token the user already solved).
  const onTokenChangeRef = useRef(onTokenChange);
  useEffect(() => {
    onTokenChangeRef.current = onTokenChange;
  }, [onTokenChange]);

  const update = useCallback((next: string) => {
    setToken(next);
    onTokenChangeRef.current(next);
  }, []);

  useEffect(() => {
    if (!siteKey || !scriptReady) return;

    let cancelled = false;
    let timer: number | undefined;

    const renderWidget = () => {
      if (cancelled || widgetId.current || !containerRef.current || !window.turnstile) return false;
      widgetId.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: (next: string) => update(next),
        // Expiry and error both return the form to "unsolved" so the user can
        // never submit a token the server is going to reject.
        "expired-callback": () => update(""),
        "error-callback": () => update(""),
      });
      return true;
    };

    // `onReady` fires after api.js loads, but keep a short poll for the case
    // where the global isn't installed yet — and stop it the moment it lands.
    if (!renderWidget()) {
      timer = window.setInterval(() => {
        if (renderWidget() && timer !== undefined) window.clearInterval(timer);
      }, 100);
    }

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearInterval(timer);
      if (widgetId.current) {
        window.turnstile?.remove(widgetId.current);
        widgetId.current = undefined;
      }
    };
  }, [scriptReady, update]);

  useImperativeHandle(
    ref,
    () => ({
      reset: () => {
        if (widgetId.current) window.turnstile?.reset(widgetId.current);
        update("");
      },
    }),
    [update],
  );

  if (!siteKey) return null;

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
      />
      <div ref={containerRef} className="min-h-[65px]" aria-label="Security verification" />
      <input type="hidden" name="cf-turnstile-response" value={token} readOnly />
    </>
  );
}
