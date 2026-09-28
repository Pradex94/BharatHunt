import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, ExternalLink } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Numeric } from "@/components/ui/typography";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { JsonLd } from "@/components/seo/json-ld";
import { CompanyMark, FundingRoundCard, TrustLabel } from "@/components/funding/round-card";
import { FUNDING_STAGE_BADGE, type FundingStage } from "@/lib/funding/constants";
import {
  convertedInrEstimate,
  formatDay,
  formatInr,
  formatReportedAmount,
  UNDISCLOSED_LABEL,
} from "@/lib/funding/format";
import { cityLabel, industryHref, investorHref, startupHref } from "@/lib/funding/links";
import { RESERVED_FUNDING_SLUGS } from "@/lib/funding/guides";
import { groupFundingEvents } from "@/lib/funding/grouping";
import { absoluteUrl, breadcrumbSchema } from "@/lib/seo";
import { SITE_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  getRelatedFundingRounds,
  getStartupFundingProfile,
  type FundingRoundRow,
} from "@/services/funding";

/**
 * A company's funding page: `/funding/<startup-slug>`.
 *
 * One page per *company*, not per round. A per-round URL for a company with a
 * single round would be a second page with the same content — the thin,
 * duplicate pages this feature must not generate — and a company page is what
 * a founder or investor actually looks up. The latest round leads, as a
 * key-facts panel; earlier rounds follow as the history.
 *
 * Reachable only for companies with at least one *published* round — the RLS
 * predicate on `funding_startups` (`published_round_count > 0`) does that, so a
 * pending round never creates a company page.
 *
 * On the structured data
 * ----------------------
 * `BreadcrumbList` and an `ItemList` of the rounds, and deliberately not
 * `NewsArticle` / `Article`. We are not the publisher of these stories — each
 * round links out to the outlet that reported it — and marking up someone
 * else's reporting as our article is the kind of claim that earns a manual
 * action. `Organization` is also left off: everything known about the company
 * came from a funding article, which is not enough to assert an entity's
 * identity.
 */

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  if (RESERVED_FUNDING_SLUGS.has(slug)) return {};

  // Same call as the page; `cache()` in the service makes it one query pair.
  const profile = await getStartupFundingProfile(slug);
  if (!profile) {
    return { title: "Funding profile not found", robots: { index: false, follow: true } };
  }

  const rounds = groupFundingEvents(profile.rounds);
  const latest = rounds[0];
  const latestAmount = latest ? formatReportedAmount(latest) : null;
  const latestStage =
    latest && latest.funding_stage !== "Undisclosed" ? `${latest.funding_stage} ` : "";

  const title = latest
    ? `${profile.name} funding: ${latestAmount ? `${latestAmount} ` : ""}${latestStage}round, investors & history`
    : `${profile.name} funding history`;

  const disclosedInr = rounds.reduce((sum, round) => sum + (round.amount_inr ?? 0), 0);
  const total = formatInr(disclosedInr);
  const description =
    (latest
      ? `${profile.name} raised ${latestAmount ?? "an undisclosed amount"}` +
        (latestStage ? ` in a ${latestStage.trim()} round` : "") +
        (latest.lead_investor ? ` led by ${latest.lead_investor}` : "") +
        ` (${formatDay(latest.announcement_date)}). `
      : "") +
    `${rounds.length} ${rounds.length === 1 ? "round" : "rounds"} tracked` +
    (disclosedInr > 0 ? `, ${total} disclosed in total` : "") +
    ". Investors, stages and dates, each linked to the source that reported it.";

  return {
    title,
    description: description.slice(0, 300),
    alternates: { canonical: `/funding/${profile.slug}` },
    openGraph: {
      title: `${profile.name} — funding rounds & investors`,
      description,
      url: absoluteUrl(`/funding/${profile.slug}`),
      siteName: SITE_NAME,
      type: "website",
    },
    twitter: { card: "summary", title: `${profile.name} — funding rounds & investors`, description },
  };
}

export default async function StartupFundingPage({ params }: PageProps) {
  const { slug } = await params;

  /*
   * Next resolves a static segment ahead of a dynamic sibling, so
   * `/funding/investors` never reaches this route. This guard is the other
   * half: a company whose name slugified to "investors" would get a profile
   * page nobody could ever open.
   */
  if (RESERVED_FUNDING_SLUGS.has(slug)) notFound();

  const profile = await getStartupFundingProfile(slug);
  if (!profile) notFound();

  const related = await getRelatedFundingRounds(profile.industry, profile.slug);

  const crumbs = [
    { name: "Home", path: "/" },
    { name: "Funding", path: "/funding" },
    { name: profile.name, path: `/funding/${profile.slug}` },
  ];

  /*
   * Grouped before anything is counted: the `published_round_count` and
   * `total_disclosed_inr` rollups count every record, so a round that ingestion
   * stored twice would be counted — and summed — twice. The figures on this
   * page are computed from the grouped events instead.
   */
  const rounds = groupFundingEvents(profile.rounds);
  const [latest, ...earlier] = rounds;
  const investors = uniqueInvestors(rounds);
  const disclosedInr = rounds.reduce((sum, round) => sum + (round.amount_inr ?? 0), 0);
  const total = formatInr(disclosedInr);
  const disclosedCount = rounds.filter((round) => round.amount_inr !== null).length;
  const place = profile.city ? cityLabel(profile.city) : profile.location;

  const relatedEvents = groupFundingEvents(related);
  const relatedRounds = relatedEvents.slice(0, 5);
  const similarStartups = distinctStartups(relatedEvents).slice(0, 6);
  const sectorInvestors = topInvestors(relatedEvents, investors).slice(0, 8);

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
            numberOfItems: rounds.length,
            itemListElement: rounds.map((round, index) => ({
              "@type": "ListItem",
              position: index + 1,
              name: round.headline,
              url: round.source_url,
            })),
          },
        ]}
      />

      <Container className="flex max-w-5xl flex-col gap-10 py-8 md:py-12">
        <Breadcrumbs items={crumbs} />

        {/* ── Company header ──────────────────────────────────────────── */}
        <header className="flex flex-col gap-6">
          <div className="flex items-start gap-4">
            <CompanyMark name={profile.name} logoUrl={profile.logo_url} size="lg" />
            <div className="min-w-0 flex-1">
              <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">
                {profile.name}
              </h1>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                {profile.industry && (
                  <Link href={industryHref(profile.industry)} className="hover:text-primary">
                    {profile.industry}
                  </Link>
                )}
                {profile.industry && place && <span aria-hidden="true">·</span>}
                {place && <span>{place}</span>}
                {profile.website && (
                  <>
                    <span aria-hidden="true">·</span>
                    <a
                      href={profile.website}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="inline-flex items-center gap-1 hover:text-primary"
                    >
                      Website
                      <ExternalLink className="size-3" aria-hidden="true" />
                    </a>
                  </>
                )}
              </p>
              {profile.description && (
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-body">
                  {profile.description}
                </p>
              )}
            </div>
          </div>

          {/* Headline figures. The total carries its denominator: a company
              with three rounds and one disclosed amount has a "total" that
              means one round. */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
            <Stat
              label="Total known funding"
              value={disclosedInr > 0 ? (total ?? "—") : UNDISCLOSED_LABEL}
              detail={
                disclosedInr > 0
                  ? `disclosed in ${disclosedCount} of ${rounds.length} rounds`
                  : "no amounts reported"
              }
              emphasis
            />
            <Stat
              label="Latest round"
              value={latest ? (formatReportedAmount(latest) ?? UNDISCLOSED_LABEL) : "—"}
              detail={latest ? `${latest.funding_stage} · ${formatDay(latest.announcement_date)}` : ""}
            />
            <Stat
              label="Rounds tracked"
              value={String(rounds.length)}
              detail={profile.first_round_at ? `since ${formatDay(profile.first_round_at)}` : "on Bharat Hunt"}
            />
            <Stat
              label="Investors named"
              value={String(investors.length)}
              detail={investors.length === 0 ? "none reported" : "across all rounds"}
            />
          </div>
        </header>

        {/* ── Latest round: key facts ─────────────────────────────────── */}
        {latest && <KeyFacts round={latest} />}

        {/* ── Previous funding ────────────────────────────────────────── */}
        <section aria-labelledby="funding-history" className="flex flex-col gap-4">
          <h2 id="funding-history" className="text-xl font-bold tracking-tight text-ink">
            Funding history
          </h2>

          <ol className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-card">
            {rounds.map((round, index) => {
              const amount = formatReportedAmount(round);
              return (
                <li
                  key={`${round.id}-ladder`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm"
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
                  <Numeric className={cn("font-bold", amount ? "text-ink" : "text-muted-soft")}>
                    {amount ?? UNDISCLOSED_LABEL}
                  </Numeric>
                  {round.lead_investor && (
                    <span className="min-w-0 truncate text-xs text-body">
                      led by {round.lead_investor}
                    </span>
                  )}
                  <span className="ml-auto text-xs text-muted">
                    {formatDay(round.announcement_date)}
                    {index === 0 && <span className="ml-1.5 font-semibold text-primary">Latest</span>}
                  </span>
                </li>
              );
            })}
          </ol>

          {earlier.length > 0 ? (
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-muted">Earlier rounds</h3>
              {earlier.map((round) => (
                <FundingRoundCard key={round.id} round={round} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">
              No earlier rounds tracked. Coverage starts from when Bharat Hunt began following
              funding news, so rounds raised before then may not appear here.
            </p>
          )}
        </section>

        {/* ── Investors ───────────────────────────────────────────────── */}
        {(investors.length > 0 || sectorInvestors.length > 0) && (
          <section aria-labelledby="related-investors" className="flex flex-col gap-4">
            <h2 id="related-investors" className="text-xl font-bold tracking-tight text-ink">
              Related investors
            </h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {investors.length > 0 && (
                <InvestorGroup title={`Backed ${profile.name}`} names={investors} />
              )}
              {sectorInvestors.length > 0 && profile.industry && (
                <InvestorGroup
                  title={`Also active in ${profile.industry}`}
                  names={sectorInvestors}
                />
              )}
            </div>
          </section>
        )}

        {/* ── Related rounds + similar startups ───────────────────────── */}
        {relatedRounds.length > 0 && (
          <section aria-labelledby="related-rounds" className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="flex flex-col gap-4">
              <h2 id="related-rounds" className="text-xl font-bold tracking-tight text-ink">
                Related funding rounds
              </h2>
              <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-card">
                {relatedRounds.map((round) => {
                  const amount = formatReportedAmount(round);
                  return (
                    <li key={round.id}>
                      <Link
                        href={startupHref(round.startup_slug)}
                        className="group/rel flex items-center gap-3 px-4 py-3"
                      >
                        <CompanyMark name={round.startup_name} logoUrl={round.logo_url} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-ink group-hover/rel:text-primary">
                            {round.startup_name}
                          </span>
                          <span className="block truncate text-xs text-muted">
                            {round.funding_stage} · {formatDay(round.announcement_date)}
                          </span>
                        </span>
                        <Numeric
                          className={cn(
                            "shrink-0 text-sm font-bold",
                            amount ? "text-ink" : "text-muted-soft",
                          )}
                        >
                          {amount ?? UNDISCLOSED_LABEL}
                        </Numeric>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>

            {similarStartups.length > 0 && (
              <div className="flex flex-col gap-4">
                <h2 className="text-xl font-bold tracking-tight text-ink">Similar startups</h2>
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
                  {similarStartups.map((startup) => (
                    <li key={startup.slug}>
                      <Link
                        href={startupHref(startup.slug)}
                        className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 transition-colors hover:border-primary/30"
                      >
                        <CompanyMark name={startup.name} logoUrl={startup.logo} />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-ink">
                            {startup.name}
                          </span>
                          <span className="block truncate text-xs text-muted">{startup.meta}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

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

/**
 * The latest round as a facts panel: every field the brief lists, each with
 * its provenance — the summary says how it was written, the record says
 * whether a person checked it, and the source is one click away.
 */
function KeyFacts({ round }: { round: FundingRoundRow }) {
  const amount = formatReportedAmount(round);
  const converted = amount ? convertedInrEstimate(round) : null;
  const others = round.investors.filter(
    (name) => name.toLowerCase() !== (round.lead_investor ?? "").toLowerCase(),
  );
  const coverage = round.coverage ?? [];
  const summaryLabel =
    round.extraction_method === "ai"
      ? "AI-generated summary"
      : round.extraction_method === "rules"
        ? "Auto-generated summary"
        : "Summary";

  return (
    <section
      aria-labelledby="latest-round"
      className="flex flex-col gap-5 rounded-3xl border border-border bg-card p-5 sm:p-7"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="latest-round" className="text-xs font-semibold tracking-wide text-primary uppercase">
              Latest round
            </h2>
            <TrustLabel round={round} />
          </div>
          <p className="text-base leading-snug font-semibold text-ink sm:text-lg">{round.headline}</p>
        </div>
        <div className="shrink-0 sm:text-right">
          {amount ? (
            <Numeric className="block text-3xl leading-none font-bold text-ink sm:text-4xl">
              {amount}
            </Numeric>
          ) : (
            <span className="block text-xl font-semibold text-muted-soft">{UNDISCLOSED_LABEL}</span>
          )}
          <span className="mt-1 block text-[11px] text-muted">
            {converted ? `≈ ${converted} converted · ` : ""}
            {round.amount ? `reported as “${round.amount.trim()}”` : "as reported by source"}
          </span>
        </div>
      </div>

      {round.summary && (
        <div className="rounded-xl bg-secondary-bg/60 p-4">
          <p className="text-[11px] font-semibold text-muted">{summaryLabel}</p>
          <p className="mt-1 text-sm leading-relaxed text-body">{round.summary}</p>
        </div>
      )}

      <dl className="grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
        <Fact label="Stage">{round.funding_stage}</Fact>
        <Fact label="Announced">{formatDay(round.announcement_date) ?? "—"}</Fact>
        <Fact label="Industry">
          {round.industry ?? "—"}
          {round.sub_industry && round.sub_industry !== round.industry && ` · ${round.sub_industry}`}
        </Fact>
        <Fact label="Location">{round.location ?? (round.city ? cityLabel(round.city) : "—")}</Fact>
        <Fact label="Lead investor">
          {round.lead_investor ? (
            <Link href={investorHref(round.lead_investor)} className="font-semibold hover:text-primary">
              {round.lead_investor}
            </Link>
          ) : (
            <span className="text-muted">Not disclosed</span>
          )}
        </Fact>
        <Fact label="Participating investors">
          {others.length > 0 ? (
            others.map((name, index) => (
              <span key={name}>
                {index > 0 && ", "}
                <Link href={investorHref(name)} className="hover:text-primary">
                  {name}
                </Link>
              </span>
            ))
          ) : (
            <span className="text-muted">None named</span>
          )}
        </Fact>
      </dl>

      <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted">
          Source: <span className="font-medium text-body">{round.source_name}</span>
          {round.source_published_at && ` · published ${formatDay(round.source_published_at)}`}
          {coverage.length > 0 && (
            <>
              {" · also reported by "}
              {coverage.map((item, index) => (
                <span key={item.url}>
                  {index > 0 && ", "}
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="font-medium text-body underline-offset-2 hover:text-primary hover:underline"
                  >
                    {item.source_name}
                  </a>
                </span>
              ))}
            </>
          )}
        </p>
        <a
          href={round.source_url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="btn-gradient inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl px-5 text-sm font-semibold"
        >
          View Original Source
          <ArrowUpRight className="size-4" aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border/70 pb-3">
      <dt className="text-[11px] font-medium text-muted">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}

function Stat({
  label,
  value,
  detail,
  emphasis = false,
}: {
  label: string;
  value: string;
  detail: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-2xl border border-border bg-card p-4">
      <span className="text-xs font-medium text-muted">{label}</span>
      <Numeric
        className={cn("truncate text-xl font-bold sm:text-2xl", emphasis ? "text-primary" : "text-ink")}
      >
        {value}
      </Numeric>
      <span className="text-[11px] leading-snug text-muted-soft">{detail}</span>
    </div>
  );
}

function InvestorGroup({ title, names }: { title: string; names: string[] }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <div className="flex flex-wrap gap-1.5">
        {names.map((name) => (
          <Link
            key={name}
            href={investorHref(name)}
            className="inline-flex items-center rounded-full border border-border bg-card px-2.5 py-1 text-xs text-body transition-colors hover:border-primary/30 hover:text-primary"
          >
            {name}
          </Link>
        ))}
      </div>
    </div>
  );
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

/** Investors most often named in the related rounds, excluding this company's own. */
function topInvestors(rounds: FundingRoundRow[], exclude: string[]): string[] {
  const skip = new Set(exclude.map((name) => name.toLowerCase()));
  const counts = new Map<string, { name: string; n: number }>();

  for (const round of rounds) {
    for (const investor of round.investors) {
      const key = investor.toLowerCase();
      if (skip.has(key)) continue;
      const entry = counts.get(key) ?? { name: investor, n: 0 };
      entry.n += 1;
      counts.set(key, entry);
    }
  }
  return [...counts.values()].sort((a, b) => b.n - a.n).map((entry) => entry.name);
}

function distinctStartups(
  rounds: FundingRoundRow[],
): { slug: string; name: string; logo: string | null; meta: string }[] {
  const seen = new Set<string>();
  const out: { slug: string; name: string; logo: string | null; meta: string }[] = [];

  for (const round of rounds) {
    if (seen.has(round.startup_slug)) continue;
    seen.add(round.startup_slug);
    const where = round.city ? cityLabel(round.city) : round.location;
    out.push({
      slug: round.startup_slug,
      name: round.startup_name,
      logo: round.logo_url,
      meta: [round.funding_stage, where].filter(Boolean).join(" · "),
    });
  }
  return out;
}
