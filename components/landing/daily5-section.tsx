import Link from "next/link";
import { MapPin } from "lucide-react";

import { ProductLogo } from "@/components/products/product-logo";
import { SECTION_SHELL, SectionHeader } from "@/components/landing/section-header";
import { formatDailyDate } from "@/components/daily5/daily5-view";
import { indiaStateName } from "@/lib/india-states";
import { istDayKey } from "@/lib/format-date";
import type { Daily5Day } from "@/services/daily-agent";

/**
 * The latest BharatHunt Daily 5 on the homepage — a strip, not a board.
 *
 * Curated picks are kept out of the homepage *rankings* (Today's Hunt, the
 * daily board) so a maker's launch is never displaced by one; this section
 * sits beside them as its own, clearly labelled list. It names the day it
 * belongs to and only says "today" when it is today's, and it does not render
 * at all before the first list exists.
 */
export function Daily5Section({ day, now }: { day: Daily5Day | null; now: Date }) {
  if (!day || day.products.length === 0) return null;
  const isToday = day.date === istDayKey(now);
  const count = day.products.length;

  return (
    <section aria-labelledby="daily5-home" className={`${SECTION_SHELL} py-8 md:py-12`}>
      <SectionHeader
        eyebrow="BharatHunt Daily 5"
        title={<span id="daily5-home">{isToday ? "Today’s Indian discoveries" : "The latest Indian discoveries"}</span>}
        subtitle={`${count} Indian ${count === 1 ? "product" : "products"} discovered and verified by BharatHunt${isToday ? " today" : ""}.`}
        note={isToday ? null : <>List of {formatDailyDate(day.date)}</>}
        action={{ label: "See the full list", href: isToday ? "/daily-5" : `/daily-5/${day.date}` }}
      />
      <ol className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {day.products.slice(0, 5).map((product) => {
          const place = product.city ?? indiaStateName(product.launch_state);
          return (
            <li key={product.id}>
              <Link
                href={`/products/${product.slug}`}
                className="flex h-full gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/40 lg:flex-col"
              >
                <ProductLogo src={product.hero_image_url} name={product.name} size="sm" loading="lazy" />
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="truncate text-sm font-semibold text-ink">{product.name}</span>
                  <span className="line-clamp-2 text-xs text-body">{product.tagline}</span>
                  <span className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-0.5 pt-1 text-[11px] text-muted">
                    <span>{product.category}</span>
                    {place && (
                      <span className="inline-flex min-w-0 items-center gap-0.5">
                        <MapPin className="size-3 shrink-0" aria-hidden="true" />
                        <span className="truncate">{place}</span>
                      </span>
                    )}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
