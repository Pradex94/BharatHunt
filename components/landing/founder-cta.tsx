import Link from "next/link";
import { Rocket } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { FadeIn } from "@/components/ui/motion";
import { SECTION_SHELL } from "@/components/landing/section-header";
import { FOUNDER_BENEFITS, LAUNCH_STEPS } from "@/components/landing/data";

/**
 * The founder path — "Built something great?" — with the launch in five steps.
 *
 * The second of the homepage's two journeys, and deliberately placed after the
 * discovery sections: a visitor sees what a launch here looks like (the board,
 * Hunt of the Day, the categories) before being asked to make one.
 *
 * Copy promises only mechanics the product has (components/landing/data.ts).
 */
export function FounderCta() {
  return (
    <section id="launch" className={`${SECTION_SHELL} scroll-mt-20 py-12 md:py-16`}>
      <FadeIn className="overflow-hidden rounded-[32px] bg-secondary-bg">
        <div className="grid grid-cols-1 gap-10 p-6 sm:p-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14 lg:p-14">
          <div className="flex flex-col gap-6">
            <span className="text-xs font-semibold tracking-wider text-primary uppercase">
              For founders
            </span>
            <h2 className="max-w-[16ch] text-3xl font-bold tracking-tight text-ink sm:text-4xl">
              Built something great?
            </h2>
            <p className="max-w-lg text-lg leading-relaxed text-body">
              Put your product in front of founders, builders, investors and early adopters.
              Launching is free, and every submission is reviewed by a person.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/submit" prefetch={false} className={buttonVariants({ size: "lg" })}>
                <Rocket aria-hidden="true" />
                Launch on Bharat Hunt
              </Link>
              <Link href="/faq" className={buttonVariants({ variant: "outline", size: "lg" })}>
                See How It Works
              </Link>
            </div>

            <ul className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {FOUNDER_BENEFITS.map((benefit) => (
                <li key={benefit.title} className="flex gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-card text-primary shadow-sm">
                    <benefit.icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold text-ink">{benefit.title}</span>
                    <span className="text-sm leading-snug text-body">{benefit.description}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col justify-center">
            <h3 className="text-sm font-semibold tracking-wider text-muted uppercase">
              How a launch works
            </h3>
            <ol className="mt-4 flex flex-col">
              {LAUNCH_STEPS.map((step, index) => (
                <li key={step.title} className="relative flex gap-4 pb-6 last:pb-0">
                  {/* The connecting rail, stopping at the last step. */}
                  {index < LAUNCH_STEPS.length - 1 && (
                    <span aria-hidden className="absolute top-11 bottom-1 left-[21px] w-px bg-primary/25" />
                  )}
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-border bg-card font-mono text-sm font-bold text-primary shadow-sm">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="flex flex-col gap-1 pt-1.5">
                    <span className="font-semibold text-ink">{step.title}</span>
                    <span className="text-sm leading-snug text-body">{step.description}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </FadeIn>
    </section>
  );
}
