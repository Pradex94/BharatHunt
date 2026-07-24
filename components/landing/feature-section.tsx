import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { FadeIn, FadeInStagger, FadeInItem } from "@/components/ui/motion";
import { FEATURES, ICON_TONE } from "@/components/landing/data";

export function FeatureSection() {
  return (
    <section className="mx-auto w-full max-w-[1400px] px-4 py-10 sm:px-6 lg:px-8">
      <div className="rounded-[32px] bg-secondary-bg px-6 py-14 sm:px-10 md:py-16">
        <FadeIn className="mx-auto mb-12 max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            Why makers love{" "}
            <span className="relative whitespace-nowrap">
              Bharat Hunt
              <span className="absolute inset-x-0 -bottom-1 h-1 rounded-full bg-primary/70" />
            </span>
          </h2>
        </FadeIn>

        <FadeInStagger className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => (
            <FadeInItem key={feature.title}>
              <div className="group flex h-full flex-col gap-4 rounded-3xl border border-border bg-card p-6 shadow-sm transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-hover">
                <span
                  className={cn(
                    "flex size-12 items-center justify-center rounded-2xl text-white shadow-sm",
                    ICON_TONE[feature.tone],
                  )}
                >
                  <feature.icon className="size-6" />
                </span>
                <div className="flex flex-1 flex-col gap-2">
                  <h3 className="text-lg font-bold tracking-tight text-ink">{feature.title}</h3>
                  <p className="text-sm leading-relaxed text-body">{feature.description}</p>
                </div>
                <span className="flex size-8 items-center justify-center rounded-full border border-primary/30 text-primary transition-colors group-hover:bg-primary group-hover:text-white">
                  <ArrowRight className="size-4" />
                </span>
              </div>
            </FadeInItem>
          ))}
        </FadeInStagger>
      </div>
    </section>
  );
}
