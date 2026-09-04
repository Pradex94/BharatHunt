/* Design system: design.md (Bharat Hunt — orange) · /investors
 *
 * The Investor Directory: a curated investor dataset, previewed free and sold
 * once for a fixed price.
 *
 * ── Three tiers, one route ───────────────────────────────────────────────────
 * A visitor, a signed-in customer who has not bought it, and one who has all
 * land here. The first two see the same thing (hero → free preview → locked
 * teaser → what you get → pricing); the third sees the hero and then the live
 * directory. Which of those renders is decided *on the server* from
 * `hasInvestorDirectoryAccess`, and the premium half is not merely hidden from
 * the other two — it is never fetched for them, so it is not in the HTML, not in
 * the RSC payload, and not in the client bundle.
 *
 * ── Why `force-dynamic` ──────────────────────────────────────────────────────
 * Every render depends on who is asking. `auth()` is a dynamic API and the
 * entitlement read must be fresh — a refund has to take access away on the next
 * request, not when a cache entry happens to expire. The marketing half would
 * prerender happily on its own; splitting it into a second route to get that
 * back would mean two pages a customer can be on and only one of them right.
 *
 * ── LCP ──────────────────────────────────────────────────────────────────────
 * Nothing in the first viewport is wrapped in `FadeIn`. components/ui/motion.tsx
 * documents at length what that cost this site the last time it happened (the
 * navbar logo became the homepage's LCP element). The hero paints at full
 * opacity and only the sections below it animate in.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import {
  ArrowRight,
  Building2,
  Filter,
  Info,
  Mail,
  MapPin,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Users2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Display, H2, H3, Lead, Numeric } from "@/components/ui/typography";
import { FadeIn, FadeInItem, FadeInStagger } from "@/components/ui/motion";
import { buttonVariants } from "@/components/ui/button";
import { Breadcrumbs, type Crumb } from "@/components/seo/breadcrumbs";
import { InvestorHeroVisual } from "@/components/investors/investor-hero-visual";
import { InvestorPreviewGrid } from "@/components/investors/investor-preview-grid";
import { LockedDirectory } from "@/components/investors/locked-directory";
import { UnlockDirectory } from "@/components/investors/unlock-directory";
import { InvestorDirectory } from "@/components/investors/investor-directory";
import { InvestorPageAnalytics } from "@/components/investors/investor-page-analytics";
import {
  getFreeInvestors,
  getInvestorDirectory,
  getInvestorDirectoryPlan,
  getInvestorDirectoryStats,
  getInvestorFacets,
  getUserInvestorPurchases,
  hasInvestorDirectoryAccess,
  INVESTOR_PAGE_SIZE,
} from "@/services/investors";
import { EMPTY_INVESTOR_FACETS, formatPaise, INVESTOR_DISCLAIMER } from "@/lib/investors";

/*
 * The description names what the directory actually contains.
 *
 * An earlier draft said "investment stages and sectors", which the schema
 * supports and the imported dataset does not carry a single value for. A meta
 * description is the promise a searcher decides to click on, so it has to
 * describe the product as shipped rather than as sketched -- and it is the one
 * piece of copy on the page nobody can check before arriving.
 */
export const metadata: Metadata = {
  title: "Investor Directory for Indian Startups",
  alternates: { canonical: "/investors" },
  description:
    "Discover angel investors, VCs, micro VCs and family offices across India and beyond. Explore free investor profiles or unlock the complete Bharat Hunt Investor Directory for ₹499.",
  openGraph: {
    title: "Investor Directory for Indian Startups | Bharat Hunt",
    description:
      "Discover angel investors, VCs, micro VCs and family offices across India and beyond. Explore free investor profiles or unlock the complete Bharat Hunt Investor Directory for ₹499.",
    url: "/investors",
    type: "website",
  },
};

// Reads the signed-in identity and their entitlement — never prerender.
export const dynamic = "force-dynamic";

const CRUMBS: Crumb[] = [
  { name: "Home", path: "/" },
  { name: "Investor Directory", path: "/investors" },
];

/**
 * What the ₹499 buys, as capabilities that exist in this codebase.
 *
 * Each one maps to something real: `sectors`/`investment_stages` columns, the
 * `searchInvestors` action, the filter rail, the detail panel's contact block.
 * A benefit card describing a feature the database cannot serve would be the
 * easiest lie on the page to tell and the fastest to be caught.
 */
/**
 * What the ₹499 buys.
 *
 * Every line here is checked against what the database actually holds. The
 * imported dataset carries names, roles, firms, locations, investor types and
 * contact details — and carries no investment stages, no sectors, no cheque
 * sizes, no thesis and no portfolio. So there are no cards for those, and the
 * copy claims none of them.
 *
 * This list is the easiest place on the site to tell a lie, because nobody can
 * check it before paying. Anything added here has to be something
 * `services/investors.ts` can actually return.
 */
const VALUE_CARDS = [
  {
    Icon: Building2,
    title: "Curated Investor Profiles",
    body: "Angels, VCs, micro VCs, family offices and accelerators in one organised place, instead of thirty browser tabs and a stale spreadsheet.",
  },
  {
    Icon: Users2,
    title: "The Person, Not Just the Fund",
    body: "Names and roles — Founder, Managing Partner, Venture Partner — so you know who you are actually writing to.",
  },
  {
    Icon: MapPin,
    title: "India and Beyond",
    body: "Investors across India's startup hubs plus the US, UK, Singapore, the UAE and Europe, filterable by country.",
  },
  {
    Icon: Target,
    title: "Investor Type",
    body: "Filter to the kind of cheque you are raising — angel, syndicate, micro VC, VC, private equity or accelerator.",
  },
  {
    Icon: Mail,
    title: "Contact Details",
    body: "Email, phone, website and LinkedIn where they are on record, so a warm intro is not the only way in.",
  },
  {
    Icon: Search,
    title: "Search & Filter",
    body: "Search by investor name, firm or keyword, and narrow by investor type and country.",
  },
];

/**
 * Where Dodo Payments sends the customer back to.
 *
 * Read on the server and handed down as plain props rather than pulled out of
 * `useSearchParams()` in the client component, so the confirmation starts on the
 * first render instead of after a hydration round trip — this is the screen
 * someone stares at immediately after paying.
 *
 * `status` is not trusted. It only decides which screen is drawn first; the
 * outcome comes from `confirmInvestorPayment`, which finds the caller's own
 * purchase and asks Dodo what happened to it. There is deliberately no id in the
 * URL to tamper with.
 */
function readReturn(params: Record<string, string | string[] | undefined>): {
  status: "success" | "cancelled" | null;
} {
  const raw = Array.isArray(params.status) ? params.status[0] : params.status;
  return { status: raw === "success" || raw === "cancelled" ? raw : null };
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default async function InvestorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ userId }, params] = await Promise.all([auth(), searchParams]);
  const ret = readReturn(params);

  const hasAccess = await hasInvestorDirectoryAccess(userId);

  /*
   * The premium reads are inside the branch, not above it.
   *
   * `getInvestorDirectory` would return null for an unentitled caller anyway —
   * it checks for itself — but not calling it at all is what guarantees the rows
   * are absent from the response rather than merely unused by it.
   */
  const [plan, freeInvestors, stats] = await Promise.all([
    getInvestorDirectoryPlan(),
    getFreeInvestors(),
    getInvestorDirectoryStats(),
  ]);

  const directory = hasAccess ? await getInvestorDirectory(userId, {}, 0) : null;
  const [facets, purchases] = hasAccess
    ? await Promise.all([getInvestorFacets(userId), getUserInvestorPurchases(userId!)])
    : [EMPTY_INVESTOR_FACETS, []];

  const price = plan ? formatPaise(plan.amountPaise) : null;

  /*
   * Show the payment card when there is a payment to make *or* a return to
   * confirm. The second half matters: a customer coming back from Dodo may
   * already have been settled by the webhook, in which case `hasAccess` is
   * true — and they should still get the success screen rather than being
   * dropped into the directory with no acknowledgement that they just paid.
   */
  const showUnlockCard = !hasAccess || ret.status === "success";

  return (
    <div className="flex flex-col">
      <InvestorPageAnalytics tier={hasAccess ? "paid" : userId ? "free_signed_in" : "visitor"} />

      {/* ── Hero ─────────────────────────────────────────────────────────────
          A near-black band, the surface design.md reserves for deliberate
          feature bands (collections, community, /promote). It is what makes
          this read as a distinct Bharat Hunt product rather than another
          marketing page on the white canvas. */}
      <section className="relative overflow-hidden bg-surface-dark">
        <Container className="relative grid items-center gap-12 py-14 md:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          <div className="flex flex-col items-start gap-6">
            <Breadcrumbs items={CRUMBS} tone="dark" />

            <span className="flex items-center gap-3 text-xs font-semibold tracking-[0.22em] text-primary uppercase">
              <span className="h-px w-8 bg-primary" />
              Bharat Hunt Investor Directory
            </span>

            {/* The page's one h1, and its LCP element. No motion wrapper. */}
            <Display className="text-white">Find the Right Investors. Faster.</Display>

            <Lead className="max-w-xl text-white/70">
              Explore curated investor details and discover who could be the right fit for your
              startup. Get a free preview of investor profiles, then unlock the complete Bharat
              Hunt Investor Directory{price ? ` for just ${price}` : ""}.
            </Lead>

            {/*
              Stacked full-width on a phone, side by side from `sm`. Both are
              44px+ targets. `w-full sm:w-auto` rather than a grid, so a long
              label wraps inside its own button instead of squeezing the other.
            */}
            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
              <a
                href={hasAccess ? "#directory" : "#preview"}
                className={buttonVariants({ size: "lg", className: "w-full sm:w-auto" })}
              >
                Explore Investors
                <ArrowRight className="size-4" aria-hidden="true" />
              </a>
              {!hasAccess && (
                <a
                  href="#unlock"
                  className={cn(
                    buttonVariants({ variant: "on-dark", size: "lg" }),
                    "w-full sm:w-auto",
                  )}
                >
                  Unlock Full Directory{price ? ` — ${price}` : ""}
                </a>
              )}
            </div>

            <p className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-white/50">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="size-3.5" aria-hidden="true" />
                One-time payment
              </span>
              <span className="flex items-center gap-1.5">
                <Sparkles className="size-3.5" aria-hidden="true" />
                Instant access
              </span>
              <span className="flex items-center gap-1.5">
                <Filter className="size-3.5" aria-hidden="true" />
                Search &amp; filters included
              </span>
            </p>
          </div>

          {/* Hidden below `md`: on a phone the hero should be the headline and
              the buttons, not 400px of decorative cards pushing the CTA under
              the fold. Nothing is lost — it is `aria-hidden` furniture. */}
          <InvestorHeroVisual className="hidden md:block" />
        </Container>
      </section>

      {/* The demonstration-data notice. Rendered from a live count, so it
          disappears by itself the day the sample rows are replaced. */}
      {stats.sampleCount > 0 && (
        <div className="border-b border-border bg-secondary-bg">
          <Container className="flex items-start gap-2.5 py-3">
            <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <p className="text-sm text-body">
              <span className="font-medium text-ink">Sample data.</span> This directory currently
              contains{" "}
              <Numeric className="font-medium text-ink">{stats.sampleCount}</Numeric> placeholder
              records used for demonstration. They describe no real investor and are here so the
              product can be reviewed before the live dataset is imported.
            </p>
          </Container>
        </div>
      )}

      {hasAccess ? (
        /* ── Unlocked ─────────────────────────────────────────────────────── */
        <Section>
          <Container className="flex flex-col gap-10">
            {showUnlockCard && plan && (
              <UnlockDirectory
                plan={plan}
                ret={ret}
                isSignedIn
                className="mx-auto w-full max-w-lg"
              />
            )}

            <div className="flex flex-col gap-2">
              <H2>The Investor Directory</H2>
              <p className="text-base text-body">
                Search and filter the full directory. Open any investor for their full profile
                and contact details.
              </p>
            </div>

            {directory ? (
              <InvestorDirectory
                initialInvestors={directory.investors}
                initialTotal={directory.total}
                facets={facets}
                pageSize={INVESTOR_PAGE_SIZE}
              />
            ) : (
              /* `hasAccess` was true but the directory read came back null —
                 only reachable if the entitlement changed between the two
                 queries (a refund landing mid-render). Honest and recoverable
                 rather than a crash. */
              <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-body">
                We could not load the directory just now. Please refresh the page.
              </p>
            )}

            {purchases.length > 0 && (
              <div className="rounded-2xl border border-border bg-card p-5">
                <H3 className="text-base">Your purchase</H3>
                <ul className="mt-3 flex flex-col gap-2">
                  {purchases.map((purchase) => (
                    <li
                      key={purchase.id}
                      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm"
                    >
                      <span className="text-body">
                        {formatDate(purchase.paidAt ?? purchase.createdAt)} ·{" "}
                        <span
                          className={cn(
                            purchase.status === "paid" ? "text-success" : "text-muted",
                          )}
                        >
                          {purchase.status === "paid" ? "active" : purchase.status}
                        </span>
                      </span>
                      <span className="flex items-center gap-3">
                        <Numeric className="text-ink">
                          {formatPaise(purchase.chargedAmount ?? purchase.amountPaise)}
                        </Numeric>
                        {purchase.reference && (
                          <span className="truncate font-mono text-xs text-muted">
                            {purchase.reference}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Container>
        </Section>
      ) : (
        /* ── Locked ───────────────────────────────────────────────────────── */
        <>
          {/* Free preview */}
          <Section id="preview" className="scroll-mt-20">
            <Container className="flex flex-col gap-10">
              <FadeIn className="flex flex-col gap-3 text-center">
                <H2>Start with a Free Preview</H2>
                <Lead className="mx-auto max-w-2xl">
                  Get a glimpse of the investor intelligence inside Bharat Hunt.
                </Lead>
              </FadeIn>

              {freeInvestors.length > 0 ? (
                <InvestorPreviewGrid investors={freeInvestors} />
              ) : (
                <p className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-body">
                  The free preview is being updated. Please check back shortly.
                </p>
              )}
            </Container>
          </Section>

          {/* Locked teaser */}
          <Section className="bg-secondary-bg/40">
            <Container>
              <LockedDirectory
                total={stats.total}
                freeShown={freeInvestors.length}
                amountPaise={plan?.amountPaise ?? null}
              />
            </Container>
          </Section>

          {/* What you get */}
          <Section>
            <Container className="flex flex-col gap-12">
              <FadeIn className="flex flex-col gap-3 text-center">
                <H2>Everything You Need to Find Your Next Investor</H2>
                <Lead className="mx-auto max-w-2xl">
                  Stop spending hours searching across dozens of websites. Find relevant investors
                  in one place.
                </Lead>
              </FadeIn>

              <FadeInStagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {VALUE_CARDS.map(({ Icon, title, body }) => (
                  <FadeInItem key={title} className="h-full">
                    <div className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-6 shadow-xs">
                      <span className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <Icon className="size-5" aria-hidden="true" />
                      </span>
                      <H3 className="text-lg">{title}</H3>
                      <p className="text-sm leading-relaxed text-body">{body}</p>
                    </div>
                  </FadeInItem>
                ))}
              </FadeInStagger>
            </Container>
          </Section>

          {/* Pricing */}
          <Section id="pricing" className="scroll-mt-20 bg-secondary-bg/40">
            <Container className="grid items-start gap-10 lg:grid-cols-[1fr_minmax(0,26rem)] lg:gap-16">
              <FadeIn className="flex flex-col gap-6">
                <H2>One price. The whole directory.</H2>
                <p className="text-base leading-relaxed text-body">
                  Investor research is the part of fundraising that eats weeks: a list here, a
                  tweet there, a spreadsheet someone shared in 2023. This is that work already
                  done — every investor recorded the same way, with the name, role, firm,
                  location and contact details in the same place on every profile.
                </p>
                <ul className="flex flex-col gap-3 text-sm text-body">
                  {[
                    "No subscription and no renewal — you pay once.",
                    "Access appears on this page the moment payment clears.",
                    "New investors added to the directory are included.",
                  ].map((line) => (
                    <li key={line} className="flex items-start gap-2.5">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                      {line}
                    </li>
                  ))}
                </ul>
                <p className="text-sm text-muted">
                  Not ready yet? The{" "}
                  <Link href="#preview" className="font-medium text-primary hover:underline">
                    free preview
                  </Link>{" "}
                  stays open, and{" "}
                  <Link href="/marketplace" className="font-medium text-primary hover:underline">
                    launching your product
                  </Link>{" "}
                  on Bharat Hunt is free.
                </p>
              </FadeIn>

              <UnlockDirectory plan={plan} ret={ret} isSignedIn={Boolean(userId)} />
            </Container>
          </Section>
        </>
      )}

      {/* ── Disclaimer ───────────────────────────────────────────────────────
          Subtle but readable: `text-muted` on the canvas clears WCAG AA (see
          the note on Caption in components/ui/typography.tsx), and it sits
          above the footer on every tier, paid or not. */}
      <div className="border-t border-border">
        <Container className="py-8">
          <p className="mx-auto max-w-3xl text-center text-xs leading-relaxed text-muted">
            {INVESTOR_DISCLAIMER}
          </p>
        </Container>
      </div>
    </div>
  );
}
