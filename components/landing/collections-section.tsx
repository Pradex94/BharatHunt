import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { FadeIn, FadeInStagger, FadeInItem } from "@/components/ui/motion";
import { COLLECTIONS, ICON_TONE } from "@/components/landing/data";

export function CollectionsSection() {
  return (
    <section className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="rounded-[32px] bg-surface-dark px-6 py-10 text-on-dark sm:px-10">
        <FadeIn className="mb-8 flex items-center justify-between gap-4">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Explore top collections
          </h2>
          <Link
            href="/collections"
            className="shrink-0 text-sm font-semibold text-primary transition-colors hover:text-primary-active"
          >
            Browse all →
          </Link>
        </FadeIn>

        <FadeInStagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {COLLECTIONS.map((c) => (
            <FadeInItem key={c.name}>
              <Link
                href="/collections"
                className="group flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-surface-dark-elevated p-4 transition-colors duration-200 hover:border-primary/40"
              >
                <span className="flex items-center gap-3">
                  <span
                    className={cn(
                      "flex size-10 items-center justify-center rounded-xl text-white",
                      ICON_TONE[c.tone],
                    )}
                  >
                    <c.icon className="size-5" />
                  </span>
                  <span className="flex flex-col">
                    <span className="text-sm font-semibold">{c.name}</span>
                    <span className="text-xs text-on-dark-soft">{c.count}</span>
                  </span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-on-dark-soft transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
              </Link>
            </FadeInItem>
          ))}
        </FadeInStagger>
      </div>
    </section>
  );
}
