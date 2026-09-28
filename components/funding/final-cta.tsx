import Link from "next/link";
import { ArrowRight, Rocket } from "lucide-react";

/**
 * The page's close: from reading the market to acting on it.
 *
 * "Explore Investors" goes to `/investors`, the researched directory, rather
 * than back to the funding-derived list — the reader who has scrolled this far
 * has seen the rankings already and wants the next step. "Launch Your Startup"
 * is the marketplace's own submission flow.
 *
 * The one dark band on the page, matching the landing page's community
 * section: `surface-dark`, not a gradient.
 */
export function FundingFinalCta() {
  return (
    <section
      aria-labelledby="funding-final-cta"
      className="relative overflow-hidden rounded-3xl bg-surface-dark px-6 py-10 text-on-dark sm:px-10 sm:py-14"
    >
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="flex max-w-xl flex-col gap-2">
          <h2 id="funding-final-cta" className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Building the next startup?
          </h2>
          <p className="text-sm leading-relaxed text-white/70 sm:text-base">
            Track the market, find relevant investors and understand what it takes to raise.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row md:shrink-0">
          <Link
            href="/investors"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 px-6 text-sm font-semibold text-white transition-colors hover:bg-white/10"
          >
            Explore Investors
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          <Link
            href="/submit"
            className="btn-gradient inline-flex h-12 items-center justify-center gap-2 rounded-xl px-6 text-sm font-semibold"
          >
            <Rocket className="size-4" aria-hidden="true" />
            Launch Your Startup
          </Link>
        </div>
      </div>
    </section>
  );
}
