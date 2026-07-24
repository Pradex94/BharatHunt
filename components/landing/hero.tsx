import Link from "next/link";
import { ChevronUp, Eye, MessageSquare, Star, Trophy, LayoutGrid } from "lucide-react";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Display, Numeric } from "@/components/ui/typography";
import { FadeIn } from "@/components/ui/motion";
import { TOP_PRODUCTS, ICON_TONE, AVATARS } from "@/components/landing/data";

function Avatars() {
  return (
    <div className="flex -space-x-2.5">
      {AVATARS.slice(0, 6).map((src) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          alt=""
          className="size-8 rounded-full border-2 border-background object-cover"
        />
      ))}
    </div>
  );
}

export function Hero() {
  const featured = TOP_PRODUCTS[0];

  return (
    <section className="relative overflow-hidden">
      {/* Background glows + sparkles */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 right-0 size-[560px] rounded-full bg-[radial-gradient(circle,rgba(255,138,61,0.22),transparent_60%)] blur-2xl" />
        <div className="absolute top-40 -left-24 size-[420px] rounded-full bg-[radial-gradient(circle,rgba(255,107,26,0.10),transparent_60%)] blur-2xl" />
        <div className="absolute top-28 right-[42%] text-2xl text-primary/40">✦</div>
        <div className="absolute top-64 right-[8%] text-lg text-primary/30">✦</div>
      </div>

      <div className="mx-auto w-full max-w-[1400px] px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 py-16 md:py-24 lg:grid-cols-[1fr_1.05fr]">
          {/* LEFT */}
          <FadeIn className="flex flex-col items-start gap-7">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-body shadow-xs">
              Made in India. Loved by the World.
              <span aria-hidden>🇮🇳</span>
            </span>

            <Display className="max-w-[16ch]">
              Discover India&rsquo;s next <span className="text-primary">big</span> thing.
            </Display>

            <p className="max-w-md text-lg leading-relaxed text-body">
              Bharat Hunt is where makers launch their products and the community
              discovers, supports and helps them grow.
            </p>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/submit" className={buttonVariants({ size: "lg" })}>
                Launch Your Product
              </Link>
              <Link
                href="/marketplace"
                className={buttonVariants({ variant: "outline", size: "lg" })}
              >
                Explore Products
              </Link>
            </div>

            <div className="flex items-center gap-4 pt-2">
              <Avatars />
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-0.5 text-primary">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="size-4 fill-current" />
                  ))}
                </div>
                <span className="text-sm text-muted">Loved by 15K+ makers &amp; innovators</span>
              </div>
            </div>
          </FadeIn>

          {/* RIGHT — layered floating cards */}
          <FadeIn delay={0.1} className="relative mx-auto w-full max-w-lg lg:mx-0 lg:max-w-none">
            <div className="relative min-h-[420px]">
              {/* Leaderboard card (behind, top-right) */}
              <div className="absolute -top-6 right-0 hidden w-72 rounded-3xl bg-surface-dark p-5 text-on-dark shadow-hover lg:block">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-sm font-semibold">Top Products Today</span>
                  <span className="text-xs text-primary">View all →</span>
                </div>
                <ul className="flex flex-col gap-3">
                  {TOP_PRODUCTS.map((p) => (
                    <li key={p.name} className="flex items-center gap-3">
                      <span className="w-3 text-xs font-semibold text-on-dark-soft">{p.rank}</span>
                      <span
                        className={cn(
                          "flex size-7 items-center justify-center rounded-lg text-white",
                          ICON_TONE[p.tone],
                        )}
                      >
                        <p.icon className="size-3.5" />
                      </span>
                      <span className="flex-1 truncate text-sm font-medium">{p.name}</span>
                      <span className="flex items-center gap-0.5 text-xs font-semibold text-primary">
                        <ChevronUp className="size-3" />
                        <Numeric>{p.upvotes}</Numeric>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Product card (front, floating) */}
              <div className="animate-bh-float relative z-10 w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-hover">
                <div className="mb-4 flex items-start justify-between">
                  <span
                    className={cn(
                      "flex size-12 items-center justify-center rounded-2xl text-white",
                      ICON_TONE.violet,
                    )}
                  >
                    <LayoutGrid className="size-6" />
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                    <Trophy className="size-3.5" />
                    #1 Product of the Day
                  </span>
                </div>

                <h3 className="text-2xl font-bold tracking-tight text-ink">{featured.name}</h3>
                <p className="mt-1 text-sm text-body">
                  Task management, reimagined for modern teams.
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  {["SaaS", "Productivity", "Developer Tools"].map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-secondary-bg px-3 py-1 text-xs font-medium text-body"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                <div className="mt-5 flex items-center gap-6 text-sm text-muted">
                  <span className="flex items-center gap-1.5">
                    <ChevronUp className="size-4 text-primary" />
                    <Numeric className="font-semibold text-ink">523</Numeric> Upvotes
                  </span>
                  <span className="flex items-center gap-1.5">
                    <MessageSquare className="size-4" />
                    <Numeric className="font-semibold text-ink">86</Numeric> Comments
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Eye className="size-4" />
                    <Numeric className="font-semibold text-ink">9.4K</Numeric> Views
                  </span>
                </div>

                <div className="mt-5 flex items-center gap-3">
                  <Link
                    href="/marketplace"
                    className="flex h-11 flex-1 items-center justify-center rounded-xl bg-ink text-sm font-semibold text-white transition-colors hover:bg-ink/90"
                  >
                    View Product
                  </Link>
                  <button
                    type="button"
                    aria-label="Upvote"
                    className="flex size-11 items-center justify-center rounded-xl border border-border text-ink transition-colors hover:border-primary/40 hover:text-primary"
                  >
                    <ChevronUp className="size-5" />
                  </button>
                </div>
              </div>
            </div>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}
