"use client";

/* Design system: design.md (Bharat Hunt — orange) · /investors
 *
 * One investor, as a card. The single component every tier renders through, so
 * the free preview, the locked teaser and the unlocked directory cannot drift
 * into three different-looking products.
 *
 * The locked variant is the part worth reading carefully. `LockedInvestorCard`
 * takes **no investor prop at all**. It is not a real card with a blur filter
 * over it, because a CSS blur is a decoration: the text would still be in the
 * DOM, in the RSC payload, in view-source, and selectable by anyone who opened
 * devtools. It draws bars. There is nothing behind it to reveal, which is the
 * only version of "locked" that means anything.
 */

import { ArrowUpRight, Lock, MapPin, Wallet } from "lucide-react";

import { cn } from "@/lib/utils";
import { ProductLogo } from "@/components/products/product-logo";
import { Badge } from "@/components/ui/badge";
import { Numeric } from "@/components/ui/typography";
import { cardInteractiveClassName } from "@/components/ui/card";
import {
  formatChequeRange,
  isFullInvestor,
  type InvestorFull,
  type InvestorPreview,
} from "@/lib/investors";

/** How many tags fit before the card starts saying "+3" instead. */
const VISIBLE_TAGS = 3;

/**
 * A row of tags with an overflow count.
 *
 * Capped rather than wrapped: an investor with eleven sectors would otherwise
 * make one card three times the height of its neighbours and break the grid's
 * rhythm. The full list is in the detail panel, one tap away.
 */
function TagRow({
  label,
  values,
  className,
}: {
  label: string;
  values: string[];
  className?: string;
}) {
  if (values.length === 0) return null;
  const shown = values.slice(0, VISIBLE_TAGS);
  const overflow = values.length - shown.length;

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium tracking-[0.08em] text-muted uppercase">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {shown.map((value) => (
          /* `max-w-full` matters more than it looks: Badge is `whitespace-nowrap`,
             and an admin-entered tag can be 60 characters. Without this, one long
             sector makes the card wider than a 320px viewport and gives the whole
             page a horizontal scrollbar. Badge already clips with `overflow-hidden`. */
          <Badge key={value} variant="outline" className={cn("h-6 max-w-full px-2", className)}>
            {value}
          </Badge>
        ))}
        {overflow > 0 && (
          <Badge variant="ghost" className="h-6 px-2 text-muted">
            +{overflow}
          </Badge>
        )}
      </div>
    </div>
  );
}

export function InvestorCard({
  investor,
  onOpen,
}: {
  investor: InvestorPreview | InvestorFull;
  onOpen: (investor: InvestorPreview | InvestorFull) => void;
}) {
  const cheque = formatChequeRange(investor.checkSizeMinInr, investor.checkSizeMaxInr);
  const hasContact =
    isFullInvestor(investor) &&
    Boolean(investor.email || investor.linkedin || investor.contactDetails);

  return (
    <article
      className={cn(
        "flex h-full flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-xs",
        cardInteractiveClassName,
      )}
    >
      <div className="flex items-start gap-3">
        <ProductLogo src={investor.logoUrl} name={investor.name} size="sm" loading="lazy" />
        <div className="min-w-0 flex-1">
          {/*
            `break-words` and `min-w-0`: fund names run long ("Anugraha Corporate
            Ventures") and a flex child defaults to min-content width, which on a
            320px screen pushes the card wider than its column and gives the page
            a horizontal scrollbar.
          */}
          <h3 className="text-base leading-snug font-semibold break-words text-ink">
            {investor.name}
          </h3>
          {investor.firmName && (
            <p className="mt-0.5 truncate text-sm text-body">{investor.firmName}</p>
          )}
          {investor.investorType && (
            <Badge variant="secondary" className="mt-2 h-5 max-w-full px-2 text-[11px]">
              {investor.investorType}
            </Badge>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 text-sm">
        {investor.location && (
          <p className="flex items-center gap-1.5 text-body">
            <MapPin className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
            <span className="truncate">{investor.location}</span>
          </p>
        )}

        <TagRow label="Stage" values={investor.stages} className="border-primary/25 text-primary" />
        <TagRow label="Focus" values={investor.sectors} />

        {cheque && (
          <p className="flex items-center gap-1.5 text-body">
            <Wallet className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
            <span className="text-muted">Cheque</span>
            <Numeric className="font-medium text-ink">{cheque}</Numeric>
          </p>
        )}

        {investor.portfolio.length > 0 && (
          <p className="line-clamp-2 text-sm text-muted">
            <span className="text-body">Portfolio: </span>
            {investor.portfolio.join(" · ")}
          </p>
        )}
      </div>

      {/* `mt-auto` pins the action to the bottom so a short card and a tall one
          line their buttons up across the grid row. */}
      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <button
          type="button"
          onClick={() => onOpen(investor)}
          className="inline-flex min-h-9 items-center gap-1 rounded-md text-sm font-semibold text-primary transition-colors hover:text-primary-active focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          View investor
          <ArrowUpRight className="size-4" aria-hidden="true" />
        </button>
        {!hasContact && (
          <span
            className="inline-flex items-center gap-1 text-xs text-muted"
            /* Not decorative: it is the reason a paying customer's card looks
               different from this one, so it has to reach a screen reader. */
            title="Contact details are part of the full directory"
          >
            <Lock className="size-3" aria-hidden="true" />
            Contact locked
          </span>
        )}
      </div>
    </article>
  );
}

/**
 * A card-shaped placeholder for an investor the visitor has not paid to see.
 *
 * Takes no data. See the note at the top of this file: the point of the lock is
 * that there is nothing underneath it.
 *
 * `index` only varies the bar widths, so a grid of these does not read as six
 * photocopies of one skeleton.
 */
export function LockedInvestorCard({ index = 0 }: { index?: number }) {
  const widths = [
    ["w-2/3", "w-1/2", "w-4/5", "w-3/5"],
    ["w-3/5", "w-2/5", "w-full", "w-1/2"],
    ["w-3/4", "w-1/3", "w-3/4", "w-2/3"],
  ][index % 3];

  return (
    <article
      aria-hidden="true"
      className="relative flex h-full flex-col gap-4 overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-xs"
    >
      {/* The slow diagonal sheen. One element, transform-only, and it rests at
          the far edge so a frozen frame under reduced-motion is a clean card. */}
      <span className="bh-inv-shine pointer-events-none absolute inset-0" />

      <div className="flex items-start gap-3">
        <span className="size-12 shrink-0 rounded-full bg-secondary-bg" />
        <div className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
          <span className={cn("block h-3.5 rounded-full bg-secondary-bg", widths[0])} />
          <span className={cn("block h-3 rounded-full bg-secondary-bg/70", widths[1])} />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <span className="block h-3 w-24 rounded-full bg-secondary-bg/70" />
        <div className="flex gap-1.5">
          <span className="h-6 w-16 rounded-full bg-secondary-bg" />
          <span className="h-6 w-20 rounded-full bg-secondary-bg" />
        </div>
        <span className={cn("block h-3 rounded-full bg-secondary-bg/70", widths[2])} />
        <span className={cn("block h-3 rounded-full bg-secondary-bg/70", widths[3])} />
      </div>

      <div className="mt-auto flex items-center gap-2 pt-1">
        <Lock className="size-3.5 text-muted-soft" aria-hidden="true" />
        <span className="h-3 w-28 rounded-full bg-secondary-bg" />
      </div>
    </article>
  );
}
