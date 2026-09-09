import Link from "next/link";

import { cn } from "@/lib/utils";
import { H3, Numeric } from "@/components/ui/typography";
import { formatInrCompact, formatMonthKey } from "@/lib/funding/format";
import type { FundingTrends } from "@/services/funding";

/**
 * Five charts, drawn in CSS.
 *
 * No charting library. Every one of these is a ranked list with a bar next to
 * it, which is `width: N%` on a div — and a library would add a client bundle,
 * force these into client components, and give up server rendering for a shape
 * CSS already draws. It would also, in the usual configuration, animate them,
 * which on a page about money reads as decoration where credibility is the
 * product.
 *
 * The honesty rules, which are the actual design constraints here
 * ---------------------------------------------------------------
 *   1. Below `MIN_POINTS_FOR_CHART` data points, a panel says "Not enough data
 *      yet" and draws nothing. A two-bar bar chart is not a trend, and drawing
 *      one implies a pattern that a reader is entitled to believe.
 *   2. Any panel that adds money says how many rounds carried a figure and at
 *      what rate non-rupee amounts were converted. Totals that silently read
 *      undisclosed rounds as zero are the most common way a funding dashboard
 *      lies without anyone deciding to.
 *
 * Server component throughout.
 */

/**
 * Three, which is the smallest number of points that can show a direction
 * rather than just a difference.
 */
const MIN_POINTS_FOR_CHART = 3;

export function FundingTrendsSection({ trends }: { trends: FundingTrends }) {
  const hasAnything = trends.totalRoundCount > 0;

  const disclosureNote =
    trends.totalRoundCount > 0
      ? `Totals cover the ${trends.disclosedRoundCount} of ${trends.totalRoundCount} rounds with a disclosed amount. Non-rupee amounts are converted to rupees at a fixed reference rate for comparison; each card shows the figure exactly as its source reported it.`
      : null;

  return (
    <section aria-labelledby="funding-trends" className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <H3 id="funding-trends">Funding trends</H3>
        <p className="text-sm text-body">
          Built from the rounds published on this page — nothing modelled, nothing estimated.
        </p>
      </div>

      {!hasAnything ? (
        <NotEnoughData
          title="Not enough data yet"
          detail="Trends appear once rounds have been reviewed and published. Nothing is shown in the meantime rather than a chart of one or two points."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel title="Funding by month" subtitle="Rounds and disclosed totals">
              {trends.byMonth.length < MIN_POINTS_FOR_CHART ? (
                <NotEnoughData compact />
              ) : (
                <BarList
                  rows={trends.byMonth.map((point) => ({
                    key: point.month,
                    label: formatMonthKey(point.month),
                    value: point.round_count,
                    detail: `${point.round_count} ${point.round_count === 1 ? "round" : "rounds"} · ${formatInrCompact(point.total_inr)}`,
                  }))}
                />
              )}
            </Panel>

            <Panel title="Funding by sector" subtitle="Rounds per industry">
              {trends.bySector.length < MIN_POINTS_FOR_CHART ? (
                <NotEnoughData compact />
              ) : (
                <BarList
                  rows={trends.bySector.map((point) => ({
                    key: point.name,
                    label: point.name,
                    value: point.round_count,
                    detail: `${point.round_count} · ${formatInrCompact(point.total_inr)}`,
                    href: `/funding?industry=${encodeURIComponent(point.name.toLowerCase())}`,
                  }))}
                />
              )}
            </Panel>

            <Panel title="Funding by stage" subtitle="Where rounds are being raised">
              {trends.byStage.length < MIN_POINTS_FOR_CHART ? (
                <NotEnoughData compact />
              ) : (
                <BarList
                  rows={trends.byStage.map((point) => ({
                    key: point.name,
                    label: point.name,
                    value: point.round_count,
                    detail: `${point.round_count} · ${formatInrCompact(point.total_inr)}`,
                  }))}
                />
              )}
            </Panel>

            <Panel title="Most funded cities" subtitle="Rounds by company location">
              {trends.topCities.length < MIN_POINTS_FOR_CHART ? (
                <NotEnoughData compact />
              ) : (
                <BarList
                  rows={trends.topCities.map((point) => ({
                    key: point.name,
                    label: point.name,
                    value: point.round_count,
                    detail: `${point.round_count} · ${formatInrCompact(point.total_inr)}`,
                  }))}
                />
              )}
            </Panel>
          </div>

          <Panel title="Top investors" subtitle="By number of published rounds">
            {trends.topInvestors.length < MIN_POINTS_FOR_CHART ? (
              <NotEnoughData compact />
            ) : (
              <BarList
                rows={trends.topInvestors.map((point) => ({
                  key: point.slug,
                  label: point.name,
                  value: point.deal_count,
                  detail:
                    point.lead_count > 0
                      ? `${point.deal_count} deals · led ${point.lead_count}`
                      : `${point.deal_count} deals`,
                  href: `/funding?investor=${encodeURIComponent(point.name)}`,
                }))}
              />
            )}
          </Panel>

          {disclosureNote && (
            <p className="text-xs leading-relaxed text-muted-soft">{disclosureNote}</p>
          )}
        </>
      )}
    </section>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
      <div>
        <h4 className="text-sm font-bold tracking-tight text-ink">{title}</h4>
        <p className="text-xs text-muted">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

type BarRow = {
  key: string;
  label: string;
  value: number;
  detail: string;
  href?: string;
};

/**
 * A ranked bar list.
 *
 * Bars are scaled against the largest value in the set, not against a fixed
 * axis — these compare rows to each other, which is the only comparison the
 * data supports. The number is always printed next to the bar, so the chart is
 * readable without measuring it and works when the widths are all similar.
 */
function BarList({ rows }: { rows: BarRow[] }) {
  const max = Math.max(...rows.map((row) => row.value), 1);

  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((row) => {
        const width = Math.max(2, Math.round((row.value / max) * 100));
        const content = (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <span
                className={cn(
                  "truncate text-xs font-medium",
                  row.href ? "text-ink group-hover/bar:text-primary" : "text-ink",
                )}
              >
                {row.label}
              </span>
              <Numeric className="shrink-0 text-[11px] text-muted">{row.detail}</Numeric>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-secondary-bg">
              <div
                className="h-full rounded-full bg-primary/70 transition-[width] duration-300"
                style={{ width: `${width}%` }}
              />
            </div>
          </>
        );

        return (
          <li key={row.key}>
            {row.href ? (
              <Link href={row.href} className="group/bar block rounded-md">
                {content}
              </Link>
            ) : (
              content
            )}
          </li>
        );
      })}
    </ul>
  );
}

function NotEnoughData({
  title = "Not enough data yet",
  detail,
  compact = false,
}: {
  title?: string;
  detail?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-dashed border-border bg-secondary-bg/40 text-center",
        compact ? "px-4 py-6" : "px-6 py-10",
      )}
    >
      <p className="text-sm font-medium text-body">{title}</p>
      {detail && <p className="mx-auto mt-1 max-w-md text-xs text-muted">{detail}</p>}
      {!detail && compact && (
        <p className="mt-1 text-xs text-muted">
          A chart needs at least {MIN_POINTS_FOR_CHART} points to show a direction.
        </p>
      )}
    </div>
  );
}
