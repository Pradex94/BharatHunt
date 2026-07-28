import Link from "next/link";
import { ArrowRight, ChevronUp, Eye, MessageSquare, Star } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Display, Numeric } from "@/components/ui/typography";
import { FadeIn } from "@/components/ui/motion";
import { AVATARS } from "@/components/landing/data";

const HERO_STATS = [
  { icon: ChevronUp, value: "2,450", label: "Upvotes" },
  { icon: MessageSquare, value: "180", label: "Comments" },
  { icon: Eye, value: "15k", label: "Views" },
] as const;

const HERO_TAGS = ["#productivity", "#taskmanagement", "#ai-powered", "#saas", "#workflow"];

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden">
      {/* ── Backdrop: cool light gradient that resolves to the page's white so
          the sections below blend seamlessly. ── */}
      <div
        aria-hidden
        className="absolute inset-0 -z-20 bg-[linear-gradient(180deg,#e9edf3_0%,#f2f5f9_42%,#ffffff_100%)]"
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-20 bg-[radial-gradient(120%_75%_at_50%_28%,rgba(255,255,255,0.9),transparent_60%)]"
      />

      {/* ── Orbital light ring sweeping around the card ── */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-[54%] left-1/2 -z-10 h-[560px] w-[1080px] -translate-x-1/2 -translate-y-1/2 rotate-[-14deg] sm:h-[640px] sm:w-[1240px]"
      >
        <div className="absolute inset-0 rounded-[50%] border-2 border-primary/20 blur-[1px] [box-shadow:0_0_70px_12px_rgba(255,138,61,0.16),inset_0_0_70px_12px_rgba(255,138,61,0.08)]" />
        <div className="absolute top-[12%] right-[7%] size-44 rounded-full bg-[radial-gradient(circle,rgba(255,138,61,0.55),transparent_60%)] blur-2xl" />
        <div className="absolute bottom-[8%] left-[9%] size-40 rounded-full bg-[radial-gradient(circle,rgba(255,138,61,0.4),transparent_60%)] blur-2xl" />
      </div>

      {/* Warm glow directly behind the card */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-[58%] left-1/2 -z-10 size-[540px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,138,61,0.26),transparent_65%)] blur-2xl"
      />

      {/* ── Floating decorative shapes (orange + neutral only) ── */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 hidden lg:block">
        <div className="animate-bh-float absolute top-[24%] left-[9%] size-24 rounded-[38%] border border-white/70 bg-white/60 shadow-soft backdrop-blur-sm" />
        <div className="animate-bh-float absolute top-[20%] right-[11%] size-16 rounded-full bg-gradient-to-br from-[#ff8a3d] to-[#ff6b1a] shadow-lg shadow-primary/40 [animation-delay:-2s]" />
        <div className="absolute top-[31%] right-[9%] h-7 w-16 rounded-full border border-white/70 bg-white/70 shadow-sm backdrop-blur-sm" />
        <div className="animate-bh-float absolute top-[56%] left-[13%] size-10 rotate-45 rounded-lg bg-gradient-to-br from-[#ffb184] to-[#ff8a3d] shadow-md shadow-primary/30 [animation-delay:-4s]" />
        <div className="absolute top-[42%] left-[7%] h-px w-16 rotate-45 bg-gradient-to-r from-primary/60 to-transparent" />
        <div className="absolute right-[16%] bottom-[20%] size-3 rounded-full bg-primary" />
        <Star className="absolute right-[21%] bottom-[24%] size-6 fill-white/80 text-white/80" />
      </div>

      {/* ── Content ── */}
      <div className="relative mx-auto flex w-full max-w-[1100px] flex-col items-center gap-8 px-4 py-20 text-center sm:px-6 md:py-28 lg:py-32">
        <FadeIn className="flex flex-col items-center gap-7">
          <span className="flex items-center gap-3 text-xs font-semibold tracking-[0.22em] text-primary uppercase">
            <span className="h-px w-8 bg-primary" />
            Made in India · Loved worldwide
            <span className="h-px w-8 bg-primary" />
          </span>

          <Display className="max-w-[15ch] md:text-7xl lg:text-[80px]">
            Discover India&rsquo;s next <span className="text-primary">big</span> thing.
          </Display>

          <p className="max-w-xl text-lg leading-relaxed text-body">
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

          <div className="flex items-center gap-4 pt-1">
            <div className="flex -space-x-2.5">
              {AVATARS.map((src) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={src}
                  src={src}
                  alt=""
                  className="size-8 rounded-full border-2 border-white object-cover"
                />
              ))}
            </div>
            <div className="flex flex-col items-start gap-0.5">
              <div className="flex items-center gap-0.5 text-primary">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="size-3.5 fill-current" />
                ))}
              </div>
              <span className="text-sm text-muted">Loved by 15K+ makers &amp; innovators</span>
            </div>
          </div>
        </FadeIn>

        {/* ── The showpiece: a large glassmorphic product card ── */}
        <FadeIn delay={0.15} className="w-full max-w-2xl">
          <div className="animate-bh-float relative">
            {/* stacked panel behind, for depth */}
            <div
              aria-hidden
              className="absolute -inset-x-6 top-6 -bottom-6 -z-10 rounded-[2.25rem] border border-white/50 bg-white/25 backdrop-blur-md"
            />

            <div className="rounded-[2rem] border border-white/70 bg-white/60 p-8 shadow-[0_40px_100px_-24px_rgba(23,20,15,0.3)] backdrop-blur-2xl sm:p-10">
              {/* header */}
              <div className="flex items-center justify-center gap-4">
                <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#ff6b1a] to-[#ff8a3d] text-3xl font-bold text-white shadow-lg shadow-primary/40">
                  Z
                </span>
                <span className="text-4xl font-bold tracking-tight text-ink sm:text-5xl">
                  ZenTask
                </span>
              </div>

              <p className="mt-4 text-center text-lg text-body sm:text-xl">
                Streamline your productivity, naturally.
              </p>

              {/* stat tiles */}
              <div className="mt-8 grid grid-cols-3 gap-3 sm:gap-4">
                {HERO_STATS.map(({ icon: Icon, value, label }) => (
                  <div
                    key={label}
                    className="rounded-2xl border border-white/70 bg-white/55 p-4 text-center backdrop-blur-sm"
                  >
                    <div className="flex items-center justify-center gap-1 text-ink">
                      <Icon className="size-5 shrink-0 text-primary" />
                      <Numeric className="text-2xl font-bold sm:text-3xl">{value}</Numeric>
                    </div>
                    <p className="mt-1 text-sm text-muted">{label}</p>
                  </div>
                ))}
              </div>

              {/* tags */}
              <div className="mt-6 flex flex-wrap justify-center gap-x-3 gap-y-1.5 text-sm font-medium">
                {HERO_TAGS.map((tag) => (
                  <span key={tag} className="text-body">
                    {tag}
                  </span>
                ))}
              </div>

              {/* CTA */}
              <Link
                href="/marketplace"
                className="btn-gradient mt-8 flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-base font-semibold"
              >
                Visit ZenTask <ArrowRight className="size-5" />
              </Link>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
