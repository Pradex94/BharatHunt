import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, BookOpen } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { JsonLd } from "@/components/seo/json-ld";
import { FundingCalculator } from "@/components/funding/calculator";
import { FundingFilterBar } from "@/components/funding/filter-bar";
import { FundingLiveIndicator } from "@/components/funding/live-indicator";
import { FundingRoadmap } from "@/components/funding/roadmap";
import { FundingRoundList } from "@/components/funding/round-list";
import { FundingSearch } from "@/components/funding/funding-search";
import { FundingSnapshotStrip } from "@/components/funding/snapshot";
import { FundingTrendsSection } from "@/components/funding/trends";
import {
  NoFundingYet,
  NoResults,
  RoundListSkeleton,
  SnapshotSkeleton,
  TrendsSkeleton,
} from "@/components/funding/states";
import { relativeTime } from "@/lib/funding/format";
import {
  fundingFilterKey,
  hasActiveFilters,
  parseFundingFilters,
  type FundingSearchParams,
} from "@/lib/funding/filters";
import { FUNDING_GUIDES } from "@/lib/funding/guides";
import { absoluteUrl, breadcrumbSchema } from "@/lib/seo";
import { SITE_NAME, SITE_URL } from "@/lib/constants";
import {
  getFundingFeed,
  getFundingLastUpdated,
  getFundingSnapshot,
  getFundingTrends,
} from "@/services/funding";

/* Hallmark · design-system: design.md — orange accent, white cards on white
 * canvas, 24px card radius, Inter bold headlines, JetBrains Mono for figures.
 * Genre: Bloomberg-style intelligence surface built from the existing tokens;
 * no new brand colour, no gradients beyond the one CTA the system already has.
 */

type PageProps = { searchParams: Promise<FundingSearchParams> };

const TITLE = "Funding Intelligence";
const DESCRIPTION =
  "Track the latest Indian startup funding news, funding rounds, investors, funding trends and learn how startups can raise capital.";

/**
 * A filtered or searched view is a re-slice of the same feed, so every one of
 * them canonicalises to `/funding` — the same treatment the marketplace gives
 * its category and pricing filters. `?q=` additionally gets `noindex, follow`:
 * a search parameter can generate an unbounded number of URLs whose content is
 * a subset of a page that is already indexed, and a canonical is a hint where
 * `noindex` is a directive.
 */
export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = await searchParams;

  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: "/funding" },
    openGraph: {
      title: `${TITLE} — ${SITE_NAME}`,
      description: DESCRIPTION,
      url: absoluteUrl("/funding"),
      siteName: SITE_NAME,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${TITLE} — ${SITE_NAME}`,
      description: DESCRIPTION,
    },
    ...(params.q ? { robots: { index: false, follow: true } } : {}),
  };
}

const CRUMBS = [
  { name: "Home", path: "/" },
  { name: "Funding", path: "/funding" },
];

export default async function FundingPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const filters = parseFundingFilters(params);

  // The only await in the shell. Everything below streams, so the hero — which
  // is the LCP element — paints without waiting on the feed, the snapshot or
  // five aggregate queries.
  const lastUpdatedAt = await getFundingLastUpdated();

  return (
    <main className="min-h-dvh bg-background">
      <JsonLd
        data={[
          breadcrumbSchema(CRUMBS),
          {
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: `${TITLE} — ${SITE_NAME}`,
            description: DESCRIPTION,
            url: `${SITE_URL}/funding`,
            isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
          },
        ]}
      />

      {/* ── A. Hero ─────────────────────────────────────────────────────── */}
      <section className="border-b border-border bg-secondary-bg/40">
        <Container className="flex flex-col gap-6 py-10 md:py-14">
          <Breadcrumbs items={CRUMBS} />

          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-3">
              <FundingLiveIndicator
                lastUpdatedAt={lastUpdatedAt}
                initialLabel={relativeTime(lastUpdatedAt)}
              />
            </div>

            <h1 className="max-w-3xl text-4xl leading-[1.08] font-bold tracking-[-0.03em] text-ink sm:text-5xl md:text-[56px]">
              Track where India&rsquo;s startup money is moving.
            </h1>

            <p className="max-w-2xl text-base leading-relaxed text-body sm:text-lg">
              Real-time funding intelligence, startup funding rounds, investors and actionable
              fundraising insights — all in one place.
            </p>

            <div className="max-w-xl">
              <FundingSearch />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="#funding-feed"
                className="btn-gradient inline-flex h-11 items-center justify-center rounded-md px-6 text-sm font-medium"
              >
                Explore funding
              </Link>
              <Link
                href="#funding-roadmap"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-border bg-card px-6 text-sm font-medium text-ink transition-colors hover:border-primary/30 hover:bg-secondary-bg"
              >
                <BookOpen className="size-4" aria-hidden="true" />
                Learn how to raise
              </Link>
            </div>
          </div>
        </Container>
      </section>

      <Container className="flex flex-col gap-14 py-10 md:gap-20 md:py-14">
        {/* ── B. Snapshot ───────────────────────────────────────────────── */}
        <Suspense fallback={<SnapshotSkeleton />}>
          <SnapshotSection />
        </Suspense>

        {/* ── C + D. Feed ───────────────────────────────────────────────── */}
        <section id="funding-feed" className="flex scroll-mt-24 flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">
              Latest funding rounds
            </h2>
            <p className="text-sm text-body">
              Every figure is what its source reported, linked back to the original story.
            </p>
          </div>

          {/* Sticky under the 64px navbar, like the marketplace toolbar, so the
              filters stay reachable while a long feed scrolls. */}
          <div className="sticky top-16 z-30 -mx-4 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-sm sm:-mx-6 sm:px-6">
            <Suspense fallback={<div className="h-32" />}>
              <FilterBarSection params={params} />
            </Suspense>
          </div>

          <Suspense key={fundingFilterKey(filters)} fallback={<RoundListSkeleton />}>
            <FeedSection params={params} />
          </Suspense>
        </section>

        {/* ── E. Trends ─────────────────────────────────────────────────── */}
        <Suspense fallback={<TrendsSkeleton />}>
          <TrendsSection />
        </Suspense>

        {/* ── F. Roadmap ────────────────────────────────────────────────── */}
        <div id="funding-roadmap" className="scroll-mt-24">
          <FundingRoadmap />
        </div>

        {/* ── G. Guides ─────────────────────────────────────────────────── */}
        <section aria-labelledby="funding-guides" className="flex flex-col gap-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h2 id="funding-guides" className="text-2xl font-bold tracking-tight text-ink">
                Fundraising guides
              </h2>
              <p className="text-sm text-body">
                Ten guides covering the whole process, from the first deck to the closing paperwork.
              </p>
            </div>
            <Link
              href="/funding/guides"
              className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:text-primary-active"
            >
              All guides
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FUNDING_GUIDES.slice(0, 6).map((guide) => (
              <Link
                key={guide.slug}
                href={`/funding/guides/${guide.slug}`}
                className="group/guide flex flex-col gap-2 rounded-2xl border border-border bg-card p-5 transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-hover"
              >
                <h3 className="text-sm font-bold tracking-tight text-ink group-hover/guide:text-primary">
                  {guide.title}
                </h3>
                <p className="text-sm leading-relaxed text-body">{guide.excerpt}</p>
                <span className="mt-1 text-xs text-muted">{guide.readingMinutes} min read</span>
              </Link>
            ))}
          </div>
        </section>

        {/* ── H. Calculator ─────────────────────────────────────────────── */}
        <FundingCalculator />
      </Container>
    </main>
  );
}

/* ── Streamed sections ─────────────────────────────────────────────────── */

async function SnapshotSection() {
  const snapshot = await getFundingSnapshot();
  return <FundingSnapshotStrip snapshot={snapshot} />;
}

/**
 * The filter bar needs the result count, which means it needs the feed — and
 * the feed read is cached, so asking for it twice in one render is one query
 * and one cache hit rather than two queries.
 */
async function FilterBarSection({ params }: { params: FundingSearchParams }) {
  const filters = parseFundingFilters(params);
  const feed = await getFundingFeed(filters);
  return <FundingFilterBar resultCount={feed.totalCount} />;
}

async function FeedSection({ params }: { params: FundingSearchParams }) {
  const filters = parseFundingFilters(params);
  const [feed, snapshot] = await Promise.all([getFundingFeed(filters), getFundingSnapshot()]);

  if (feed.rounds.length === 0) {
    // Two different nothings, and the reader's next move differs: an empty
    // dataset is nobody's fault, an empty filter result is one click from a
    // full one.
    const datasetIsEmpty = (snapshot?.totalRounds ?? 0) === 0;
    return datasetIsEmpty ? (
      <NoFundingYet />
    ) : (
      <NoResults query={filters.q} hasFilters={hasActiveFilters(filters)} />
    );
  }

  return (
    <FundingRoundList
      key={fundingFilterKey(filters)}
      initialRounds={feed.rounds}
      initialPage={filters.page}
      initialHasMore={feed.hasMore}
      params={params}
    />
  );
}

async function TrendsSection() {
  const trends = await getFundingTrends(12);
  return <FundingTrendsSection trends={trends} />;
}
