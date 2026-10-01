import { Numeric } from "@/components/ui/typography";
import { CountUp } from "./count-up";

export type TrustStat = { value: number; label: string };

/**
 * The compact proof row under the hero.
 *
 * Every figure is a live count passed in by the page, and a figure of zero is
 * dropped rather than printed — "0 funding rounds" is not social proof, and a
 * made-up "500+" is worse than no number at all. If nothing survives, the row
 * does not render.
 */
export function TrustStrip({ stats }: { stats: TrustStat[] }) {
  const shown = stats.filter((stat) => stat.value > 0);
  if (shown.length === 0) return null;

  return (
    <section aria-label="Bharat Hunt in numbers" className="border-y border-border bg-card">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <p className="text-sm font-medium text-body">
          Discovering India&rsquo;s next generation of startups
        </p>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:flex sm:flex-wrap sm:items-center sm:gap-x-8">
          {shown.map((stat) => (
            <div key={stat.label} className="flex min-w-0 flex-col-reverse">
              <dt className="text-xs text-muted">{stat.label}</dt>
              <dd className="text-xl font-bold text-ink sm:text-2xl">
                <Numeric>
                  <CountUp value={stat.value} />
                </Numeric>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/** Same height as the filled strip, for the route's loading state. */
export function TrustStripSkeleton() {
  return (
    <div className="border-y border-border bg-card">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <div className="h-4 w-72 animate-pulse rounded bg-secondary-bg" />
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:flex sm:gap-x-8">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="flex flex-col gap-1.5">
              <div className="h-7 w-14 animate-pulse rounded bg-secondary-bg" />
              <div className="h-3 w-20 animate-pulse rounded bg-secondary-bg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
