import Link from "next/link";
import { BarChart3 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Numeric } from "@/components/ui/typography";
import { formatInrCompact, formatMonthKey } from "@/lib/funding/format";
import { industryHref } from "@/lib/funding/links";
import { FUNDING_STAGE_FILTERS, type FundingStage } from "@/lib/funding/constants";
import type { FundingTrends, TrendPoint } from "@/services/funding";

/**
 * "Funding Pulse" — the analytics, drawn in CSS.
 *
 * No charting library. Every chart here is a ranked bar list or a row of
 * columns, which is `width`/`height: N%` on a div. A library would add a client
 * bundle, force these into client components and give up server rendering for
 * shapes CSS already draws — and on a page that has hit Workers resource
 * limits, the cheapest chart is the one that ships no JavaScript. There is
 * nothing to lazy-load: the section streams behind its own Suspense boundary
 * and paints as HTML.
 *
 * The honesty rules, which are the actual design constraints
 * ----------------------------------------------------------
 *   1. Below `MIN_POINTS` a panel says "Not enough data yet" and draws
 *      nothing. A two-bar chart is not a trend.
 *   2. Every panel states its round count and its *disclosed* total, and the
 *      section says how non-rupee amounts were summed. Totals that silently
 *      read undisclosed rounds as zero are how dashboards lie by accident.
 *
 * City and investor rankings have their own sections below this one; they are
 * the same payload, given more room.
 *
 * Server component throughout.
 */

const MIN_POINTS = 3;

export function FundingTrendsSection({ trends }: { trends: FundingTrends }) {
  return (
    <section aria-labelledby="funding-pulse" className="flex flex-col gap-6">
      <SectionHeading
        id="funding-pulse"
        eyebrow="Analytics"
        title="Funding Pulse"
        subtitle="Where startup capital is moving."
      />

      {trends.unavailable ? (
        <EmptyPanel
          title="Analytics are temporarily unavailable"
          detail="The aggregate query did not answer. The funding feed above is unaffected — reload in a moment."
        />
      ) : trends.totalRoundCount === 0 ? (
        <EmptyPanel
          title="Not enough data yet"
          detail="Charts appear once rounds have been reviewed and published. Nothing is drawn in the meantime rather than a chart of one or two points."
        />
      ) : (
        <>
          <MonthPanel trends={trends} />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel
              title="Funding by sector"
              explanation="Which industries are raising, by number of rounds."
              series={trends.bySector}
            >
              {trends.bySector.length < MIN_POINTS ? (
                <NotEnough detail="We need rounds in at least 3 sectors to compare them." />
              ) : (
                <BarList
                  rows={trends.bySector.slice(0, 8).map((point) => ({
                    key: point.name,
                    label: point.name,
                    value: point.round_count,
                    detail: rowDetail(point),
                    href: industryHref(point.name),
                  }))}
                />
              )}
            </Panel>

            <Panel
              title="Funding by stage"
              explanation="Where in the funding ladder rounds are being raised."
              series={trends.byStage}
            >
              {trends.byStage.length < MIN_POINTS ? (
                <NotEnough detail="We need rounds at 3 or more stages to compare them." />
              ) : (
                <BarList
                  rows={sortStages(trends.byStage).map((point) => ({
                    key: point.name,
                    label: point.name,
                    value: point.round_count,
                    detail: rowDetail(point),
                    href: stageHref(point.name),
                    muted: point.name === "Undisclosed",
                  }))}
                />
              )}
            </Panel>
          </div>

          <p className="text-xs leading-relaxed text-muted-soft">
            Last 12 months. Totals cover the {trends.disclosedRoundCount} of{" "}
            {trends.totalRoundCount} rounds with a disclosed amount; undisclosed rounds are counted
            but never read as zero. Non-rupee amounts are converted to rupees at a fixed reference
            rate for these totals only — each card shows the figure exactly as its source reported
            it.
          </p>
        </>
      )}
    </section>
  );
}

/** Columns per month. Needs three months before it will call anything a trend. */
function MonthPanel({ trends }: { trends: FundingTrends }) {
  const months = trends.byMonth;
  const max = Math.max(...months.map((point) => point.round_count), 1);

  return (
    <Panel
      title="Funding by month"
      explanation="Rounds announced each month; the figure under each column is its disclosed total."
      totals={{
        rounds: months.reduce((sum, point) => sum + point.round_count, 0),
        inr: months.reduce((sum, point) => sum + Number(point.total_inr ?? 0), 0),
      }}
    >
      {months.length < MIN_POINTS ? (
        <NotEnough
          detail={`We need at least 3 months of funding data to show a meaningful trend. We have ${months.length} so far.`}
          icon
        />
      ) : (
        <ol
          className="flex h-48 items-end gap-1.5 sm:h-56 sm:gap-3"
          aria-label="Funding rounds by month"
        >
          {months.map((point) => {
            // 85% at most, leaving headroom for the count printed above the bar.
            const height = Math.max(3, Math.round((point.round_count / max) * 85));
            const label = formatMonthKey(point.month);
            return (
              <li
                key={point.month}
                className="flex h-full min-w-0 flex-1 flex-col items-center gap-1.5"
                title={`${label}: ${point.round_count} rounds, ${formatInrCompact(point.total_inr)} disclosed across ${point.disclosed_count}`}
              >
                {/* Absolute inside a flex-1 track: a percentage height then
                    resolves against the track, not an indefinite flex item. */}
                <div className="relative w-full flex-1">
                  <div
                    className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-12 rounded-t-md bg-primary/75"
                    style={{ height: `${height}%` }}
                  >
                    <Numeric className="absolute -top-5 left-1/2 -translate-x-1/2 text-[11px] font-semibold text-ink">
                      {point.round_count}
                    </Numeric>
                  </div>
                </div>
                <span className="w-full truncate text-center text-[10px] text-muted sm:text-[11px]">
                  {label.split(" ")[0]}
                </span>
                <Numeric className="hidden w-full truncate text-center text-[10px] text-muted-soft sm:block">
                  {formatInrCompact(point.total_inr)}
                </Numeric>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}

export function SectionHeading({
  id,
  eyebrow,
  title,
  subtitle,
  action,
}: {
  id: string;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-col gap-1.5">
        {eyebrow && (
          <span className="text-xs font-semibold tracking-wide text-primary uppercase">
            {eyebrow}
          </span>
        )}
        <h2 id={id} className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          {title}
        </h2>
        {subtitle && <p className="max-w-2xl text-sm leading-relaxed text-body">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function Panel({
  title,
  explanation,
  series,
  totals,
  children,
}: {
  title: string;
  explanation: string;
  /** Totals are summed from this when `totals` is not given. */
  series?: TrendPoint[];
  totals?: { rounds: number; inr: number };
  children: React.ReactNode;
}) {
  const summary = totals ?? {
    rounds: (series ?? []).reduce((sum, point) => sum + point.round_count, 0),
    inr: (series ?? []).reduce((sum, point) => sum + Number(point.total_inr ?? 0), 0),
  };

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <h3 className="text-base font-bold tracking-tight text-ink">{title}</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">{explanation}</p>
        </div>
        <div className="flex shrink-0 gap-5 text-right">
          <div>
            <Numeric className="block text-base font-bold text-ink">
              {summary.rounds.toLocaleString("en-IN")}
            </Numeric>
            <span className="text-[11px] text-muted">rounds</span>
          </div>
          <div>
            <Numeric className="block text-base font-bold text-ink">
              {formatInrCompact(summary.inr)}
            </Numeric>
            <span className="text-[11px] text-muted">disclosed</span>
          </div>
        </div>
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
  href?: string | null;
  muted?: boolean;
};

/**
 * A ranked bar list, scaled to the largest row — these compare rows to each
 * other, which is the only comparison the data supports. The number is always
 * printed, so the chart reads without measuring it.
 */
export function BarList({ rows }: { rows: BarRow[] }) {
  const max = Math.max(...rows.map((row) => row.value), 1);

  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row) => {
        const width = Math.max(2, Math.round((row.value / max) * 100));
        const content = (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <span
                className={cn(
                  "truncate text-sm font-medium",
                  row.muted ? "text-muted" : "text-ink",
                  row.href && "group-hover/bar:text-primary",
                )}
              >
                {row.label}
              </span>
              <Numeric className="shrink-0 text-xs text-muted">{row.detail}</Numeric>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-secondary-bg">
              <div
                className={cn("h-full rounded-full", row.muted ? "bg-muted-soft/50" : "bg-primary/70")}
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

function rowDetail(point: TrendPoint): string {
  const amount = Number(point.total_inr ?? 0) > 0 ? ` · ${formatInrCompact(point.total_inr)}` : "";
  return `${point.round_count}${amount}`;
}

/** The funding ladder's order, with "Undisclosed" last — it is a gap, not a stage. */
const STAGE_ORDER: string[] = [
  "Bootstrapped",
  "Pre-seed",
  "Angel",
  "Seed",
  "Series A",
  "Series B",
  "Series C",
  "Series D+",
  "Venture Debt",
  "Debt",
  "Grant",
  "Acquisition",
  "Undisclosed",
] satisfies FundingStage[];

function sortStages(points: TrendPoint[]): TrendPoint[] {
  const rank = (name: string) => {
    const index = STAGE_ORDER.indexOf(name);
    return index === -1 ? STAGE_ORDER.length : index;
  };
  return [...points].sort((a, b) => rank(a.name) - rank(b.name));
}

function stageHref(stage: string): string | null {
  const token = FUNDING_STAGE_FILTERS.find((entry) =>
    entry.stages.includes(stage as FundingStage),
  )?.value;
  return token ? `/funding?stage=${token}#funding-feed` : null;
}

function NotEnough({ detail, icon = false }: { detail: string; icon?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-secondary-bg/40 px-4 py-8 text-center">
      {icon && <BarChart3 className="size-5 text-muted-soft" aria-hidden="true" />}
      <p className="text-sm font-semibold text-body">Not enough data yet</p>
      <p className="max-w-sm text-xs leading-relaxed text-muted">{detail}</p>
    </div>
  );
}

function EmptyPanel({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center">
      <p className="text-sm font-semibold text-ink">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted">{detail}</p>
    </div>
  );
}
