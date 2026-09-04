/* Design system: design.md (Bharat Hunt — orange) · /investors
 *
 * "There's More Behind the Lock." — the conversion section.
 *
 * A server component with no JavaScript, because there is nothing here to
 * interact with: a grid of `LockedInvestorCard`s, which carry no data, under a
 * gradient scrim and a single anchor down to the pricing card.
 *
 * The count in the copy is real. It is a `count`-only query
 * (`getInvestorDirectoryStats`), so the page can say how many investors are
 * behind the lock without a single premium row crossing the wire — which is the
 * distinction between honest specificity and shipping the product to people who
 * have not bought it.
 *
 * No countdown, no "3 spots left", no fake scarcity of any kind. There is no
 * real limit on this product, so inventing one would be a lie told to a founder
 * about a research tool.
 */

import { ArrowDown, Lock } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { H2, Numeric } from "@/components/ui/typography";
import { LockedInvestorCard } from "@/components/investors/investor-card";
import { INVESTOR_LOCKED_TEASER_COUNT, formatPaise } from "@/lib/investors";

export function LockedDirectory({
  /** Total published investors. Used only as a number in the copy. */
  total,
  /** How many of those the free preview already showed. */
  freeShown,
  amountPaise,
  className,
}: {
  total: number;
  freeShown: number;
  amountPaise: number | null;
  className?: string;
}) {
  const behindLock = Math.max(0, total - freeShown);

  return (
    <div className={cn("relative", className)}>
      <div className="text-center">
        <H2>There&rsquo;s More Behind the Lock.</H2>
        <p className="mx-auto mt-3 max-w-xl text-base text-body">
          {behindLock > 0 ? (
            <>
              <Numeric className="font-semibold text-ink">{behindLock}</Numeric> more investor{" "}
              {behindLock === 1 ? "profile" : "profiles"} — with stage, sector, cheque size and
              contact details — are part of the full directory.
            </>
          ) : (
            <>
              Stage, sector, cheque size and contact details for every investor are part of the
              full directory.
            </>
          )}
        </p>
      </div>

      {/*
        The teaser grid, and the scrim over it.

        `overflow-hidden` plus a fixed height crops the last row mid-card, which
        is what makes the section read as "this continues" rather than "this is
        a grid of six empty boxes". `select-none` and `pointer-events-none` on
        the grid stop it behaving like content, since it is a picture.
      */}
      <div className="relative mt-10">
        <div className="pointer-events-none max-h-[26rem] overflow-hidden select-none sm:max-h-[24rem]">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: INVESTOR_LOCKED_TEASER_COUNT }, (_, index) => (
              <LockedInvestorCard key={index} index={index} />
            ))}
          </div>
        </div>

        {/* Fade to the page's own background so the crop has no hard edge.
            `from-background` rather than a hex, so a re-theme follows. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-background via-background/90 to-transparent"
        />

        {/* The overlay card. Sits on the fade, centred, and is the only
            interactive thing in the section. */}
        <div className="absolute inset-x-0 bottom-0 flex justify-center px-4">
          <div className="w-full max-w-md rounded-3xl border border-border bg-card/95 p-6 text-center shadow-hover backdrop-blur-sm">
            <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Lock className="size-5" aria-hidden="true" />
            </span>
            <p className="mt-4 text-base font-semibold text-ink">
              Unlock the complete investor directory
            </p>
            {amountPaise !== null && (
              <p className="mt-3 flex items-baseline justify-center gap-2">
                <Numeric className="text-3xl leading-none font-bold text-ink">
                  {formatPaise(amountPaise)}
                </Numeric>
                <span className="text-sm text-muted">One-time payment</span>
              </p>
            )}
            <Button
              // A plain anchor styled as the CTA: the pricing card is further
              // down this same page, so this is a scroll, not a navigation, and
              // it works with JavaScript disabled.
              render={<a href="#unlock" />}
              size="lg"
              className="mt-5 w-full"
            >
              Unlock Full Investor Directory
              <ArrowDown className="size-4" aria-hidden="true" />
            </Button>
            <p className="mt-3 text-xs text-muted">
              One-time payment · Instant access · No subscription
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
