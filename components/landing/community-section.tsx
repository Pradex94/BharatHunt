import Link from "next/link";

import { Numeric } from "@/components/ui/typography";
import { FadeIn } from "@/components/ui/motion";
import { buttonVariants } from "@/components/ui/button";
import { IndiaMap } from "@/components/landing/india-map";

export type CommunityStats = { products: number; makers: number; upvotes: number };

export type CommunitySectionProps = {
  stats: CommunityStats;
  /** Published products per ISO 3166-2:IN state code. */
  launchCounts?: Record<string, number>;
};

export function CommunitySection({ stats, launchCounts }: CommunitySectionProps) {
  // Only states a maker actually named — the map stays empty until real
  // launches carry a location, rather than inventing coverage.
  const statesOnMap = Object.values(launchCounts ?? {}).filter((count) => count > 0).length;
  const mappedProducts = Object.values(launchCounts ?? {}).reduce((sum, count) => sum + count, 0);

  const cards = [
    { value: stats.makers, label: stats.makers === 1 ? "Maker" : "Makers" },
    { value: stats.products, label: stats.products === 1 ? "Product" : "Products" },
    { value: stats.upvotes, label: stats.upvotes === 1 ? "Upvote" : "Upvotes" },
  ];

  return (
    <section className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="relative overflow-hidden rounded-[32px] bg-surface-dark text-on-dark">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_120%_at_100%_0%,rgba(255,107,26,0.32),transparent_55%)]"
        />

        <div className="relative grid items-center gap-10 p-6 sm:p-12 lg:grid-cols-2 lg:p-16">
          {/* LEFT — copy + real counts */}
          <FadeIn className="flex flex-col gap-6">
            <h2 className="max-w-[18ch] text-3xl font-bold tracking-tight sm:text-4xl">
              A community of builders, backing each other&rsquo;s work.
            </h2>
            <p className="max-w-md text-on-dark-soft">
              Bharat Hunt is early, and that is the point &mdash; launch now and your product
              gets read, tried and talked about instead of buried.
            </p>
            <dl className="mt-2 grid grid-cols-3 gap-3 sm:gap-6">
              {cards.map((card) => (
                <div key={card.label} className="flex min-w-0 flex-col gap-1">
                  <dd className="text-2xl font-bold text-primary sm:text-3xl">
                    <Numeric>{card.value.toLocaleString("en-IN")}</Numeric>
                  </dd>
                  <dt className="text-xs text-on-dark-soft sm:text-sm">{card.label}</dt>
                </div>
              ))}
            </dl>
            <Link
              href="/submit"
              className={buttonVariants({ className: "mt-2 w-fit" })}
            >
              Launch Your Product
            </Link>
          </FadeIn>

          {/* RIGHT — India, drawn from real boundary data (components/landing/india-map.tsx).
              The previous version was a hand-written 15-point CSS polygon that
              rendered as a triangle and omitted Kashmir entirely. */}
          <FadeIn delay={0.1} className="relative mx-auto w-full max-w-lg">
            <div
              aria-hidden
              className="absolute inset-[6%] rounded-full bg-[radial-gradient(circle,rgba(255,107,26,0.22),transparent_65%)] blur-2xl"
            />
            <IndiaMap
              id="community-india"
              className="relative text-primary drop-shadow-[0_0_28px_rgba(255,107,26,0.35)]"
              launchCounts={launchCounts}
            />
            {statesOnMap > 0 && (
              <p className="relative mt-4 text-center text-sm text-on-dark-soft">
                <Numeric className="font-semibold text-on-dark">{mappedProducts}</Numeric>{" "}
                {mappedProducts === 1 ? "product" : "products"} from{" "}
                <Numeric className="font-semibold text-on-dark">{statesOnMap}</Numeric>{" "}
                {statesOnMap === 1 ? "state" : "states"}
              </p>
            )}
          </FadeIn>
        </div>
      </div>
    </section>
  );
}
