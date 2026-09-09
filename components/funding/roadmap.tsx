import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Numeric } from "@/components/ui/typography";
import { FUNDING_ROADMAP } from "@/lib/funding/guides";

/**
 * "How can a startup get funding?" — the ten-step roadmap.
 *
 * A numbered grid rather than a connected timeline, deliberately. A drawn line
 * between steps implies each one finishes before the next begins, and
 * fundraising is not like that: traction keeps accruing while the deck is being
 * written, and diligence starts before terms are agreed. Numbers give the
 * ordering without the false promise of a pipeline.
 *
 * Steps that have a guide link to it; the rest stand on their own summary.
 * Every card is the same height regardless, so a linked step does not look more
 * important than an unlinked one.
 *
 * Server component.
 */
export function FundingRoadmap() {
  return (
    <section aria-labelledby="funding-roadmap" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 id="funding-roadmap" className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          How can a startup get funding?
        </h2>
        <p className="max-w-2xl text-base leading-relaxed text-body">
          The path from an idea to money in the bank, in the order it actually happens. Each step
          has one thing to prove before the next one is worth starting.
        </p>
      </div>

      <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FUNDING_ROADMAP.map((item) => (
          <li key={item.step}>
            <div className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-5 transition-[border-color,box-shadow] duration-200 hover:border-primary/30 hover:shadow-soft">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
                >
                  <Numeric className="text-xs font-bold">
                    {String(item.step).padStart(2, "0")}
                  </Numeric>
                </span>
                <h3 className="text-sm font-bold tracking-tight text-ink">{item.title}</h3>
              </div>

              <p className="flex-1 text-sm leading-relaxed text-body">{item.summary}</p>

              {item.guideSlug && (
                <Link
                  href={`/funding/guides/${item.guideSlug}`}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-primary transition-colors hover:text-primary-active"
                >
                  Read the guide
                  <ArrowRight className="size-3.5" aria-hidden="true" />
                </Link>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
