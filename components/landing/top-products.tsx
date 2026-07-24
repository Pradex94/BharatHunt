import Link from "next/link";
import { ChevronUp, Flame } from "lucide-react";

import { cn } from "@/lib/utils";
import { Numeric } from "@/components/ui/typography";
import { FadeIn, FadeInStagger, FadeInItem } from "@/components/ui/motion";
import { TOP_PRODUCTS, ICON_TONE } from "@/components/landing/data";

export function TopProducts() {
  return (
    <section className="mx-auto w-full max-w-[1400px] px-4 py-14 sm:px-6 md:py-20 lg:px-8">
      <FadeIn className="mb-8 flex items-center justify-between gap-4">
        <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          <Flame className="size-6 text-primary" />
          Top Products Today
        </h2>
        <Link
          href="/marketplace"
          className="shrink-0 text-sm font-semibold text-primary transition-colors hover:text-primary-active"
        >
          View all launches →
        </Link>
      </FadeIn>

      <FadeInStagger className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
        {TOP_PRODUCTS.map((p) => (
          <FadeInItem key={p.name}>
            <Link
              href="/marketplace"
              className="group flex h-full flex-col gap-3 rounded-3xl border border-border bg-card p-5 shadow-sm transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-hover"
            >
              <span className="w-fit rounded-full bg-secondary-bg px-2.5 py-1 text-xs font-bold text-body">
                #{p.rank}
              </span>
              <span
                className={cn(
                  "flex size-12 items-center justify-center rounded-2xl text-white shadow-sm",
                  ICON_TONE[p.tone],
                )}
              >
                <p.icon className="size-6" />
              </span>
              <div className="flex flex-1 flex-col gap-1">
                <h3 className="font-bold tracking-tight text-ink transition-colors group-hover:text-primary">
                  {p.name}
                </h3>
                <p className="text-sm leading-snug text-body">{p.tagline}</p>
              </div>
              <div className="mt-1 flex items-center justify-between border-t border-border pt-3">
                <span className="rounded-full bg-secondary-bg px-2.5 py-0.5 text-xs font-medium text-body">
                  {p.category}
                </span>
                <span className="flex items-center gap-1 text-sm font-bold text-ink">
                  <ChevronUp className="size-4 text-primary" />
                  <Numeric>{p.upvotes}</Numeric>
                </span>
              </div>
            </Link>
          </FadeInItem>
        ))}
      </FadeInStagger>
    </section>
  );
}
