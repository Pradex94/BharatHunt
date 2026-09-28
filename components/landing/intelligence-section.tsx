import Link from "next/link";
import { ArrowRight, Users2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { CompanyMark } from "@/components/funding/round-card";
import { Numeric } from "@/components/ui/typography";
import { FadeIn } from "@/components/ui/motion";
import { SECTION_SHELL, SectionHeader } from "@/components/landing/section-header";
import { FUNDING_STAGE_BADGE, type FundingStage } from "@/lib/funding/constants";
import { formatDay, formatIstDateTime, formatReportedAmount, UNDISCLOSED_LABEL } from "@/lib/funding/format";
import { cityLabel, investorHref, startupHref } from "@/lib/funding/links";
import type { FundingInvestorRow, FundingRoundRow } from "@/services/funding";

/**
 * Funding and investors, side by side — the "who is backing what" half of the
 * ecosystem, in one band so it reads as one idea rather than two more feeds.
 *
 * Both columns are the first page of the data /funding and /funding/investors
 * already read (same cached calls), so this adds no data source and no cache
 * entries of its own. Each column hides itself when its data is missing, and a
 * failed read says so instead of pretending the market went quiet.
 */
export function IntelligenceSection({
  rounds,
  roundsFailed,
  roundCount,
  lastSync,
  investors,
  investorCount,
}: {
  rounds: FundingRoundRow[];
  roundsFailed: boolean;
  roundCount: number;
  lastSync: string | null;
  investors: FundingInvestorRow[];
  investorCount: number;
}) {
  const showFunding = rounds.length > 0 || roundsFailed;
  if (!showFunding && investors.length === 0) return null;

  const synced = formatIstDateTime(lastSync);

  return (
    <section className={`${SECTION_SHELL} py-12 md:py-16`}>
      <div className={cn("grid grid-cols-1 gap-10", showFunding && investors.length > 0 && "xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] xl:gap-8")}>
        {showFunding && (
          <FadeIn className="flex min-w-0 flex-col">
            <SectionHeader
              eyebrow="Funding intelligence"
              title="Where the Money Is Moving"
              subtitle="Track startup funding, investors and emerging sectors."
              note={
                roundCount > 0 || synced ? (
                  <>
                    {roundCount > 0 && (
                      <>
                        <Numeric>{roundCount.toLocaleString("en-IN")}</Numeric> rounds tracked
                      </>
                    )}
                    {roundCount > 0 && synced && " · "}
                    {synced && <>Last synced {synced}</>}
                  </>
                ) : null
              }
              action={{ label: "Explore Funding Intelligence", href: "/funding" }}
            />

            {roundsFailed ? (
              <div className="mt-6 rounded-3xl border border-dashed border-border bg-card px-6 py-10 text-center">
                <p className="font-semibold text-ink">Something went wrong loading recent rounds.</p>
                <Link
                  href="/funding"
                  className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:text-primary-active"
                >
                  Try again on the funding page <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </div>
            ) : (
              <ul className="mt-6 flex flex-col divide-y divide-border rounded-3xl border border-border bg-card px-4 shadow-sm sm:px-5">
                {rounds.map((round) => (
                  <RoundRow key={round.id} round={round} />
                ))}
              </ul>
            )}
          </FadeIn>
        )}

        {investors.length > 0 && (
          <FadeIn delay={0.05} className="flex min-w-0 flex-col">
            <SectionHeader
              eyebrow="Investor discovery"
              title="Find Investors"
              subtitle="Discover investors backing India’s next generation of startups."
              note={
                investorCount > 0 ? (
                  <>
                    <Numeric>{investorCount.toLocaleString("en-IN")}</Numeric> investors named on
                    published rounds
                  </>
                ) : null
              }
              action={{ label: "Explore Investors", href: "/funding/investors" }}
            />

            <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {investors.map((investor) => (
                <li key={investor.id}>
                  <InvestorCard investor={investor} />
                </li>
              ))}
            </ul>

            <p className="mt-4 text-sm text-body">
              Need thesis, cheque size and contacts?{" "}
              <Link href="/investors" className="font-semibold text-primary hover:text-primary-active">
                See the Investor Directory
              </Link>
            </p>
          </FadeIn>
        )}
      </div>
    </section>
  );
}

function RoundRow({ round }: { round: FundingRoundRow }) {
  const amount = formatReportedAmount(round);
  const stageClass =
    FUNDING_STAGE_BADGE[round.funding_stage as FundingStage] ?? FUNDING_STAGE_BADGE.Undisclosed;
  const investor = round.lead_investor ?? round.investors[0] ?? null;
  const place = round.city ? cityLabel(round.city) : round.location;
  const day = formatDay(round.announcement_date);

  return (
    <li className="flex items-center gap-3 py-4">
      <CompanyMark name={round.startup_name} logoUrl={round.logo_url} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Link
          href={startupHref(round.startup_slug)}
          className="truncate font-semibold text-ink transition-colors hover:text-primary"
        >
          {round.startup_name}
        </Link>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span className={cn("rounded-full px-2 py-0.5 font-semibold", stageClass)}>
            {round.funding_stage}
          </span>
          {round.industry && <span>{round.industry}</span>}
          {place && <span className="hidden sm:inline">· {place}</span>}
        </div>
        {investor && (
          <span className="truncate text-xs text-body">
            {round.lead_investor ? "Led by " : "Backed by "}
            <Link href={investorHref(investor)} className="font-medium hover:text-primary">
              {investor}
            </Link>
          </span>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 text-right">
        {amount ? (
          <Numeric className="text-lg font-bold text-ink sm:text-xl">{amount}</Numeric>
        ) : (
          <span className="text-sm font-semibold text-muted-soft">{UNDISCLOSED_LABEL}</span>
        )}
        {day && <span className="text-[11px] text-muted">{day}</span>}
      </div>
    </li>
  );
}

function InvestorCard({ investor }: { investor: FundingInvestorRow }) {
  const recent = investor.recent_investments[0] ?? null;
  const focus = investor.industries.slice(0, 2).join(", ");
  const stages = investor.stages.slice(0, 2).join(", ");

  return (
    <Link
      href={investorHref(investor.name)}
      className="group flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-hover"
    >
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Users2 className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink group-hover:text-primary">{investor.name}</p>
          <p className="text-xs text-muted">
            <Numeric>{investor.deal_count}</Numeric> {investor.deal_count === 1 ? "deal" : "deals"}
            {investor.lead_count > 0 && (
              <>
                {" · "}
                <Numeric>{investor.lead_count}</Numeric> led
              </>
            )}
          </p>
        </div>
      </div>
      <dl className="grid grid-cols-1 gap-1 text-xs">
        {focus && (
          <div className="flex gap-1.5">
            <dt className="text-muted">Focus</dt>
            <dd className="truncate text-body">{focus}</dd>
          </div>
        )}
        {stages && (
          <div className="flex gap-1.5">
            <dt className="text-muted">Stage</dt>
            <dd className="truncate text-body">{stages}</dd>
          </div>
        )}
        {recent && (
          <div className="flex gap-1.5">
            <dt className="text-muted">Recent</dt>
            <dd className="truncate text-body">
              {recent.startup_name} · {recent.funding_stage}
            </dd>
          </div>
        )}
      </dl>
    </Link>
  );
}
