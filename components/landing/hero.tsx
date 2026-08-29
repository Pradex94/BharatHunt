import Link from "next/link";
import { ArrowRight, ChevronUp, Eye, MessageSquare } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { ProductLogo } from "@/components/products/product-logo";
import { Display, Numeric } from "@/components/ui/typography";
import { formatLaunchDay } from "@/lib/format-date";
import { IndiaFlag } from "@/components/ui/india-flag";
import type { ProductCardProduct } from "@/components/products/product-card";

/** Grid fade: solid through the headline, gone before the section ends. */
const GRID_FADE = "linear-gradient(to bottom, #000 0%, #000 30%, transparent 88%)";

export type HeroProps = {
  /** The launch leading its day's board. Null before anything is published. */
  topProduct: (ProductCardProduct & { view_count?: number | null }) | null;
  /**
   * The IST day that launch led, `YYYY-MM-DD`. The badge names it, so a hero
   * showing an older day says so instead of claiming to be today's board.
   */
  topProductDay: string | null;
  stats: { products: number; makers: number };
};

export function Hero({ topProduct, topProductDay, stats }: HeroProps) {
  return (
    <section className="relative isolate overflow-hidden">
      {/* Warm canvas wash, resolving to the page floor. design.md: the canvas is
          off-white #FFF9F5 and orange is the only chromatic brand colour. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-20 bg-[linear-gradient(180deg,#fff3ec_0%,#fff9f5_55%,#ffffff_100%)]"
      />
      {/* Fine grid over the wash, masked so it dissolves before the hero ends
          and never collides with the section below. Ink at 9% — enough to give
          the space structure, quiet enough not to read as texture. Inline
          styles because the mask + dual gradient is past what utility classes
          express legibly (same call as the India map in community-section). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-20"
        style={{
          backgroundImage:
            "linear-gradient(rgba(23,20,15,0.09) 1px, transparent 0), linear-gradient(90deg, rgba(23,20,15,0.09) 1px, transparent 0)",
          backgroundSize: "28px 28px",
          backgroundPosition: "top center",
          WebkitMaskImage: GRID_FADE,
          maskImage: GRID_FADE,
        }}
      />

      {/* A single soft glow anchoring the card — the whole decorative budget. */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-[60%] left-1/2 -z-10 size-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,138,61,0.18),transparent_65%)] blur-2xl"
      />

      {/*
        No entrance animation above the fold — this is the LCP element.

        Both blocks below used to be wrapped in <FadeIn>, which renders
        `initial="hidden"` into the server HTML as
        `style="opacity:0;transform:translateY(16px)"` and only reveals the
        content once framer-motion has hydrated and its IntersectionObserver has
        fired. The whole hero — headline, subcopy, both CTAs and the leading
        launch — was therefore invisible in the delivered document. Chrome does
        not count an element at opacity 0, so LCP could not be recorded until
        the client bundle had downloaded, parsed and run: field LCP was 4.3s
        against an FCP of 3.2s, and that ~1.1s gap is this.

        Entrance animations still run further down the page, where nothing they
        hide is in the first viewport. Above the fold the content is simply
        painted. The card keeps `animate-bh-float`, which is CSS and animates
        `transform` only — it never drops opacity, so it costs LCP nothing.
      */}
      <div className="relative mx-auto flex w-full max-w-[1100px] flex-col items-center gap-8 px-4 py-20 text-center sm:px-6 md:py-28 lg:py-32">
        <div className="flex flex-col items-center gap-7">
          <span className="flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-sm font-medium text-body shadow-sm">
            <IndiaFlag className="h-3.5 w-auto shrink-0 rounded-[3px]" />
            Built in India
          </span>

          <Display className="max-w-[15ch] md:text-7xl lg:text-[80px]">
            Discover India&rsquo;s next <span className="text-primary">big</span> thing.
          </Display>

          <p className="max-w-xl text-lg leading-relaxed text-body">
            Bharat Hunt is where makers launch their products and the community discovers,
            supports and helps them grow.
          </p>

          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Link href="/submit" className={buttonVariants({ size: "lg" })}>
              Launch Your Product
            </Link>
            <Link href="/marketplace" className={buttonVariants({ variant: "outline", size: "lg" })}>
              Explore Products
            </Link>
          </div>

          {/* Real counts, stated quietly. Anything a visitor can check has to
              be true — invented social proof is the fastest way to lose them. */}
          {stats.products > 0 && (
            <p className="text-sm text-muted">
              <Numeric className="font-semibold text-ink">{stats.products}</Numeric> products
              launched by{" "}
              <Numeric className="font-semibold text-ink">{stats.makers}</Numeric> makers
            </p>
          )}
        </div>

        {topProduct && (
          <div className="w-full max-w-2xl">
            <TopLaunchCard product={topProduct} day={topProductDay} />
          </div>
        )}
      </div>
    </section>
  );
}

/** The showpiece: whichever real launch is leading the day named on the badge. */
function TopLaunchCard({
  product,
  day,
}: {
  product: HeroProps["topProduct"] & {};
  day: string | null;
}) {
  // "today" / "yesterday" / "23 Aug". Null only for a malformed or missing day,
  // where a neutral label beats a claim we cannot stand behind.
  const dayLabel = day ? formatLaunchDay(day) : null;

  const metrics = [
    { icon: ChevronUp, value: product.upvote_count ?? 0, label: "Upvotes" },
    { icon: MessageSquare, value: product.comment_count ?? 0, label: "Comments" },
    { icon: Eye, value: product.view_count ?? 0, label: "Views" },
  ];

  return (
    <div className="animate-bh-float rounded-[2rem] border border-border bg-card p-5 text-left shadow-[0_30px_70px_-28px_rgba(23,20,15,0.28)] sm:p-10">
      <div className="flex items-center justify-between gap-4">
        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
          {dayLabel ? `Leading ${dayLabel}` : "Top launch"}
        </span>
        <span className="rounded-full bg-secondary-bg px-2.5 py-1 text-xs font-medium text-body">
          {product.category}
        </span>
      </div>

      <div className="mt-6 flex items-center gap-4">
        <ProductLogo
          src={product.hero_image_url}
          name={product.name}
          size="lg"
          className="shadow-sm"
        />
        <h2 className="min-w-0 truncate text-2xl font-bold tracking-tight text-ink sm:text-4xl">
          {product.name}
        </h2>
      </div>

      <p className="mt-4 line-clamp-2 text-lg leading-relaxed text-body">{product.tagline}</p>

      <dl className="mt-8 grid grid-cols-3 gap-2 sm:gap-4">
        {metrics.map(({ icon: Icon, value, label }) => (
          <div key={label} className="rounded-2xl bg-secondary-bg p-2.5 text-center sm:p-4">
            <dd className="flex items-center justify-center gap-1 text-ink">
              <Icon className="size-4 shrink-0 text-primary sm:size-5" aria-hidden="true" />
              <Numeric className="text-lg font-bold sm:text-3xl">
                {value.toLocaleString("en-IN")}
              </Numeric>
            </dd>
            <dt className="mt-1 text-xs text-muted sm:text-sm">{label}</dt>
          </div>
        ))}
      </dl>

      <Link
        href={`/products/${product.slug}`}
        className="btn-gradient mt-8 flex h-14 w-full items-center justify-center gap-2 rounded-2xl px-4 text-base font-semibold"
      >
        <span className="min-w-0 truncate">View {product.name}</span>
        <ArrowRight className="size-5 shrink-0" aria-hidden="true" />
      </Link>
    </div>
  );
}
