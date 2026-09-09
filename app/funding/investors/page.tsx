import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Numeric } from "@/components/ui/typography";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { JsonLd } from "@/components/seo/json-ld";
import { FundingSearch } from "@/components/funding/funding-search";
import { displayAmount, formatDay, UNDISCLOSED_LABEL } from "@/lib/funding/format";
import { absoluteUrl, breadcrumbSchema } from "@/lib/seo";
import { SITE_NAME } from "@/lib/constants";
import { getFundingInvestors } from "@/services/funding";

/**
 * Investor discovery: `/funding/investors`.
 *
 * Everything on this page is derived from published funding rounds. There is
 * no editorial field anywhere in it — no cheque size, no thesis, no contact
 * details, no assets under management — because the moment this page carries a
 * fact that was not in an article, it is inventing investor information, which
 * section 15 of the brief rules out.
 *
 * That also keeps it cleanly distinct from `/investors`, the curated directory
 * this platform sells (20260904000000). That one is researched, paid for, and
 * full of exactly the editorial fields this page refuses to guess at. Two
 * tables, two pages, two different claims about where the data came from.
 */

type PageProps = { searchParams: Promise<{ q?: string; page?: string }> };

const TITLE = "Startup investors in India";
const DESCRIPTION =
  "Investors active in Indian startup funding rounds — deal counts, stages, sectors and their most recent investments, built from published funding news.";

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = await searchParams;

  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: "/funding/investors" },
    openGraph: {
      title: `${TITLE} — ${SITE_NAME}`,
      description: DESCRIPTION,
      url: absoluteUrl("/funding/investors"),
      siteName: SITE_NAME,
      type: "website",
    },
    twitter: { card: "summary", title: `${TITLE} — ${SITE_NAME}`, description: DESCRIPTION },
    // Same reasoning as the feed: a search parameter generates unbounded URLs
    // over content already indexed here.
    ...(params.q ? { robots: { index: false, follow: true } } : {}),
  };
}

const CRUMBS = [
  { name: "Home", path: "/" },
  { name: "Funding", path: "/funding" },
  { name: "Investors", path: "/funding/investors" },
];

export default async function FundingInvestorsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const query = params.q?.trim().slice(0, 80) || null;
  const pageNumber = Number(params.page);
  const page = Number.isInteger(pageNumber) && pageNumber > 1 ? Math.min(pageNumber, 200) : 1;

  const { investors, totalCount, hasMore } = await getFundingInvestors(query, page);

  return (
    <main className="min-h-dvh bg-background">
      <JsonLd data={breadcrumbSchema(CRUMBS)} />

      <Container className="flex flex-col gap-8 py-10 md:py-14">
        <Breadcrumbs items={CRUMBS} />

        <div className="flex flex-col gap-4">
          <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            Investors in Indian startup rounds
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-body">
            Compiled from the funding rounds published on this site. Deal counts, stages and sectors
            are what the reporting said — nothing here is estimated, and no contact details are
            inferred.
          </p>

          <div className="max-w-xl">
            <FundingSearch />
          </div>

          <p className="text-sm text-muted">
            <Numeric>{totalCount.toLocaleString("en-IN")}</Numeric>{" "}
            {totalCount === 1 ? "investor" : "investors"}
            {query ? ` matching “${query}”` : ""}
          </p>
        </div>

        {investors.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
            <p className="text-sm font-semibold text-ink">
              {query ? `No investors found for “${query}”` : "No investors tracked yet"}
            </p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted">
              {query
                ? "Investor names come from published funding rounds. Try a shorter search, or browse the full list."
                : "This list fills in as funding rounds are published. It is built from reporting, so it starts empty rather than seeded."}
            </p>
            {query && (
              <Link
                href="/funding/investors"
                className="mt-4 inline-flex items-center rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold text-ink transition-colors pointer-coarse:min-h-11 hover:border-primary/30 hover:bg-secondary-bg"
              >
                Clear search
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {investors.map((investor) => (
              <article
                key={investor.id}
                className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-bold tracking-tight text-ink">
                      {investor.name}
                    </h2>
                    {investor.last_deal_at && (
                      <p className="text-xs text-muted">
                        Last deal {formatDay(investor.last_deal_at)}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <Numeric className="text-xl font-bold text-ink">
                      {investor.deal_count}
                    </Numeric>
                    <p className="text-[11px] text-muted">
                      {investor.deal_count === 1 ? "deal" : "deals"}
                      {investor.lead_count > 0 ? ` · led ${investor.lead_count}` : ""}
                    </p>
                  </div>
                </div>

                {(investor.stages.length > 0 || investor.industries.length > 0) && (
                  <div className="flex flex-wrap gap-1.5">
                    {investor.stages.slice(0, 4).map((stage) => (
                      <span
                        key={stage}
                        className="inline-flex items-center rounded-full border border-primary/25 bg-primary/8 px-2 py-0.5 text-[11px] font-medium text-primary"
                      >
                        {stage}
                      </span>
                    ))}
                    {investor.industries.slice(0, 4).map((industry) => (
                      <span
                        key={industry}
                        className="inline-flex items-center rounded-md bg-secondary-bg px-2 py-0.5 text-[11px] font-medium text-body"
                      >
                        {industry}
                      </span>
                    ))}
                  </div>
                )}

                {investor.recent_investments.length > 0 && (
                  <div className="flex flex-col gap-1.5 border-t border-border pt-3">
                    <span className="text-xs font-medium text-muted">Recent investments</span>
                    <ul className="flex flex-col gap-1">
                      {investor.recent_investments.slice(0, 4).map((investment) => (
                        <li
                          key={`${investment.startup_slug}-${investment.announcement_date}`}
                          className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs"
                        >
                          <Link
                            href={`/funding/${investment.startup_slug}`}
                            className="font-medium text-ink transition-colors hover:text-primary"
                          >
                            {investment.startup_name}
                          </Link>
                          <span className="text-muted">
                            {investment.funding_stage} ·{" "}
                            <Numeric>
                              {displayAmount({
                                amount: investment.amount,
                                currency: investment.currency,
                              }) ?? UNDISCLOSED_LABEL}
                            </Numeric>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <Link
                  href={`/funding?investor=${encodeURIComponent(investor.name)}`}
                  className="text-xs font-semibold text-primary transition-colors hover:text-primary-active"
                >
                  See every round →
                </Link>
              </article>
            ))}
          </div>
        )}

        {/* Link pagination rather than a load-more button: these pages are
            worth crawling, and a link is the only form of pagination a crawler
            can follow. */}
        {(page > 1 || hasMore) && (
          <nav aria-label="Pagination" className="flex items-center justify-between gap-3">
            {page > 1 ? (
              <Link
                href={buildHref({ q: query, page: page - 1 })}
                className="inline-flex items-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-ink transition-colors pointer-coarse:min-h-11 hover:bg-secondary-bg"
              >
                Previous
              </Link>
            ) : (
              <span />
            )}
            {hasMore && (
              <Link
                href={buildHref({ q: query, page: page + 1 })}
                className="inline-flex items-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-ink transition-colors pointer-coarse:min-h-11 hover:bg-secondary-bg"
              >
                Next
              </Link>
            )}
          </nav>
        )}

        <div>
          <Link
            href="/funding"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary-active"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to funding
          </Link>
        </div>
      </Container>
    </main>
  );
}

function buildHref({ q, page }: { q: string | null; page: number }): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/funding/investors?${query}` : "/funding/investors";
}
