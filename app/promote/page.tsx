/* Design system: design.md (Bharat Hunt — orange) · Promote — fixed-price placements.
 *
 * Every figure on this page is real.
 *
 * It used to open on a scripted auction: invented products, invented bids and a
 * countdown to a round that no backend ran. That board is gone. The prices here
 * are the rows of `promotion_packages` the checkout will actually charge, the
 * audience numbers are `getPlatformStats()` (the same honest totals /advertise
 * quotes), and the categories are the real taxonomy from lib/constants.ts. If a
 * number cannot be read it is not rendered — nothing on this page substitutes a
 * plausible-looking placeholder for a fact.
 *
 * Still prerendered, and that is the one number this page is judged on: the
 * headline is the LCP element and it must be in the delivered document rather
 * than waiting on a scroll observer. Both reads below go through
 * `createPublicClient` (no `auth()`, no per-visitor data), so `force-static`
 * holds — see the prerender note in app/page.tsx for what that cost to get
 * right, and keep `revalidate` here rather than reaching for `force-dynamic`.
 *
 * The dark hero is not a new theme. design.md reserves near-black bands for
 * deliberate moments; the rest of the page returns to the white canvas every
 * other page uses.
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
import { PackageTiers } from "@/components/promote/package-tiers";
import { PromoteCta } from "@/components/promote/promote-cta";
import { getPromotionPackages } from "@/services/promotions";
import { getPlatformStats } from "@/services/products";
import { CATEGORIES, PRODUCT_CATEGORIES } from "@/lib/constants";

// Prerendered, revalidated. Package prices change rarely and nothing on this
// page varies by visitor; see the note at the top before changing this.
export const dynamic = "force-static";
export const revalidate = 600;

export const metadata: Metadata = {
  // The root layout's template appends " · Bharat Hunt".
  title: "Promote Your Product",
  alternates: { canonical: "/promote" },
  description:
    "Get premium visibility for your product on Bharat Hunt. Buy a fixed-price promotion slot and put your product in the spotlight.",
  openGraph: {
    title: "Promote Your Product on Bharat Hunt",
    description:
      "Buy a promoted placement on Bharat Hunt for a fixed price and a fixed window, and put your product in front of people actively discovering new products.",
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
    title: "Pick a published product",
    body: "Promotion is offered on launches that have passed review. A pending product is invisible to every public page, so there would be nothing for a slot to show.",
  },
  {
    title: "Choose a placement and pay",
    body: "Each placement has a stated price and a stated number of days. Payment is handled by Razorpay — card, UPI, netbanking or wallet — on their systems, never ours.",
  },
  {
    title: "Your slot goes live",
    body: "Once the payment clears, the placement starts and runs for the window you bought, clearly labelled as promoted. No renewal, no auto-charge.",
  },
];

const BENEFITS = [
  {
    Icon: Target,
    title: "Reach relevant audiences",
    body: "A category placement puts your product in front of the people already browsing that shelf, rather than everyone at once.",
  },
  {
    Icon: Crown,
    title: "Get premium placement",
    body: "A promoted slot is a fixed position at the top of the pages that matter, for the length of the window you bought.",
  },
  {
    Icon: Compass,
    title: "Drive product discovery",
    body: "Bharat Hunt visitors arrive looking for something new. Placement puts your launch into that moment.",
  },
  {
    Icon: BarChart3,
    title: "Know exactly what you paid for",
    body: "Every purchase is listed on your checkout page with its package, its window, its amount and its payment reference. No estimates, no invoice to chase.",
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

export default async function PromotePage() {
  // Independent reads, both public and cacheable — no reason to await in series.
  const [packages, stats] = await Promise.all([getPromotionPackages(), getPlatformStats()]);

  // A zeroed row means the aggregate could not be read, not that the platform is
  // empty. Rendering "0 makers" as a selling point would be worse than rendering
  // nothing, so the strip is dropped rather than filled in.
  const statCards =
    stats.products > 0
      ? [
          { value: stats.products, label: "Products launched" },
          { value: stats.makers, label: "Makers on board" },
          { value: stats.upvotes, label: "Community upvotes" },
          { value: PRODUCT_CATEGORIES.length, label: "Categories to target" },
        ]
      : [];

  return (
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
        {/* One soft glow behind the headline — the whole decorative budget. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-full bg-[radial-gradient(ellipse_at_top,rgba(255,107,26,0.2),transparent_62%)]"
        />

        <Container className="flex flex-col gap-10 py-12 md:py-16 lg:py-20">
          {/*
            No scroll-reveal wrapper in the hero. `FadeIn` renders `opacity: 0`
            into the server HTML and only reveals once framer-motion has
            hydrated, which would hide the LCP element from the delivered
            document.
          */}
          <div className="flex flex-col items-start gap-6">
            <Breadcrumbs items={CRUMBS} tone="dark" />

            <span className="flex items-center gap-3 text-xs font-semibold tracking-[0.22em] text-primary uppercase">
              <span className="h-px w-8 bg-primary" />
              Bharat Hunt Promote
            </span>

            <Display className="max-w-[14ch] text-balance text-white">
              Put your product in the <span className="text-primary">spotlight</span>.
            </Display>

            <Lead className="max-w-xl text-white/65">
              Buy a promoted placement for a fixed price and a fixed window, and put your product
              in front of people actively discovering new products.
            </Lead>

            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <PromoteCta href="#placements" event="promote_see_placements" size="lg">
                See placements
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
              One payment, one stated window. No auction, no renewal, no charge you did not press a
              button for.
            </p>
          </div>

          {/*
            Real totals or nothing. These are the same figures /advertise quotes,
            derived from published products alone — see `getPlatformStats`.
          */}
          {statCards.length > 0 && (
            <div className="grid grid-cols-2 gap-3 border-t border-white/10 pt-8 sm:gap-4 lg:grid-cols-4">
              {statCards.map((card) => (
                <div
                  key={card.label}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] p-5"
                >
                  <p className="text-3xl font-bold text-primary sm:text-4xl">
                    <Numeric>{card.value}</Numeric>
                  </p>
                  <p className="mt-1 text-sm text-white/55">{card.label}</p>
                </div>
              ))}
            </div>
          )}
        </Container>
      </section>

      {/* ── The placements on sale ───────────────────────────────────── */}
      <section id="placements" className="scroll-mt-20 border-b border-border">
        <Container className="py-16 md:py-24">
          <FadeIn className="mx-auto mb-10 max-w-2xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/[0.07] px-3 py-1 text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">
              Fixed price · Fixed window
            </span>
            <H2 className="mt-5 text-3xl sm:text-4xl">Choose where your product appears.</H2>
            {/* No count in the copy — the catalogue below decides how many
                placements there are, and a fourth package must not make this
                sentence wrong. */}
            <p className="mt-3 text-body">
              Every placement is priced up front. Pay once and hold the position for the stated
              number of days.
            </p>
          </FadeIn>

          <PackageTiers packages={packages} />

          <div className="mx-auto mt-14 max-w-3xl">
            <div className="flex flex-col gap-4 rounded-3xl border border-primary/25 bg-primary/[0.05] p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
              <div className="flex flex-col gap-1.5">
                <H3 className="text-lg sm:text-xl">Ready when you are</H3>
                <p className="text-sm leading-relaxed text-body">
                  Sign in, pick one of your published products, and check out. Payment is handled
                  by Razorpay.
                </p>
              </div>
              <PromoteCta href="/promote/checkout" event="promote_view_packages" size="lg">
                Go to checkout
                <ArrowRight className="size-4" aria-hidden="true" />
              </PromoteCta>
            </div>
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

      {/* ── Where a category placement can run ───────────────────────── */}
      <section className="border-b border-border bg-secondary-bg/50">
        <Container className="py-16 md:py-24">
          <FadeIn className="mx-auto mb-10 max-w-2xl text-center">
            <H2 className="text-3xl sm:text-4xl">Every category is a shelf</H2>
            <p className="mt-3 text-body">
              A category placement runs on the page for the category your product is already filed
              under. These are the real ones — pick one to see what it looks like today.
            </p>
          </FadeIn>

          <FadeInStagger className="mx-auto grid max-w-4xl gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CATEGORIES.map(({ name, slug, icon: Icon }) => (
              <FadeInItem key={slug}>
                <Link
                  href={`/categories/${slug}`}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 transition-[transform,border-color,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-hover"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary-bg text-primary">
                    <Icon className="size-4.5" aria-hidden="true" />
                  </span>
                  <span className="text-sm font-semibold text-ink">{name}</span>
                  <ArrowRight className="ml-auto size-4 shrink-0 text-muted" aria-hidden="true" />
                </Link>
              </FadeInItem>
            ))}
          </FadeInStagger>
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
              Put your product in the spotlight — for a price you know before you press anything.
            </Lead>
          </FadeIn>

          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <PromoteCta href="/promote/checkout" event="promote_view_packages_footer" size="lg">
              Get Promoted
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
            Fixed-price slots, paid securely through Razorpay.
          </p>
        </Container>
      </section>
    </div>
  );
}
