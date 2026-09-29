import Link from "next/link";
import { ArrowRight, Rocket } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Display } from "@/components/ui/typography";
import { IndiaFlag } from "@/components/ui/india-flag";
import { SearchAutocomplete } from "@/components/layout/search-autocomplete";
import { NetworkVisual } from "@/components/landing/network-visual";
import type { NetworkNode } from "@/lib/network-summary";

/** Grid fade: solid through the headline, gone before the section ends. */
const GRID_FADE = "linear-gradient(to bottom, #000 0%, #000 30%, transparent 88%)";

export type HeroProps = {
  /** The discovery network, built by `buildNetworkNodes` from live counts. */
  nodes: NetworkNode[];
  /** Quick-search shortcuts under the input. Real destinations only. */
  shortcuts: { label: string; href: string }[];
};

/*
 * No entrance animation anywhere in here — this is the LCP region.
 * components/ui/motion.tsx explains what wrapping the first viewport in
 * `FadeIn` cost this site (field LCP 4.3s). The hero paints at full opacity.
 *
 * Shorter than the old hero on purpose: the headline, the search and both
 * CTAs sit in the first viewport, and the first row of "Today's Hunt" starts
 * right under it on a laptop, so the product feed is never a scroll away.
 */
export function Hero({ nodes, shortcuts }: HeroProps) {
  return (
    <section className="relative isolate overflow-hidden">
      {/* Warm canvas wash → page floor. Orange is the only chromatic colour. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-20 bg-[linear-gradient(180deg,#fff3ec_0%,#fff9f5_55%,#ffffff_100%)]"
      />
      {/* Fine grid, masked so it dissolves before the section ends. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-20"
        style={{
          backgroundImage:
            "linear-gradient(rgba(23,20,15,0.07) 1px, transparent 0), linear-gradient(90deg, rgba(23,20,15,0.07) 1px, transparent 0)",
          backgroundSize: "28px 28px",
          backgroundPosition: "top center",
          WebkitMaskImage: GRID_FADE,
          maskImage: GRID_FADE,
        }}
      />

      <div className="mx-auto grid grid-cols-1 w-full max-w-7xl items-center gap-10 px-4 pt-12 pb-10 sm:px-6 md:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] lg:gap-14 lg:px-8 lg:pt-20 lg:pb-16">
        <div className="flex min-w-0 flex-col items-start gap-6">
          <span className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-body shadow-sm">
            <IndiaFlag className="h-3.5 w-auto shrink-0 rounded-[3px]" />
            Startups · AI · Software · Funding
          </span>

          <Display className="max-w-[16ch] text-[2.5rem] leading-[1.05] sm:text-6xl lg:text-[64px]">
            Discover what&rsquo;s being built in <span className="text-primary">India</span>.
          </Display>

          <p className="max-w-xl text-lg leading-relaxed text-body">
            Find the startups, AI products and software worth knowing before everyone else &mdash;
            and the funding and investors behind them.
          </p>

          <div className="w-full max-w-xl">
            <SearchAutocomplete
              tone="hero"
              placeholder="Search startups, products, AI tools, companies…"
            />
            {shortcuts.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted">Popular:</span>
                {shortcuts.map((shortcut) => (
                  <Link
                    key={shortcut.href}
                    href={shortcut.href}
                    className="rounded-full border border-border bg-card px-3 py-1 font-medium text-body transition-colors hover:border-primary/40 hover:text-primary"
                  >
                    {shortcut.label}
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Link href="/marketplace" className={buttonVariants({ size: "lg" })}>
              Explore Products
              <ArrowRight aria-hidden="true" />
            </Link>
            {/* Not prefetched: most homepage visitors are signed out, and for them
                /submit is a redirect to /login — a full render thrown away. */}
            <Link
              href="/submit"
              prefetch={false}
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              <Rocket aria-hidden="true" />
              Launch Your Product
            </Link>
          </div>
        </div>

        <NetworkVisual nodes={nodes} />
      </div>
    </section>
  );
}
