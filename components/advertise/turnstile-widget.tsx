"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";

type TurnstileWidgetProps = {
  onTokenChange: (token: string) => void;
};

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export function TurnstileWidget({ onTokenChange }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!siteKey) return;

    const renderWidget = () => {
      if (!containerRef.current || !window.turnstile || widgetId.current) return;
      widgetId.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
        callback: (token: string) => {
        const input = containerRef.current?.closest("form")?.elements.namedItem("cf-turnstile-response");
          if (input instanceof HTMLInputElement) input.value = token;
          onTokenChange(token);
        },
      "expired-callback": () => {
        const input = containerRef.current?.closest("form")?.elements.namedItem("cf-turnstile-response");
          if (input instanceof HTMLInputElement) input.value = "";
          onTokenChange("");
      },
      });
    };

    renderWidget();
    const timer = window.setInterval(renderWidget, 100);

    return () => {
      window.clearInterval(timer);
      if (containerRef.current) containerRef.current.replaceChildren();
    };
  }, [onTokenChange]);

  if (!siteKey) return null;

  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />
      <div ref={containerRef} className="min-h-[65px]" aria-label="Security verification" />
      <input type="hidden" name="cf-turnstile-response" />
    </>
  );
}
