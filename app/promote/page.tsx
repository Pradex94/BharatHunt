/* Design system: design.md (Bharat Hunt — orange) · Promote — competitive bidding.
 *
 * The page is a Server Component and holds no data: every section below is
 * static HTML, and only the auction widgets hydrate. That matters for the one
 * number this page is judged on — the headline is the LCP element, and it is in
 * the delivered document rather than waiting on a scroll observer. (The landing
 * hero learned this the hard way; see the note in components/landing/hero.tsx.)
 *
 * `AuctionProvider` is a client component that takes `children`, so wrapping the
 * whole page costs nothing: the static sections stay server-rendered and pass
 * through it as an RSC payload. It is also the single seam where demo bids
 * become real ones.
 *
 * The dark hero is not a new theme. design.md reserves near-black bands for
 * deliberate moments, the navbar is already `bg-surface-dark`, and an auction
 * board is exactly the kind of high-contrast moment that band is for — the rest
 * of the page returns to the white canvas every other page uses.
 */

import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Check,
  Compass,
  Crown,
  Layers,
  ShieldCheck,
  Tag,
  Target,
} from "lucide-react";

import { Container } from "@/components/ui/container";
import { Display, H2, H3, Lead, Numeric } from "@/components/ui/typography";
import { FadeIn, FadeInItem, FadeInStagger } from "@/components/ui/motion";
import { buttonVariants } from "@/components/ui/button";
import { Breadcrumbs, type Crumb } from "@/components/seo/breadcrumbs";
import { AuctionProvider } from "@/components/promote/auction-provider";
import { LiveAuctionBoard } from "@/components/promote/auction-board";
import { SlotTiers } from "@/components/promote/slot-tiers";
import { BidPanel } from "@/components/promote/bid-panel";
import { CategoryAuction } from "@/components/promote/category-auction";
import { PromoteCta } from "@/components/promote/promote-cta";
import { PROMOTED_SLOTS } from "@/lib/promote";

export const metadata: Metadata = {
  // The root layout's template appends " · Bharat Hunt".
  title: "Promote Your Product",
  alternates: { canonical: "/promote" },
  description:
    "Get premium visibility for your product on Bharat Hunt. Choose a promotion slot, place your bid and put your product in the spotlight.",
  openGraph: {
    title: "Promote Your Product on Bharat Hunt",
    description:
      "Products compete for a limited number of premium positions on Bharat Hunt. Choose a slot, place your bid, and put your product in front of people actively discovering new products.",
    url: "/promote",
    type: "website",
  },
};

const CRUMBS: Crumb[] = [
  { name: "Home", path: "/" },
  { name: "Promote", path: "/promote" },
];

/** Fine grid over the hero, dissolved before the section ends. */
const GRID_FADE = "linear-gradient(to bottom, #000 0%, #000 42%, transparent 92%)";

const STEPS = [
  {
    title: "Choose your category",
    body: "Pick where your product competes. Each category runs its own board, so you are bidding against the products your audience is already browsing.",
  },
  {
    title: "Place your bid",
    body: "Set what a promoted position is worth to you. Bids are public, and the top of the board is always visible — you always know what it takes to lead.",
  },
  {
    title: "Get promoted",
    body: `Hold a top-${PROMOTED_SLOTS} position when the round closes and your placement goes live, clearly labelled as promoted.`,
  },
];

const BENEFITS = [
  {
    Icon: Target,
    title: "Reach relevant audiences",
    body: "Category boards put your product in front of the people already browsing that shelf, rather than everyone at once.",
  },
  {
    Icon: Crown,
    title: "Get premium placement",
    body: "A promoted slot is a fixed position at the top of the pages that matter, for the length of the round you won.",
  },
  {
    Icon: Compass,
    title: "Drive product discovery",
    body: "Bharat Hunt visitors arrive looking for something new. Placement puts your launch into that moment.",
  },
  {
    Icon: BarChart3,
    title: "Measure campaign performance",
    body: "See what your placement returned — impressions, clicks and the spend behind them — instead of guessing.",
  },
];

const TRANSPARENCY = [
  {
    Icon: Tag,
    title: "Promoted products are clearly labelled",
    body: "Every paid placement carries a visible “Promoted” label. A visitor never has to work out which listings were bought.",
  },
  {
    Icon: Layers,
    title: "Organic discovery stays separate",
    body: "Promoted slots sit alongside the organic listing, never inside it. Buying a slot does not move a product up the normal rankings.",
  },
  {
    Icon: ShieldCheck,
    title: "Votes and comments are never for sale",
    body: "Upvotes, comments and community signals come from the community. Nothing on this page changes any of them.",
  },
];

export default function PromotePage() {
  return (
    <AuctionProvider>
      <div className="flex flex-col">
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section className="relative isolate overflow-hidden bg-surface-dark">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-20"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.055) 1px, transparent 0), linear-gradient(90deg, rgba(255,255,255,0.055) 1px, transparent 0)",
              backgroundSize: "30px 30px",
              backgroundPosition: "top center",
              WebkitMaskImage: GRID_FADE,
              maskImage: GRID_FADE,
            }}
          />
          {/* One soft glow behind the board — the whole decorative budget. */}
          <div
            aria-hidden
            className="pointer-events-none absolute top-1/2 -right-24 -z-10 size-[620px] -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,107,26,0.22),transparent_65%)] blur-2xl"
          />

          <Container className="grid items-center gap-10 py-12 md:py-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14 lg:py-20">
            {/*
              No scroll-reveal wrapper in the hero. `FadeIn` renders
              `opacity: 0` into the server HTML and only reveals once
              framer-motion has hydrated, which would hide the LCP element from
              the delivered document.
            */}
            <div className="flex flex-col items-start gap-6">
              <Breadcrumbs items={CRUMBS} tone="dark" />

              <span className="flex items-center gap-3 text-xs font-semibold tracking-[0.22em] text-primary uppercase">
                <span className="h-px w-8 bg-primary" />
                Bharat Hunt Promote
              </span>

              <Display className="max-w-[13ch] text-balance text-white">
                Compete for the <span className="text-primary">spotlight</span>.
              </Display>

              <Lead className="max-w-xl text-white/65">
                Bid for premium visibility and put your product in front of people actively
                discovering new products.
              </Lead>

              <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                <PromoteCta href="#place-bid" event="promote_start_bidding" size="lg">
                  Start Bidding
                  <ArrowRight className="size-4" aria-hidden="true" />
                </PromoteCta>
                <PromoteCta
                  href="#how-it-works"
                  event="promote_how_it_works"
                  variant="ghost"
                  size="lg"
                  className="border-white/20 text-white hover:bg-white/10 hover:text-white"
                >
                  See How It Works
                </PromoteCta>
              </div>

              <p className="text-xs leading-relaxed text-white/45">
                Preview of the bidding experience — no payment is taken on this page.
              </p>
            </div>

            <div className="w-full min-w-0">
              <LiveAuctionBoard />
            </div>
          </Container>
        </section>

        {/* ── Scarcity: the three slots, and the bid card ───────────────── */}
        <section className="border-b border-border">
          <Container className="py-16 md:py-24">
            <FadeIn className="mx-auto mb-10 max-w-2xl text-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/[0.07] px-3 py-1 text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">
                Only <Numeric>{PROMOTED_SLOTS}</Numeric> spots available
              </span>
              <H2 className="mt-5 text-3xl sm:text-4xl">
                Three positions. The board decides who holds them.
              </H2>
              <p className="mt-3 text-body">
                Every round sells exactly {PROMOTED_SLOTS} placements. The highest bids when the
                clock runs out take them; everyone else waits for the next round.
              </p>
            </FadeIn>

            <SlotTiers />

            <div className="mx-auto mt-14 max-w-3xl">
              <BidPanel />
            </div>
          </Container>
        </section>

        {/* ── How it works ─────────────────────────────────────────────── */}
        <section id="how-it-works" className="scroll-mt-20 border-b border-border bg-secondary-bg/50">
          <Container className="py-16 md:py-24">
            <FadeIn className="mx-auto mb-12 max-w-2xl text-center">
              <H2 className="text-3xl sm:text-4xl">How it works</H2>
              <p className="mt-3 text-body">
                Three steps from launch to placement. No sales call required.
              </p>
            </FadeIn>

            <FadeInStagger className="grid gap-8 md:grid-cols-3">
              {STEPS.map((step, index) => (
                <FadeInItem key={step.title} className="flex flex-col gap-3">
                  <span className="font-mono text-4xl font-bold tabular-nums text-primary/25">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <H3 className="text-lg sm:text-xl">{step.title}</H3>
                  <p className="text-sm leading-relaxed text-body">{step.body}</p>
                </FadeInItem>
              ))}
            </FadeInStagger>
          </Container>
        </section>

        {/* ── Why promote ──────────────────────────────────────────────── */}
        <section className="border-b border-border">
          <Container className="py-16 md:py-24">
            <FadeIn className="mx-auto mb-12 max-w-2xl text-center">
              <H2 className="text-3xl sm:text-4xl">Why promote?</H2>
              <p className="mt-3 text-body">
                A promoted slot buys attention in the places people are already looking.
              </p>
            </FadeIn>

            <FadeInStagger className="grid gap-5 sm:grid-cols-2">
              {BENEFITS.map(({ Icon, title, body }) => (
                <FadeInItem
                  key={title}
                  className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 transition-colors duration-200 hover:border-primary/30"
                >
                  <span className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-[#ff6b1a] to-[#ff8a3d] text-white shadow-sm">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <H3 className="text-lg">{title}</H3>
                  <p className="text-sm leading-relaxed text-body">{body}</p>
                </FadeInItem>
              ))}
            </FadeInStagger>
          </Container>
        </section>

        {/* ── Example: one category's board ────────────────────────────── */}
        <section className="border-b border-border bg-secondary-bg/50">
          <Container className="py-16 md:py-24">
            <FadeIn className="mx-auto mb-10 max-w-2xl text-center">
              <H2 className="text-3xl sm:text-4xl">What a category looks like</H2>
              <p className="mt-3 text-body">
                Each category runs its own board. Pick one to see how the positions stack up.
              </p>
            </FadeIn>

            <FadeIn className="mx-auto max-w-3xl">
              <CategoryAuction />
            </FadeIn>
          </Container>
        </section>

        {/* ── Transparency ─────────────────────────────────────────────── */}
        <section className="border-b border-border">
          <Container className="py-16 md:py-24">
            <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
              <FadeIn className="flex flex-col gap-4">
                <span className="flex items-center gap-3 text-xs font-semibold tracking-[0.22em] text-primary uppercase">
                  <span className="h-px w-8 bg-primary" />
                  Transparency
                </span>
                <H2 className="text-3xl sm:text-4xl">Paid visibility is not a better product.</H2>
                <p className="text-body">
                  Promotion buys a position, and nothing else. If a promoted slot could quietly buy
                  credibility too, the rankings underneath it would stop being worth reading — and
                  those rankings are the reason anyone comes here.
                </p>
              </FadeIn>

              <FadeInStagger className="flex flex-col gap-4">
                {TRANSPARENCY.map(({ Icon, title, body }) => (
                  <FadeInItem
                    key={title}
                    className="flex gap-4 rounded-2xl border border-border bg-card p-5"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary-bg text-primary">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <span className="flex flex-col gap-1.5">
                      <span className="text-base font-bold text-ink">{title}</span>
                      <span className="text-sm leading-relaxed text-body">{body}</span>
                    </span>
                  </FadeInItem>
                ))}
              </FadeInStagger>
            </div>
          </Container>
        </section>

        {/* ── Closing CTA ──────────────────────────────────────────────── */}
        <section className="relative isolate overflow-hidden bg-surface-dark">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-full bg-[radial-gradient(ellipse_at_center,rgba(255,107,26,0.18),transparent_65%)]"
          />
          <Container className="flex flex-col items-center gap-6 py-20 text-center md:py-28">
            <FadeIn className="flex flex-col items-center gap-5">
              <H2 className="max-w-[16ch] text-balance text-4xl text-white sm:text-5xl">
                Ready to get discovered?
              </H2>
              <Lead className="max-w-xl text-white/65">
                Put your product in the spotlight — and hold it for as long as you can.
              </Lead>
            </FadeIn>

            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <PromoteCta href="#place-bid" event="promote_start_bidding_footer" size="lg">
                Start Bidding
                <ArrowRight className="size-4" aria-hidden="true" />
              </PromoteCta>
              <Link
                href="/advertise#inquire"
                className={buttonVariants({
                  variant: "ghost",
                  size: "lg",
                  className: "border-white/20 text-white hover:bg-white/10 hover:text-white",
                })}
              >
                Talk to us first
              </Link>
            </div>

            <p className="flex items-center gap-2 text-xs text-white/45">
              <Check className="size-3.5 text-primary" aria-hidden="true" />
              Bidding opens soon. Nothing on this page charges you.
            </p>
          </Container>
        </section>
      </div>
    </AuctionProvider>
  );
}
