"use client";

/* Design system: design.md (Bharat Hunt — orange) · /promote
 *
 * "What does the board look like in my category?"
 *
 * A frozen snapshot per category, not a second live ticker. Switching category
 * swaps three rows and reports the choice to GA4; nothing here runs on a timer,
 * so the section costs one event listener and no frames.
 *
 * The categories are the marketplace's real ones (`lib/constants.ts`). Inventing
 * a category to make the example read better would be advertising a place on
 * the site that does not exist.
 */

import { useState } from "react";
import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";
import { DEMO_CATEGORY_AUCTIONS, formatInr, type BidAccent } from "@/lib/promote";
import { PromoteCta } from "@/components/promote/promote-cta";

const ACCENT_CLASS: Record<BidAccent, string> = {
  orange: "bg-gradient-to-br from-[#ff6b1a] to-[#ff8a3d] text-white",
  violet: "bg-[#8b5cf6] text-white",
  rose: "bg-[#f43f5e] text-white",
  amber: "bg-[#f59e0b] text-white",
  ink: "bg-surface-dark text-white",
};

export function CategoryAuction() {
  const [selected, setSelected] = useState(0);
  const { category, entries } = DEMO_CATEGORY_AUCTIONS[selected];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Choose a category">
        {DEMO_CATEGORY_AUCTIONS.map((auction, index) => {
          const isSelected = index === selected;
          return (
            <button
              key={auction.category}
              type="button"
              aria-pressed={isSelected}
              onClick={() => {
                setSelected(index);
                trackEvent("promote_category_select", {
                  location: "promote",
                  category: auction.category,
                });
              }}
              className={cn(
                "min-h-10 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                isSelected
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-card text-body hover:border-primary/30 hover:bg-secondary-bg hover:text-ink",
              )}
            >
              {auction.category}
            </button>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4">
          <h3 className="text-base font-bold text-ink">{category}</h3>
          <span className="text-[11px] font-medium tracking-[0.14em] text-muted uppercase">
            Example positions
          </span>
        </div>

        <ol className="divide-y divide-border">
          {entries.map((entry, index) => (
            <li
              // Keyed on the category so switching replays the entrance rather
              // than silently swapping text inside the same three rows.
              key={`${category}-${entry.productName}`}
              className="animate-bh-bid-enter flex items-center gap-3 px-4 py-3.5 sm:gap-4 sm:px-5"
            >
              <span
                aria-hidden
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-md font-mono text-[11px] font-semibold tabular-nums sm:size-7 sm:text-xs",
                  index === 0
                    ? "bg-gradient-to-br from-[#ff6b1a] to-[#ff8a3d] text-white"
                    : "bg-secondary-bg text-muted",
                )}
              >
                {String(index + 1).padStart(2, "0")}
              </span>

              <span
                aria-hidden
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold",
                  ACCENT_CLASS[entry.accent],
                )}
              >
                {entry.productName.slice(0, 1)}
              </span>

              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink sm:text-[0.95rem]">
                {entry.productName}
              </span>

              <span
                className={cn(
                  "shrink-0 font-mono text-xs font-semibold tabular-nums",
                  entry.delta >= 0 ? "text-success" : "text-muted",
                )}
              >
                {entry.delta >= 0 ? "▲" : "▼"} {formatInr(Math.abs(entry.delta))}
              </span>

              <span className="w-20 shrink-0 text-right font-mono text-sm font-bold tabular-nums text-ink sm:text-base">
                {formatInr(entry.amount)}
              </span>
            </li>
          ))}
        </ol>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-secondary-bg/40 px-5 py-4">
          <p className="text-xs text-muted">
            Illustrative figures for invented products — not real bids.
          </p>
          <PromoteCta
            href="#place-bid"
            event="promote_category_cta"
            eventParams={{ category }}
            variant="link"
            size="sm"
            className="px-0 font-semibold"
          >
            Bid to enter the spotlight
            <ArrowRight className="size-4" aria-hidden="true" />
          </PromoteCta>
        </div>
      </div>
    </div>
  );
}
