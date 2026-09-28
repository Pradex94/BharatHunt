import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowDown, Users } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Numeric } from "@/components/ui/typography";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { JsonLd } from "@/components/seo/json-ld";
import { FundingCalculator } from "@/components/funding/calculator";
import { FundingFilterToolbar } from "@/components/funding/filter-toolbar";
import { FundingFinalCta } from "@/components/funding/final-cta";
import { FundingHeroSearch } from "@/components/funding/hero-search";
import { FundingLiveIndicator } from "@/components/funding/live-indicator";
import { FundingPulseKpis } from "@/components/funding/pulse-kpis";
import { FundingRoadmap } from "@/components/funding/roadmap";
import { FundingRoundList } from "@/components/funding/round-list";
import { FundraisingPlaybook } from "@/components/funding/playbook";
import { TopCitiesSection } from "@/components/funding/top-cities";
import { TopInvestorsSection } from "@/components/funding/top-investors";
import { FundingTrendsSection } from "@/components/funding/trends";
import {
  FeedUnavailable,
  KpiSkeleton,
  NoFundingToday,
  NoFundingYet,
  NoResults,
  RankingSkeleton,
  RoundListSkeleton,
  TrendsSkeleton,
} from "@/components/funding/states";
import {
  fundingFilterKey,
  hasActiveFilters,
  parseFundingFilters,
  type FundingFilters,
  type FundingSearchParams,
} from "@/lib/funding/filters";
import { absoluteUrl, breadcrumbSchema, organizationSchema } from "@/lib/seo";
import { SITE_NAME, SITE_URL } from "@/lib/constants";
import {
  getFundingFeed,
  getFundingInvestors,
  getFundingLastSync,
  getFundingLastUpdated,
  getFundingTrends,
} from "@/services/funding";

/* Hallmark · design-system: design.md — orange accent, white cards on white
 * canvas, Inter bold headlines, JetBrains Mono for figures. Genre: startup
 * intelligence dashboard built from the existing tokens — one orange, one dark
 * band (the closing CTA), no new brand colour, no decorative gradients beyond
 * the CTA style the system already has.
 *
 * Information architecture: the data is the product, so it comes first —
 * hero → pulse → feed → analytics → investors → cities — and the educational
 * half (journey, playbook, calculator) follows it rather than sitting above it.
 */

type PageProps = { searchParams: Promise<FundingSearchParams> };

const TITLE = "India Startup Funding Intelligence | BharatHunt";
const DESCRIPTION =
  "Track Indian startup funding rounds, investors, sectors, stages and fundraising trends with BharatHunt Funding Intelligence.";

/**
 * A filtered or searched view is a re-slice of the same feed, so every one of
 * them canonicalises to `/funding` — the same treatment the marketplace gives
 * its category and pricing filters. `?q=` additionally gets `noindex, follow`:
 * a search parameter can generate an unbounded number of URLs whose content is
 * a subset of a page that is already indexed.
 */
export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = await searchParams;

  return {
    // Absolute: the root template would append "· Bharat Hunt" to a title that
    // already names the brand.
    title: { absolute: TITLE },
    description: DESCRIPTION,
    alternates: { canonical: "/funding" },
    openGraph: {
      title: TITLE,
      description: DESCRIPTION,
      url: absoluteUrl("/funding"),
      siteName: SITE_NAME,
      type: "website",
    },
    twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
    ...(params.q ? { robots: { index: false, follow: true } } : {}),
  };
}

const CRUMBS = [
  { name: "Home", path: "/" },
  { name: "Funding", path: "/funding" },
];

/**
 * Below-the-fold sections skip layout and paint until they approach the
 * viewport. Pure CSS — nothing to hydrate — and the intrinsic size keeps the
 * scrollbar from jumping as they render.
 */
const deferPaint = "[content-visibility:auto] [contain-intrinsic-size:auto_900px]";

export default async function FundingPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const filters = parseFundingFilters(params);

  // No await on data in the shell: the hero (the LCP element) paints
  // immediately, and every data section streams behind its own boundary.
  const renderedAt = new Date().toISOString();

  return (
    <main className="min-h-dvh bg-background">
      <JsonLd
        data={[
          breadcrumbSchema(CRUMBS),
          organizationSchema(),
          {
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: TITLE,
            description: DESCRIPTION,
            url: `${SITE_URL}/funding`,
            isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
            about: { "@id": `${SITE_URL}/funding#dataset` },
          },
          {
            "@context": "https://schema.org",
            "@type": "Dataset",
            "@id": `${SITE_URL}/funding#dataset`,
            name: "Indian startup funding rounds",
            description:
              "Startup funding rounds announced in India — company, amount as reported, stage, industry, city, lead and participating investors, and the publication that reported each round. Compiled from public news sources and reviewed before publication.",
            url: `${SITE_URL}/funding`,
            keywords: [
              "startup funding",
              "India",
              "venture capital",
              "seed funding",
              "Series A",
              "investors",
            ],
            spatialCoverage: { "@type": "Place", name: "India" },
            isAccessibleForFree: true,
            creator: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
          },
        ]}
      />

      {/* ── 1–2. Header + hero ─────────────────────────────────────────── */}
      <section className="border-b border-border bg-secondary-bg/40">
        <Container className="flex flex-col gap-6 pt-6 pb-10 md:pt-8 md:pb-14">
          <Breadcrumbs items={CRUMBS} />

          <div className="flex max-w-3xl flex-col gap-5">
            <Suspense fallback={<div className="h-[30px]" />}>
              <FreshnessLine renderedAt={renderedAt} />
            </Suspense>

            <h1 className="text-[34px] leading-[1.06] font-bold tracking-[-0.03em] text-ink sm:text-5xl md:text-[56px]">
              India Startup Funding Intelligence
            </h1>

            <p className="max-w-2xl text-base leading-relaxed text-body sm:text-lg">
              Track startup funding rounds, investors, sectors and fundraising trends across India
              — updated continuously from public sources.
            </p>

            <FundingHeroSearch />

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="#funding-feed"
                className="btn-gradient inline-flex h-12 items-center justify-center gap-2 rounded-xl px-6 text-sm font-semibold"
              >
                Explore Funding Data
                <ArrowDown className="size-4" aria-hidden="true" />
              </Link>
              <Link
                href="/funding/investors"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 text-sm font-semibold text-ink transition-colors hover:border-primary/30 hover:bg-secondary-bg"
              >
                <Users className="size-4" aria-hidden="true" />
                Find Investors
              </Link>
            </div>
          </div>
        </Container>
      </section>

      <Container className="flex flex-col gap-16 py-8 md:gap-24 md:py-10">
        {/* ── 3. Funding Pulse KPIs ───────────────────────────────────── */}
        <section aria-label="Funding pulse at a glance">
          <Suspense fallback={<KpiSkeleton />}>
            <KpiSection />
          </Suspense>
        </section>

        {/* ── 4–5. Search + filters, latest rounds ────────────────────── */}
        <section
          id="funding-feed"
          aria-labelledby="funding-feed-heading"
          className="flex scroll-mt-20 flex-col gap-5"
        >
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold tracking-wide text-primary uppercase">
              Funding feed
            </span>
            <h2
              id="funding-feed-heading"
              className="text-2xl font-bold tracking-tight text-ink sm:text-3xl"
            >
              Latest Funding Rounds
            </h2>
            <p className="max-w-2xl text-sm leading-relaxed text-body">
              Every amount is what its source reported, and every round links to the original
              story. Rounds reported by several outlets are merged into one.
            </p>
          </div>

          {/* Sticky under the 64px navbar so filters stay reachable down a
              long feed — one compact row, not a panel covering the feed. */}
          <div className="sticky top-16 z-30 -mx-4 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-sm sm:-mx-6 sm:px-6">
            <FundingFilterToolbar />
          </div>

          <Suspense key={fundingFilterKey(filters)} fallback={<RoundListSkeleton />}>
            <FeedSection params={params} filters={filters} />
          </Suspense>
        </section>

        {/* ── 6. Analytics ────────────────────────────────────────────── */}
        <div className={deferPaint}>
          <Suspense fallback={<TrendsSkeleton />}>
            <TrendsSection />
          </Suspense>
        </div>

        {/* ── 7. Top investors ────────────────────────────────────────── */}
        <div className={deferPaint}>
          <Suspense fallback={<RankingSkeleton rows={8} />}>
            <InvestorsSection />
          </Suspense>
        </div>

        {/* ── 8. Cities ───────────────────────────────────────────────── */}
        <div className={deferPaint}>
          <Suspense fallback={<RankingSkeleton rows={4} />}>
            <CitiesSection />
          </Suspense>
        </div>

        {/* ── 9. Journey ──────────────────────────────────────────────── */}
        <div className={deferPaint}>
          <FundingRoadmap />
        </div>

        {/* ── 10. Playbook ────────────────────────────────────────────── */}
        <div className={deferPaint}>
          <FundraisingPlaybook />
        </div>

        {/* ── 11. Calculator ──────────────────────────────────────────── */}
        <div id="funding-calculator-section" className="scroll-mt-20">
          <FundingCalculator />
        </div>

        {/* ── 12. Final CTA ───────────────────────────────────────────── */}
        <FundingFinalCta />
      </Container>
    </main>
  );
}

/* ── Streamed sections ─────────────────────────────────────────────────── */

async function FreshnessLine({ renderedAt }: { renderedAt: string }) {
  const [lastSyncedAt, latestRoundAt] = await Promise.all([
    getFundingLastSync(),
    getFundingLastUpdated(),
  ]);
  return (
    <FundingLiveIndicator
      lastSyncedAt={lastSyncedAt}
      latestRoundAt={latestRoundAt}
      renderedAt={renderedAt}
      className="self-start"
    />
  );
}

async function KpiSection() {
  // The same cached call as the charts and the city ranking below; React's
  // per-request cache makes it one query for all three.
  const trends = await getFundingTrends(12);
  return <FundingPulseKpis trends={trends} />;
}

async function FeedSection({
  params,
  filters,
}: {
  params: FundingSearchParams;
  filters: FundingFilters;
}) {
  const feed = await getFundingFeed(filters);

  if (feed.failed) return <FeedUnavailable />;

  if (feed.rounds.length === 0) {
    // Different nothings, and the reader's next move differs for each.
    const latest = await getFundingLastUpdated();
    if (!latest && !hasActiveFilters(filters)) return <NoFundingYet />;

    const onlyToday =
      filters.date === "today" &&
      !hasActiveFilters({ ...filters, date: "all" });
    if (onlyToday) return <NoFundingToday />;

    return <NoResults query={filters.q} hasFilters={hasActiveFilters(filters)} />;
  }

  const filtered = hasActiveFilters(filters);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted" aria-live="polite">
        <Numeric className="font-semibold text-ink">
          {feed.totalCount.toLocaleString("en-IN")}
        </Numeric>{" "}
        {feed.totalCount === 1 ? "round" : "rounds"}
        {filtered ? (feed.totalCount === 1 ? " matches" : " match") + " your filters" : " tracked"}
      </p>
      <FundingRoundList
        key={fundingFilterKey(filters)}
        initialRounds={feed.rounds}
        initialPage={filters.page}
        initialHasMore={feed.hasMore}
        params={params}
      />
    </div>
  );
}

async function TrendsSection() {
  const trends = await getFundingTrends(12);
  return <FundingTrendsSection trends={trends} />;
}

async function InvestorsSection() {
  // Page 1 of the directory — the exact cache entry /funding/investors uses.
  const { investors } = await getFundingInvestors(null, 1);
  return <TopInvestorsSection investors={investors} />;
}

async function CitiesSection() {
  const trends = await getFundingTrends(12);
  return <TopCitiesSection trends={trends} />;
}
