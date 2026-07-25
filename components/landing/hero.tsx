import Link from "next/link";
import { ChevronUp, Eye, LayoutGrid, MessageSquare, Star, Trophy } from "lucide-react";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Display, Numeric } from "@/components/ui/typography";
import { FadeIn } from "@/components/ui/motion";
import { TOP_PRODUCTS, AVATARS } from "@/components/landing/data";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-background">
      {/* Disciplined warm glows */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 right-0 size-[520px] rounded-full bg-[radial-gradient(circle,rgba(255,90,31,0.10),transparent_62%)]" />
        <div className="absolute top-40 -left-32 size-[420px] rounded-full bg-[radial-gradient(circle,rgba(255,90,31,0.06),transparent_62%)]" />
      </div>

      <div className="relative mx-auto grid w-full max-w-[1400px] items-center gap-14 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-[1fr_1.05fr] lg:px-8">
        {/* LEFT — editorial copy */}
        <FadeIn className="flex flex-col items-start gap-7">
          <span className="flex items-center gap-3 text-xs font-semibold tracking-[0.22em] text-primary uppercase">
            <span className="h-px w-8 bg-primary" />
            Made in India · Loved worldwide
          </span>

          <Display className="max-w-[14ch] md:text-7xl">
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
            <div className="flex -space-x-2.5">
              {AVATARS.map((src) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={src}
                  src={src}
                  alt=""
                  className="size-8 rounded-full border-2 border-background object-cover"
                />
              ))}
            </div>
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-0.5 text-primary">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="size-3.5 fill-current" />
                ))}
              </div>
              <span className="text-sm text-muted">Loved by 15K+ makers &amp; innovators</span>
            </div>
          </div>
        </FadeIn>

        {/* RIGHT — layered floating cards. A flex row with a fixed negative-margin
            overlap keeps the leaderboard content clear of the white card at every
            width (the earlier absolute version clipped the title around 1280px). */}
        <FadeIn delay={0.1} className="flex justify-center xl:justify-end">
          {/* Product card — front */}
          <div className="relative z-10 w-full max-w-[380px] shrink-0 rounded-2xl border border-border bg-card p-6 shadow-soft">
            <div className="mb-5 flex items-start justify-between">
              <span
                className={cn(
                  "flex size-12 items-center justify-center rounded-xl text-white",
                  "bg-ink",
                )}
              >
                <LayoutGrid className="size-6" />
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                <Trophy className="size-3.5" />
                #1 Product of the Day
              </span>
            </div>

            <h3 className="font-sans text-2xl font-bold tracking-tight text-ink">ZenTask</h3>
            <p className="mt-1 text-sm text-body">Task management, reimagined for modern teams.</p>

            <div className="mt-4 flex flex-wrap gap-2">
              {["SaaS", "Productivity", "Developer Tools"].map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-border px-3 py-1 text-xs font-medium text-body"
                >
                  {tag}
                </span>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted">
              <span className="flex items-center gap-1 whitespace-nowrap">
                <ChevronUp className="size-4 shrink-0 text-primary" />
                <Numeric className="font-bold text-ink">523</Numeric> Upvotes
              </span>
              <span className="flex items-center gap-1 whitespace-nowrap">
                <MessageSquare className="size-4 shrink-0" />
                <Numeric className="font-bold text-ink">86</Numeric> Comments
              </span>
              <span className="flex items-center gap-1 whitespace-nowrap">
                <Eye className="size-4 shrink-0" />
                <Numeric className="font-bold text-ink">9.4K</Numeric> Views
              </span>
            </div>

            <div className="mt-5 flex items-center gap-3">
              <Link
                href="/marketplace"
                className="flex h-11 flex-1 items-center justify-center rounded-md bg-ink text-sm font-semibold text-white transition-colors hover:bg-ink/90"
              >
                View Product
              </Link>
              <button
                type="button"
                aria-label="Upvote"
                className="flex size-11 items-center justify-center rounded-md border border-border text-ink transition-colors hover:border-primary/50 hover:text-primary"
              >
                <ChevronUp className="size-5" />
              </button>
            </div>
          </div>

          {/* Leaderboard — behind-right (xl only). The -ml overlap tucks its left
              gutter under the white card; pl-14 keeps the title/rows fully clear. */}
          <div className="relative z-0 -ml-10 mt-8 hidden w-[300px] shrink-0 rounded-2xl border border-white/10 bg-surface-dark py-5 pr-5 pl-14 xl:block">
            <div className="mb-4 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold whitespace-nowrap text-white">
                Top Products Today
              </span>
              <span className="text-xs font-semibold whitespace-nowrap text-primary">
                View all →
              </span>
            </div>
            <ul className="flex flex-col gap-3.5">
              {TOP_PRODUCTS.map((p) => (
                <li key={p.name} className="flex items-center gap-3">
                  <Numeric className="w-3 text-xs font-semibold text-white/40">{p.rank}</Numeric>
                  <span className="flex-1 truncate text-sm font-medium text-white">{p.name}</span>
                  <span className="flex items-center gap-1 text-xs font-bold text-primary">
                    <ChevronUp className="size-3" />
                    <Numeric>{p.upvotes}</Numeric>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
