import { cn } from "@/lib/utils";
import { FadeIn, FadeInStagger, FadeInItem } from "@/components/ui/motion";
import { FEATURES, ICON_TONE } from "@/components/landing/data";

export function FeatureSection() {
  return (
    <section className="mx-auto w-full max-w-[1400px] px-4 py-10 sm:px-6 lg:px-8">
      <div className="rounded-[32px] bg-secondary-bg px-6 py-14 sm:px-10 md:py-16">
        <FadeIn className="mx-auto mb-12 max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            What you get when you{" "}
            <span className="relative whitespace-nowrap">
              launch
              <span
                aria-hidden
                className="absolute inset-x-0 -bottom-1 h-1 rounded-full bg-primary/70"
              />
            </span>
          </h2>
        </FadeIn>

        <FadeInStagger className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => (
            <FadeInItem key={feature.title}>
              {/* Not a link, so it carries no arrow affordance — an arrow on a
                  dead card is a promise the UI can't keep. */}
              <div className="flex h-full flex-col gap-4 rounded-3xl border border-border bg-card p-6 shadow-sm">
                <span
                  className={cn(
                    "flex size-12 items-center justify-center rounded-2xl text-white shadow-sm",
                    ICON_TONE[feature.tone],
                  )}
                >
                  <feature.icon className="size-6" aria-hidden="true" />
                </span>
                <div className="flex flex-1 flex-col gap-2">
                  <h3 className="text-lg font-bold tracking-tight text-ink">{feature.title}</h3>
                  <p className="text-sm leading-relaxed text-body">{feature.description}</p>
                </div>
              </div>
            </FadeInItem>
          ))}
        </FadeInStagger>
      </div>
    </section>
  );
}
