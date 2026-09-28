import Link from "next/link";

import { cn } from "@/lib/utils";
import { Numeric } from "@/components/ui/typography";
import { formatInrCompact } from "@/lib/funding/format";
import { cityHref, cityLabel, investorHref } from "@/lib/funding/links";
import type { FundingTrends } from "@/services/funding";

/**
 * Six headline figures under the hero, all read out of the one
 * `funding_trends` payload the charts below also use — no query of their own.
 *
 * Nothing is hardcoded and nothing is a placeholder. The window is the trends
 * window (twelve months), and the strip says so once rather than on every
 * tile.
 *
 * The money figure carries its denominator ("disclosed in 41 of 63 rounds").
 * Without it a reader assumes the total covers every round, and undisclosed
 * rounds silently count as zero — the most common way a funding dashboard
 * misleads without anyone deciding to.
 *
 * Server component.
 */
export function FundingPulseKpis({ trends }: { trends: FundingTrends }) {
  if (trends.unavailable) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card px-5 py-6 text-center text-sm text-muted">
        Headline figures are temporarily unavailable. The funding feed below is unaffected.
      </div>
    );
  }

  if (trends.totalRoundCount === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card px-5 py-6 text-center">
        <p className="text-sm font-semibold text-ink">No funding rounds tracked yet</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted">
          These figures fill in as sources are checked and rounds are reviewed. Nothing is shown in
          the meantime — no sample numbers.
        </p>
      </div>
    );
  }

  const totalInr = trends.byMonth.reduce((sum, point) => sum + Number(point.total_inr ?? 0), 0);
  const count = (series: { name: string; round_count: number }[], name: string) =>
    Number(series.find((point) => point.name === name)?.round_count ?? 0);

  const aiRounds = count(trends.bySector, "AI");
  const seedRounds = count(trends.byStage, "Seed");
  const preSeedRounds = count(trends.byStage, "Pre-seed");

  // "Most active city" means a city: the roll-up buckets are not places.
  const topCity = trends.topCities.find(
    (point) => point.name !== "Other India" && point.name !== "Global",
  );
  const topInvestor = trends.topInvestors[0];

  const share = (part: number) =>
    trends.totalRoundCount > 0 ? Math.round((part / trends.totalRoundCount) * 100) : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 xl:grid-cols-6">
        <Kpi
          label="Tracked funding"
          value={formatInrCompact(totalInr)}
          detail={`disclosed in ${trends.disclosedRoundCount} of ${trends.totalRoundCount} rounds`}
          emphasis
        />
        <Kpi
          label="Funding rounds"
          value={trends.totalRoundCount.toLocaleString("en-IN")}
          detail="published after review"
        />
        <Kpi
          label="AI rounds"
          value={aiRounds.toLocaleString("en-IN")}
          detail={aiRounds > 0 ? `${share(aiRounds)}% of all rounds` : "none yet"}
          href={aiRounds > 0 ? "/funding?industry=ai#funding-feed" : undefined}
        />
        <Kpi
          label="Seed rounds"
          value={seedRounds.toLocaleString("en-IN")}
          detail={preSeedRounds > 0 ? `plus ${preSeedRounds} pre-seed` : `${share(seedRounds)}% of all rounds`}
          href={seedRounds > 0 ? "/funding?stage=seed#funding-feed" : undefined}
        />
        <Kpi
          label="Most active city"
          value={topCity ? cityLabel(topCity.name) : "—"}
          detail={
            topCity
              ? `${topCity.round_count} rounds · ${formatInrCompact(topCity.total_inr)}`
              : "not enough data yet"
          }
          href={topCity ? (cityHref(topCity.name) ?? undefined) : undefined}
          text
        />
        <Kpi
          label="Most active investor"
          value={topInvestor ? topInvestor.name : "—"}
          detail={
            topInvestor
              ? `${topInvestor.deal_count} deals${topInvestor.lead_count > 0 ? ` · led ${topInvestor.lead_count}` : ""}`
              : "not enough data yet"
          }
          href={topInvestor ? investorHref(topInvestor.name) : undefined}
          text
        />
      </div>
      <p className="text-[11px] text-muted-soft">
        Last 12 months · amounts as reported, non-rupee rounds converted at a fixed reference rate
        for totals only.
      </p>
    </div>
  );
}

function Kpi({
  label,
  value,
  detail,
  href,
  emphasis = false,
  text = false,
}: {
  label: string;
  value: string;
  detail: string;
  href?: string;
  /** The one tile with an orange figure — the money. */
  emphasis?: boolean;
  /** A name rather than a number: sans, smaller, truncated. */
  text?: boolean;
}) {
  const body = (
    <>
      <span className="text-xs font-medium text-muted">{label}</span>
      <span className="min-w-0">
        {text ? (
          <span className="block truncate text-lg leading-tight font-bold tracking-tight text-ink sm:text-xl">
            {value}
          </span>
        ) : (
          <Numeric
            className={cn(
              "block text-2xl leading-none font-bold sm:text-[28px]",
              emphasis ? "text-primary" : "text-ink",
            )}
          >
            {value}
          </Numeric>
        )}
      </span>
      <span className="text-[11px] leading-snug text-muted">{detail}</span>
    </>
  );

  const shell =
    "flex min-w-0 flex-col gap-1.5 rounded-2xl border border-border bg-card p-4 transition-colors";

  return href ? (
    <Link href={href} className={cn(shell, "hover:border-primary/30 hover:bg-secondary-bg/40")}>
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  );
}
