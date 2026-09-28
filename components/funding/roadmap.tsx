import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";

import { Numeric } from "@/components/ui/typography";
import { SectionHeading } from "@/components/funding/trends";
import { FUNDING_ROADMAP } from "@/lib/funding/guides";

/**
 * "How startups raise funding" — the ten-step journey, compact.
 *
 * It used to be ten full paragraphs above the fold's worth of page. It now
 * sits below the data it supports, and each step is a one-word card that opens
 * to its summary: native `<details>`, so it costs no JavaScript, works with
 * find-in-page, and leaves the reader in control of how much they read.
 *
 * Numbered, not joined by a line. A drawn connector implies each step ends
 * before the next begins, and fundraising is not like that — traction keeps
 * accruing while the deck is written, diligence starts before terms are agreed.
 *
 * Steps that have a guide link to it; the rest stand on their summary rather
 * than linking to a guide about something else.
 */
export function FundingRoadmap() {
  return (
    <section aria-labelledby="funding-roadmap" className="flex flex-col gap-6">
      <SectionHeading
        id="funding-roadmap"
        eyebrow="Fundraising journey"
        title="How startups raise funding"
        subtitle="Ten steps from an idea to money in the bank, in the order they actually happen. Open a step for what it has to prove."
      />

      <ol className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {FUNDING_ROADMAP.map((item) => (
          <li key={item.step} className="min-w-0">
            <details className="group/step h-full rounded-2xl border border-border bg-card transition-colors open:border-primary/30 open:bg-secondary-bg/30 hover:border-primary/30">
              <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 p-4 marker:hidden [&::-webkit-details-marker]:hidden">
                <Numeric className="text-xs font-bold text-primary">
                  {String(item.step).padStart(2, "0")}
                </Numeric>
                <span className="min-w-0 flex-1 text-sm leading-tight font-bold text-ink">
                  {item.short}
                </span>
                <Plus
                  className="size-4 shrink-0 text-muted transition-transform group-open/step:rotate-45"
                  aria-hidden="true"
                />
              </summary>
              <div className="flex flex-col gap-3 px-4 pb-4">
                <p className="text-xs font-semibold text-ink">{item.title}</p>
                <p className="text-xs leading-relaxed text-body">{item.summary}</p>
                {item.guideSlug && (
                  <Link
                    href={`/funding/guides/${item.guideSlug}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary transition-colors hover:text-primary-active"
                  >
                    Read guide
                    <ArrowRight className="size-3.5" aria-hidden="true" />
                  </Link>
                )}
              </div>
            </details>
          </li>
        ))}
      </ol>
    </section>
  );
}
