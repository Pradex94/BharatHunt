/* Design system: design.md (Bharat Hunt — orange) · /promote
 *
 * The placements actually on sale, rendered from `promotion_packages`.
 *
 * A server component with no state and no client hooks: the rows arrive from
 * `getPromotionPackages()` already priced, and there is nothing here to
 * animate. It replaces the scripted auction board that used to stand in this
 * spot — every figure below is a row in the database that the checkout will
 * charge, so a card and a Razorpay order can no longer disagree.
 *
 * No price is hardcoded, not even as a fallback. A constant here would be a
 * second source of truth and the one a visitor could be shown while the server
 * charged the other, which is why an empty catalogue renders the unavailable
 * state rather than a plausible-looking number.
 */

import { ArrowRight, Crown, Layers, Tag } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Numeric } from "@/components/ui/typography";
import { PromoteCta } from "@/components/promote/promote-cta";
import {
  formatDuration,
  formatPaise,
  type PromotionPackage,
  type PromotionPlacement,
} from "@/lib/promotions";

/** Where each placement renders, in the visitor's terms rather than the column's. */
const PLACEMENT_SURFACE: Record<PromotionPlacement, string> = {
  spotlight: "Homepage + marketplace",
  featured: "Marketplace + category",
  category: "Category page",
};

const PLACEMENT_ICON: Record<PromotionPlacement, LucideIcon> = {
  spotlight: Crown,
  featured: Layers,
  category: Tag,
};

function PackageCard({ pkg, rank }: { pkg: PromotionPackage; rank: number }) {
  const isSpotlight = pkg.placement === "spotlight";
  const Icon = PLACEMENT_ICON[pkg.placement] ?? Tag;

  return (
    <article
      className={cn(
        "relative flex flex-col gap-5 rounded-2xl border bg-card p-5 transition-[transform,border-color,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-hover sm:p-6",
        isSpotlight ? "border-primary/35 shadow-soft" : "border-border shadow-xs",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className={cn(
            "flex size-9 items-center justify-center rounded-xl",
            isSpotlight
              ? "bg-gradient-to-br from-[#ff6b1a] to-[#ff8a3d] text-white shadow-[0_6px_18px_-6px_rgba(255,107,26,0.6)]"
              : "bg-secondary-bg text-ink",
          )}
        >
          <Icon className="size-4.5" aria-hidden="true" />
        </span>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-[0.14em] uppercase",
            isSpotlight ? "bg-primary/10 text-primary" : "bg-secondary-bg text-muted",
          )}
        >
          {pkg.name}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <h3 className="text-lg font-bold text-ink">{PLACEMENT_SURFACE[pkg.placement]}</h3>
        {pkg.description && (
          <p className="text-sm leading-relaxed text-body">{pkg.description}</p>
        )}
      </div>

      <dl className="mt-auto grid grid-cols-2 gap-4 border-t border-border pt-4">
        <div className="flex flex-col gap-1">
          <dt className="text-[11px] font-medium tracking-[0.12em] text-muted uppercase">Price</dt>
          <dd className="text-xl font-bold text-ink">
            <Numeric>{formatPaise(pkg.amountPaise)}</Numeric>
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-[11px] font-medium tracking-[0.12em] text-muted uppercase">Runs for</dt>
          <dd className="text-xl font-bold text-ink">
            <Numeric>{formatDuration(pkg.durationDays)}</Numeric>
          </dd>
        </div>
      </dl>

      <PromoteCta
        href="/promote/checkout"
        event="promote_package_cta"
        eventParams={{ package_id: pkg.id, package_rank: rank, placement: pkg.placement }}
        variant={isSpotlight ? "default" : "outline"}
        className="w-full"
      >
        Buy this placement
        <ArrowRight className="size-4" aria-hidden="true" />
      </PromoteCta>
    </article>
  );
}

/**
 * The catalogue, in the order the table sorts it.
 *
 * `getPromotionPackages()` returns an empty array both when nothing is active
 * and when the query failed — the two are indistinguishable from here and the
 * honest rendering is the same either way: say so, and offer the human path
 * rather than a checkout that has nothing to sell.
 */
export function PackageTiers({ packages }: { packages: PromotionPackage[] }) {
  if (packages.length === 0) {
    return (
      <div className="mx-auto max-w-2xl rounded-3xl border border-border bg-card p-7 text-center">
        <h3 className="text-lg font-bold text-ink">Promotion slots are unavailable right now</h3>
        <p className="mt-2 text-sm leading-relaxed text-body">
          We could not load the current placements. Try again shortly, or talk to us and we will
          set one up for you directly.
        </p>
        <PromoteCta
          href="/advertise#inquire"
          event="promote_packages_unavailable"
          variant="outline"
          className="mt-5"
        >
          Talk to us
          <ArrowRight className="size-4" aria-hidden="true" />
        </PromoteCta>
      </div>
    );
  }

  return (
    <div className="grid gap-5 md:grid-cols-3">
      {packages.map((pkg, index) => (
        <PackageCard key={pkg.id} pkg={pkg} rank={index + 1} />
      ))}
    </div>
  );
}
