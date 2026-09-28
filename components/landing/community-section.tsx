import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { Numeric } from "@/components/ui/typography";
import { FadeIn } from "@/components/ui/motion";
import { IndiaMap } from "@/components/landing/india-map";
import { SECTION_SHELL, SectionHeader } from "@/components/landing/section-header";
import { COLLECTIONS, MIN_PRODUCTS_TO_INDEX } from "@/lib/collections";
import { indiaStateName } from "@/lib/india-states";

/** State code → its "Made in X" collection slug. Built once from the static list. */
const STATE_COLLECTION = new Map(
  COLLECTIONS.filter((collection) => collection.filter.launchState).map((collection) => [
    collection.filter.launchState as string,
    collection.slug,
  ]),
);

export type CommunitySectionProps = {
  /** Published products per ISO 3166-2:IN state code. */
  launchCounts?: Record<string, number>;
};

/**
 * "Where are India's founders building?"
 *
 * The launch map, kept — it is one SVG path and a tiled pattern, no library and
 * no JavaScript (components/landing/india-map.tsx) — but now beside a ranked
 * list that does the work: each state is a link into its "Made in …" collection,
 * so the section filters products instead of only illustrating them.
 *
 * Locations are what makers confirmed at launch, never inferred from an IP, and
 * the section does not render until at least one launch carries one. A state is
 * a link only once its collection clears the index threshold — a link from the
 * homepage into a `noindex` page spends authority on a dead end.
 */
export function CommunitySection({ launchCounts }: CommunitySectionProps) {
  const states = Object.entries(launchCounts ?? {})
    .filter(([, count]) => count > 0)
    .map(([code, count]) => ({ code, count, name: indiaStateName(code) ?? code }))
    .sort((a, b) => b.count - a.count);

  if (states.length === 0) return null;

  const mappedProducts = states.reduce((sum, state) => sum + state.count, 0);
  const top = states.slice(0, 7);
  const max = top[0].count;

  return (
    <section className={`${SECTION_SHELL} py-6 md:py-10`}>
      <div className="relative overflow-hidden rounded-[32px] bg-surface-dark text-on-dark">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_120%_at_100%_0%,rgba(255,107,26,0.28),transparent_55%)]"
        />

        <div className="relative grid grid-cols-1 items-center gap-8 p-6 sm:p-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:gap-12 lg:p-14">
          <FadeIn className="flex min-w-0 flex-col gap-6">
            <SectionHeader
              tone="dark"
              eyebrow="Launch map"
              title="Where are India’s founders building?"
              subtitle={
                <>
                  <Numeric className="font-semibold text-on-dark">{mappedProducts}</Numeric>{" "}
                  {mappedProducts === 1 ? "launch" : "launches"} from{" "}
                  <Numeric className="font-semibold text-on-dark">{states.length}</Numeric>{" "}
                  {states.length === 1 ? "state" : "states and territories"}, as confirmed by
                  their makers.
                </>
              }
            />

            <ol className="flex flex-col gap-2.5">
              {top.map((state) => {
                const slug = STATE_COLLECTION.get(state.code);
                const linked = slug && state.count >= MIN_PRODUCTS_TO_INDEX;
                const row = (
                  <>
                    <span className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex items-center gap-1 font-medium text-on-dark">
                        {state.name}
                        {linked && (
                          <ArrowUpRight
                            className="size-3.5 text-primary opacity-0 transition-opacity group-hover:opacity-100"
                            aria-hidden="true"
                          />
                        )}
                      </span>
                      <span className="text-on-dark-soft">
                        <Numeric>{state.count}</Numeric> {state.count === 1 ? "launch" : "launches"}
                      </span>
                    </span>
                    <span aria-hidden className="block h-1.5 overflow-hidden rounded-full bg-white/10">
                      <span
                        className="block h-full rounded-full bg-[linear-gradient(90deg,#ff6b1a,#ff8a3d)]"
                        style={{ width: `${Math.max(6, (state.count / max) * 100)}%` }}
                      />
                    </span>
                  </>
                );
                return (
                  <li key={state.code}>
                    {linked ? (
                      <Link
                        href={`/collections/${slug}`}
                        className="group flex flex-col gap-1.5 rounded-lg transition-colors"
                      >
                        {row}
                      </Link>
                    ) : (
                      <div className="flex flex-col gap-1.5">{row}</div>
                    )}
                  </li>
                );
              })}
            </ol>
          </FadeIn>

          {/* India, drawn from real boundary data (components/landing/india-map.tsx). */}
          <FadeIn delay={0.1} className="relative mx-auto hidden w-full max-w-[360px] sm:block">
            <div
              aria-hidden
              className="absolute inset-[6%] rounded-full bg-[radial-gradient(circle,rgba(255,107,26,0.22),transparent_65%)] blur-2xl"
            />
            <IndiaMap
              id="community-india"
              className="relative text-primary drop-shadow-[0_0_28px_rgba(255,107,26,0.35)]"
              launchCounts={launchCounts}
            />
          </FadeIn>
        </div>
      </div>
    </section>
  );
}
