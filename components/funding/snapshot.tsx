import { CalendarDays, Layers, TrendingUp, Wallet } from "lucide-react";

import { Numeric } from "@/components/ui/typography";
import { formatInrCompact } from "@/lib/funding/format";
import type { FundingSnapshot } from "@/services/funding";

/**
 * The dashboard strip: five figures, every one of them a database query.
 *
 * Nothing here is hardcoded and nothing is a placeholder. When the dataset is
 * empty the tiles render zeros with an explanatory line underneath rather than
 * sample numbers — a funding dashboard showing invented figures is the exact
 * failure this feature is built to avoid, and it is indistinguishable from the
 * real thing at a glance.
 *
 * The month total carries its own denominator ("across 14 of 22 rounds with a
 * disclosed amount"). Without it, a reader reasonably assumes the total covers
 * every round shown, and undisclosed rounds silently count as zero. That
 * sentence is the difference between a figure and a misleading figure.
 *
 * Server component — five numbers and no interactivity.
 */
export function FundingSnapshotStrip({ snapshot }: { snapshot: FundingSnapshot | null }) {
  if (!snapshot || snapshot.totalRounds === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
        <p className="text-sm font-medium text-ink">No funding rounds tracked yet</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted">
          {snapshot
            ? "The ingestion has not published any rounds yet. These figures fill in as sources are polled and rounds are reviewed."
            : "The funding snapshot is temporarily unavailable. The feed below is unaffected."}
        </p>
      </div>
    );
  }

  const tiles = [
    {
      icon: CalendarDays,
      label: "Announced today",
      value: snapshot.announcedToday.toLocaleString("en-IN"),
      detail: snapshot.announcedToday === 0 ? "Nothing published yet today" : "rounds",
    },
    {
      icon: TrendingUp,
      label: "This week",
      value: snapshot.roundsThisWeek.toLocaleString("en-IN"),
      detail: "rounds in the last 7 days",
    },
    {
      icon: Wallet,
      label: "Tracked this month",
      value: formatInrCompact(snapshot.totalThisMonthInr),
      detail:
        snapshot.roundsThisMonth > 0
          ? `across ${snapshot.disclosedThisMonth} of ${snapshot.roundsThisMonth} rounds with a disclosed amount`
          : "no rounds in the last 30 days",
    },
    {
      icon: Layers,
      label: "Most active sector",
      value: snapshot.topIndustry ?? "—",
      detail: snapshot.topIndustry
        ? `${snapshot.topIndustryCount} round${snapshot.topIndustryCount === 1 ? "" : "s"} this month`
        : "not enough data yet",
    },
    {
      icon: Layers,
      label: "Most active stage",
      value: snapshot.topStage ?? "—",
      detail: snapshot.topStage
        ? `${snapshot.topStageCount} round${snapshot.topStageCount === 1 ? "" : "s"} this month`
        : "not enough data yet",
    },
  ];

  return (
    /* Two up at 320px, three from `sm`, all five from `lg`. Five across on a
       phone would leave about 55px a tile, which a four-digit figure does not
       fit — the same constraint the admin stats row ran into. */
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4"
        >
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
            <tile.icon className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
            {tile.label}
          </span>
          <Numeric className="text-xl leading-tight font-bold text-ink sm:text-2xl">
            {tile.value}
          </Numeric>
          <span className="text-[11px] leading-snug text-muted-soft">{tile.detail}</span>
        </div>
      ))}
    </div>
  );
}
