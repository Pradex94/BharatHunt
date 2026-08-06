import Link from "next/link";

import { Numeric } from "@/components/ui/typography";
import { FadeIn } from "@/components/ui/motion";
import { buttonVariants } from "@/components/ui/button";

// Rough India silhouette (wide north, tapering to a point in the south).
const INDIA_CLIP =
  "polygon(26% 6%, 48% 2%, 60% 8%, 74% 10%, 88% 22%, 78% 34%, 70% 44%, 62% 62%, 54% 78%, 48% 96%, 40% 74%, 32% 60%, 22% 44%, 14% 28%, 18% 16%)";

/** Abstract activity points over the map — deliberately not faces. */
const ACTIVITY_SPOTS = [
  { top: "20%", left: "42%", delay: "0s" },
  { top: "35%", left: "63%", delay: "-1.5s" },
  { top: "46%", left: "31%", delay: "-3s" },
  { top: "61%", left: "51%", delay: "-4.5s" },
  { top: "73%", left: "41%", delay: "-2.2s" },
];

export type CommunityStats = { products: number; makers: number; upvotes: number };

export function CommunitySection({ stats }: { stats: CommunityStats }) {
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

        <div className="relative grid items-center gap-10 p-8 sm:p-12 lg:grid-cols-2 lg:p-16">
          {/* LEFT — copy + real counts */}
          <FadeIn className="flex flex-col gap-6">
            <h2 className="max-w-[18ch] text-3xl font-bold tracking-tight sm:text-4xl">
              A community of builders, backing each other&rsquo;s work.
            </h2>
            <p className="max-w-md text-on-dark-soft">
              Bharat Hunt is early, and that is the point &mdash; launch now and your product
              gets read, tried and talked about instead of buried.
            </p>
            <dl className="mt-2 grid grid-cols-3 gap-6">
              {cards.map((card) => (
                <div key={card.label} className="flex flex-col gap-1">
                  <dd className="text-3xl font-bold text-primary">
                    <Numeric>{card.value.toLocaleString("en-IN")}</Numeric>
                  </dd>
                  <dt className="text-sm text-on-dark-soft">{card.label}</dt>
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

          {/* RIGHT — dotted India map */}
          <FadeIn delay={0.1} className="relative mx-auto aspect-square w-full max-w-md">
            <div aria-hidden className="absolute inset-[8%] rounded-full border border-primary/15" />
            <div aria-hidden className="absolute inset-[22%] rounded-full border border-primary/10" />
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                clipPath: INDIA_CLIP,
                backgroundImage: "radial-gradient(rgba(255,138,61,0.9) 1.4px, transparent 1.6px)",
                backgroundSize: "13px 13px",
                filter: "drop-shadow(0 0 24px rgba(255,107,26,0.35))",
              }}
            />
            {ACTIVITY_SPOTS.map((spot) => (
              <span
                key={spot.top + spot.left}
                aria-hidden
                className="animate-bh-float absolute size-2.5 rounded-full bg-primary shadow-[0_0_16px_4px_rgba(255,107,26,0.55)]"
                style={{ top: spot.top, left: spot.left, animationDelay: spot.delay }}
              />
            ))}
          </FadeIn>
        </div>
      </div>
    </section>
  );
}
