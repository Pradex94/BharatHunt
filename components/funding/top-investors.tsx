import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Numeric } from "@/components/ui/typography";
import { SectionHeading } from "@/components/funding/trends";
import { formatDay } from "@/lib/funding/format";
import { investorHref, startupHref } from "@/lib/funding/links";
import type { FundingInvestorRow } from "@/services/funding";

/**
 * "Most Active Investors" — the top of the investor directory.
 *
 * Reads the first page of `funding_investor_directory`, the same cached call
 * /funding/investors makes, so the two share one cache entry. Every figure is
 * derived from published rounds; nothing editorial (thesis, cheque size,
 * contact) is shown, for the reason /funding/investors gives.
 *
 * A table on desktop, stacked rows on a phone — the columns are what make it
 * scannable at width, and they are what would force a sideways scroll at 375px.
 *
 * Investor names link through `investorHref`, the single place that will
 * change when per-investor profile pages exist.
 */
export function TopInvestorsSection({
  investors,
  limit = 8,
}: {
  investors: FundingInvestorRow[];
  limit?: number;
}) {
  const rows = investors.slice(0, limit);

  return (
    <section aria-labelledby="top-investors" className="flex flex-col gap-6">
      <SectionHeading
        id="top-investors"
        eyebrow="Investors"
        title="Most Active Investors"
        subtitle="Ranked by published deals. Lead deals are rounds the reporting named them as leading."
        action={
          <Link
            href="/funding/investors"
            className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:text-primary-active"
          >
            All investors
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        }
      />

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-10 text-center">
          <p className="text-sm font-semibold text-ink">No investor activity yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">
            This ranking is built from published rounds that name their investors, so it starts
            empty rather than seeded.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div
            aria-hidden="true"
            className="hidden grid-cols-[2rem_minmax(0,1.3fr)_4.5rem_4.5rem_minmax(0,1.2fr)_minmax(0,1.3fr)] gap-4 border-b border-border bg-secondary-bg/50 px-5 py-2.5 text-[11px] font-semibold tracking-wide text-muted uppercase md:grid"
          >
            <span>#</span>
            <span>Investor</span>
            <span className="text-right">Deals</span>
            <span className="text-right">Led</span>
            <span>Sectors</span>
            <span>Latest investment</span>
          </div>

          <ol className="divide-y divide-border">
            {rows.map((investor, index) => {
              const latest = investor.recent_investments[0];
              return (
                <li
                  key={investor.id}
                  className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1.5 px-4 py-4 md:grid-cols-[2rem_minmax(0,1.3fr)_4.5rem_4.5rem_minmax(0,1.2fr)_minmax(0,1.3fr)] md:items-center md:gap-4 md:px-5"
                >
                  <Numeric className="pt-0.5 text-xs font-semibold text-muted-soft md:pt-0">
                    {String(index + 1).padStart(2, "0")}
                  </Numeric>

                  <Link
                    href={investorHref(investor.name)}
                    className="min-w-0 truncate text-sm font-bold text-ink transition-colors hover:text-primary"
                  >
                    {investor.name}
                  </Link>

                  {/* Phone: deals and leads share one right-aligned cell. */}
                  <span className="text-right text-xs text-muted md:hidden">
                    <Numeric className="font-bold text-ink">{investor.deal_count}</Numeric>{" "}
                    {investor.deal_count === 1 ? "deal" : "deals"}
                    {investor.lead_count > 0 && (
                      <>
                        {" · "}
                        <Numeric className="font-semibold text-ink">{investor.lead_count}</Numeric>{" "}
                        led
                      </>
                    )}
                  </span>

                  <Numeric className="hidden text-right text-sm font-bold text-ink md:block">
                    {investor.deal_count}
                  </Numeric>
                  <Numeric className="hidden text-right text-sm text-body md:block">
                    {investor.lead_count > 0 ? investor.lead_count : "—"}
                  </Numeric>

                  <span className="col-start-2 col-end-4 truncate text-xs text-body md:col-auto">
                    {investor.industries.length > 0
                      ? investor.industries.slice(0, 3).join(" · ")
                      : "—"}
                  </span>

                  <span className="col-start-2 col-end-4 min-w-0 truncate text-xs text-muted md:col-auto">
                    {latest ? (
                      <>
                        <Link
                          href={startupHref(latest.startup_slug)}
                          className="font-medium text-ink transition-colors hover:text-primary"
                        >
                          {latest.startup_name}
                        </Link>
                        {" · "}
                        {latest.funding_stage !== "Undisclosed" && `${latest.funding_stage} · `}
                        {formatDay(latest.announcement_date)}
                      </>
                    ) : (
                      "—"
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
}
