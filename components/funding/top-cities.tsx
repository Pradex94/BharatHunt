import Link from "next/link";

import { cn } from "@/lib/utils";
import { Numeric } from "@/components/ui/typography";
import { SectionHeading } from "@/components/funding/trends";
import { formatInrCompact } from "@/lib/funding/format";
import { cityHref, cityLabel } from "@/lib/funding/links";
import type { FundingTrends } from "@/services/funding";

/**
 * "Most Funded Cities" — a ranking, from the `top_cities` series of the same
 * trends payload the KPI strip and charts use.
 *
 * Ranked by rounds (what the series is ordered by), with the disclosed total
 * beside each. Bars are share of all rounds in the window, so they read as
 * proportions rather than as a comparison to whichever city happens to lead.
 * Each row filters the feed to that city.
 */
export function TopCitiesSection({ trends }: { trends: FundingTrends }) {
  const cities = trends.topCities;
  const total = Math.max(trends.totalRoundCount, 1);

  return (
    <section aria-labelledby="top-cities" className="flex flex-col gap-6">
      <SectionHeading
        id="top-cities"
        eyebrow="Geography"
        title="Most Funded Cities"
        subtitle="Where the companies raising are based, by number of rounds in the last 12 months."
      />

      {trends.unavailable || cities.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-10 text-center">
          <p className="text-sm font-semibold text-ink">
            {trends.unavailable ? "City data is temporarily unavailable" : "Not enough data yet"}
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">
            {trends.unavailable
              ? "Reload in a moment — the feed above is unaffected."
              : "Cities appear once published rounds name where the company is based."}
          </p>
        </div>
      ) : (
        <ol className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {cities.map((city, index) => {
            const share = Math.round((city.round_count / total) * 100);
            const href = cityHref(city.name);
            const body = (
              <>
                <Numeric
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold",
                    index === 0 ? "bg-primary text-white" : "bg-secondary-bg text-primary",
                  )}
                >
                  {index + 1}
                </Numeric>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm font-bold text-ink group-hover/city:text-primary">
                      {cityLabel(city.name)}
                    </span>
                    {Number(city.total_inr) > 0 ? (
                      <Numeric className="shrink-0 text-sm font-bold text-ink">
                        {formatInrCompact(city.total_inr)}
                      </Numeric>
                    ) : (
                      <span className="shrink-0 text-xs font-medium text-muted-soft">
                        Undisclosed
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary-bg">
                      <div
                        className="h-full rounded-full bg-primary/70"
                        style={{ width: `${Math.max(2, share)}%` }}
                      />
                    </div>
                    <span className="shrink-0 text-[11px] text-muted">
                      {city.round_count} {city.round_count === 1 ? "round" : "rounds"} · {share}%
                    </span>
                  </div>
                </div>
              </>
            );

            const shell =
              "flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition-colors";
            return (
              <li key={city.name}>
                {href ? (
                  <Link
                    href={href}
                    className={cn(shell, "group/city hover:border-primary/30 hover:bg-secondary-bg/40")}
                  >
                    {body}
                  </Link>
                ) : (
                  <div className={shell}>{body}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
