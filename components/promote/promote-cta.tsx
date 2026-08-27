"use client";

/* Design system: design.md (Bharat Hunt — orange) · /promote
 *
 * A call to action that reports itself to GA4.
 *
 * Analytics goes through `lib/analytics.ts` — the site's existing GA4 setup,
 * consent-gated in the same place as every other event. No second measurement
 * system, no second consent story.
 *
 * In-page targets stay plain anchors rather than a scripted scroll: the browser
 * already respects `scroll-behavior`, moves keyboard focus to the target, and
 * does both before any JavaScript has hydrated.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import type { VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";
import { buttonVariants } from "@/components/ui/button";

type PromoteCtaProps = VariantProps<typeof buttonVariants> & {
  href: string;
  /** GA4 event name, e.g. `promote_start_bidding`. */
  event: string;
  /** Extra GA4 parameters merged into the event. */
  eventParams?: Record<string, unknown>;
  children: ReactNode;
  className?: string;
};

export function PromoteCta({
  href,
  event,
  eventParams,
  children,
  className,
  variant,
  size,
}: PromoteCtaProps) {
  return (
    <Link
      href={href}
      onClick={() => trackEvent(event, { location: "promote", ...eventParams })}
      className={cn(buttonVariants({ variant, size }), className)}
      // An in-page jump is not a route change; there is nothing to prefetch.
      prefetch={href.startsWith("#") ? false : undefined}
    >
      {children}
    </Link>
  );
}
