import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2 } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Numeric } from "@/components/ui/typography";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { JsonLd } from "@/components/seo/json-ld";
import { FundingRoundCard } from "@/components/funding/round-card";
import { FUNDING_STAGE_BADGE, type FundingStage } from "@/lib/funding/constants";
import { displayAmount, formatDay, formatInr, UNDISCLOSED_LABEL } from "@/lib/funding/format";
import { RESERVED_FUNDING_SLUGS } from "@/lib/funding/guides";
import { absoluteUrl, breadcrumbSchema } from "@/lib/seo";
import { SITE_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { getStartupFundingProfile, type FundingRoundRow } from "@/services/funding";

/**
 * A company's funding history: `/funding/<startup-slug>`.
 *
 * Reachable only for companies with at least one *published* round — the RLS
 * predicate on `funding_startups` (`published_round_count > 0`) does that, so a
 * pending round never creates a company page and this route does not have to
 * check for it.
 *
 * On the structured data
 * ----------------------
 * `BreadcrumbList` and an `ItemList` of the rounds, and deliberately not
 * `NewsArticle`. We are not the publisher of these stories — each round links
 * out to the outlet that reported it — and marking up someone else's reporting
 * as our article is precisely the kind of claim that earns a manual action.
 * `Organization` is also left off: everything known about the company here came
 * from a funding article, which is not enough to assert an entity's identity.
 */

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  if (RESERVED_FUNDING_SLUGS.has(slug)) return {};

  const profile = await getStartupFundingProfile(slug);
  if (!profile) {
    return { title: "Funding profile not found", robots: { index: false, follow: true } };
  }

  const total = formatInr(profile.total_disclosed_inr);
  const description =
    `${profile.name} funding history: ${profile.published_round_count} ` +
    `${profile.published_round_count === 1 ? "round" : "rounds"} tracked on Bharat Hunt` +
    (profile.total_disclosed_inr > 0 ? `, ${total} in disclosed funding.` : ".") +
    " Investors, stages and dates, each linked to the source that reported it.";

  return {
    title: `${profile.name} funding history`,
    description,
    alternates: { canonical: `/funding/${profile.slug}` },
    openGraph: {
      title: `${profile.name} — funding history`,
      description,
      url: absoluteUrl(`/funding/${profile.slug}`),
      siteName: SITE_NAME,
      type: "website",
    },
    twitter: { card: "summary", title: `${profile.name} — funding history`, description },
  };
}

export default async function StartupFundingPage({ params }: PageProps) {
  const { slug } = await params;

  /*
   * Next resolves a static segment ahead of a dynamic sibling, so
   * `/funding/investors` never reaches this route. This guard is the other
   * half: a company whose name slugified to "investors" would get a profile
   * page nobody could ever open, and a 404 is a truer answer than a page that
   * exists at an unreachable address.
   */
  if (RESERVED_FUNDING_SLUGS.has(slug)) notFound();

  const profile = await getStartupFundingProfile(slug);
  if (!profile) notFound();

  const crumbs = [
    { name: "Home", path: "/" },
    { name: "Funding", path: "/funding" },
    { name: profile.name, path: `/funding/${profile.slug}` },
  ];

  const byYear = groupByYear(profile.rounds);
  const investors = uniqueInvestors(profile.rounds);
  const total = formatInr(profile.total_disclosed_inr);
  const disclosedCount = profile.rounds.filter((round) => round.amount_inr !== null).length;

  return (
    <main className="min-h-dvh bg-background">
      <JsonLd
        data={[
          breadcrumbSchema(crumbs),
          {
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: `${profile.name} funding rounds`,
            url: absoluteUrl(`/funding/${profile.slug}`),
            numberOfItems: profile.rounds.length,
            itemListElement: profile.rounds.map((round, index) => ({
              "@type": "ListItem",
              position: index + 1,
              name: round.headline,
              url: round.source_url,
            })),
          },
        ]}
      />

      <Container className="flex max-w-4xl flex-col gap-8 py-10 md:py-14">
        <Breadcrumbs items={crumbs} />

        <div className="flex flex-col gap-5">
          <div className="flex items-start gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Building2 className="size-6" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">
                {profile.name}
              </h1>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                {profile.industry && <span>{profile.industry}</span>}
                {profile.industry && (profile.location || profile.city) && (
                  <span aria-hidden="true">·</span>
                )}
                {(profile.location || profile.city) && (
                  <span>{profile.location ?? profile.city}</span>
                )}
              </p>
            </div>
          </div>

          {/* The two headline figures. The total carries its denominator for
              the same reason the snapshot's does: a company with three rounds
              and one disclosed amount has a "total" that means one round. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat
              label="Total disclosed funding"
              value={profile.total_disclosed_inr > 0 ? (total ?? "—") : UNDISCLOSED_LABEL}
              detail={
                profile.total_disclosed_inr > 0
                  ? `across ${disclosedCount} of ${profile.published_round_count} rounds`
                  : "no amounts reported"
              }
            />
            <Stat
              label="Rounds tracked"
              value={String(profile.published_round_count)}
              detail={
                profile.first_round_at
                  ? `since ${formatDay(profile.first_round_at)}`
                  : "on Bharat Hunt"
              }
            />
            <Stat
              label="Investors named"
              value={String(investors.length)}
              detail={investors.length === 0 ? "none reported" : "across all rounds"}
            />
          </div>

          {investors.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium text-muted">Investors</span>
              {investors.map((investor) => (
                <Link
                  key={investor}
                  href={`/funding?investor=${encodeURIComponent(investor)}`}
                  className="inline-flex items-center rounded-full border border-border bg-card px-2.5 py-1 text-xs text-body transition-colors hover:border-primary/30 hover:text-primary"
                >
                  {investor}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Funding history, newest year first — the shape the brief asks for. */}
        <section aria-labelledby="funding-history" className="flex flex-col gap-6">
          <h2 id="funding-history" className="text-xl font-bold tracking-tight text-ink">
            Funding history
          </h2>

          {byYear.map(([year, rounds]) => (
            <div key={year} className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <Numeric className="text-sm font-bold text-primary">{year}</Numeric>
                <span className="h-px flex-1 bg-border" aria-hidden="true" />
              </div>

              {/* A compact summary line per round, then the full card. The line
                  is what makes the history skimmable as a ladder; the card is
                  what carries the source attribution. */}
              <ul className="flex flex-col gap-1.5">
                {rounds.map((round) => {
                  const amount = displayAmount(round);
                  return (
                    <li
                      key={`${round.id}-summary`}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-secondary-bg/60 px-3 py-2 text-sm"
                    >
                      <span
                        className={cn(
                          "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold",
                          FUNDING_STAGE_BADGE[round.funding_stage as FundingStage] ??
                            FUNDING_STAGE_BADGE.Undisclosed,
                        )}
                      >
                        {round.funding_stage}
                      </span>
                      <Numeric className="font-bold text-ink">
                        {amount ?? UNDISCLOSED_LABEL}
                      </Numeric>
                      <span className="text-xs text-muted">
                        {formatDay(round.announcement_date)}
                      </span>
                    </li>
                  );
                })}
              </ul>

              <div className="flex flex-col gap-3">
                {rounds.map((round) => (
                  <FundingRoundCard key={round.id} round={round} />
                ))}
              </div>
            </div>
          ))}
        </section>

        <div>
          <Link
            href="/funding"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary-active"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            All funding rounds
          </Link>
        </div>
      </Container>
    </main>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4">
      <span className="text-xs font-medium text-muted">{label}</span>
      <Numeric className="text-xl font-bold text-ink">{value}</Numeric>
      <span className="text-[11px] text-muted-soft">{detail}</span>
    </div>
  );
}

/** Newest year first, rounds within a year newest first. */
function groupByYear(rounds: FundingRoundRow[]): [string, FundingRoundRow[]][] {
  const groups = new Map<string, FundingRoundRow[]>();

  for (const round of rounds) {
    const year = round.announcement_date.slice(0, 4);
    const bucket = groups.get(year);
    if (bucket) bucket.push(round);
    else groups.set(year, [round]);
  }

  return [...groups.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
}

/** Every investor named across the company's rounds, in first-seen order. */
function uniqueInvestors(rounds: FundingRoundRow[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];

  for (const round of rounds) {
    for (const investor of round.investors) {
      const key = investor.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(investor);
    }
  }
  return names;
}
