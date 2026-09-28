import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { LaunchCard, LaunchCardSkeleton, type LaunchCardProduct } from "@/components/landing/launch-card";
import { SECTION_SHELL, SectionHeader } from "@/components/landing/section-header";

/**
 * "Today's Hunt" — the heart of the page, and the first thing under the fold.
 *
 * Rendered without `FadeIn`: on a laptop its first row is inside the first
 * viewport, and anything wrapped in the motion helpers is invisible until
 * hydration (see components/ui/motion.tsx).
 */
export function TodaysHunt({
  products,
  latestLaunch,
}: {
  products: LaunchCardProduct[];
  /** "29 Sep" — when the newest launch went live, stated rather than implied. */
  latestLaunch: string | null;
}) {
  return (
    <section id="todays-hunt" className={`${SECTION_SHELL} scroll-mt-20 py-12 md:py-16`}>
      <SectionHeader
        eyebrow="Daily discovery"
        title="Today’s Hunt"
        subtitle="Fresh products worth discovering today."
        note={latestLaunch ? <>Latest launch: {latestLaunch}</> : null}
        action={{ label: "Explore all products", href: "/marketplace" }}
      />

      {products.length > 0 ? (
        <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <li key={product.id}>
              <LaunchCard product={product} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-8 flex flex-col items-center gap-4 rounded-3xl border border-dashed border-border bg-card px-6 py-12 text-center">
          <p className="font-semibold text-ink">Nothing to show here right now.</p>
          <p className="max-w-md text-sm text-body">
            We couldn&rsquo;t load today&rsquo;s discoveries. The full catalogue is one click away
            &mdash; or put your own product at the top of the board.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link href="/submit" prefetch={false} className={buttonVariants()}>
              Launch your product
            </Link>
            <Link href="/marketplace" className={buttonVariants({ variant: "outline" })}>
              Browse all products
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}

export function TodaysHuntSkeleton() {
  return (
    <div className={`${SECTION_SHELL} py-12 md:py-16`}>
      <div className="flex flex-col gap-2">
        <div className="h-3 w-24 animate-pulse rounded bg-secondary-bg" />
        <div className="h-8 w-56 animate-pulse rounded bg-secondary-bg" />
        <div className="h-4 w-72 animate-pulse rounded bg-secondary-bg" />
      </div>
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <LaunchCardSkeleton key={index} />
        ))}
      </div>
    </div>
  );
}
