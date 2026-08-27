"use client";

/* Design system: design.md (Bharat Hunt — orange) · /promote
 *
 * One contender on the leaderboard. Purely presentational — it is handed a bid
 * and an index and has no idea whether either is real.
 *
 * Ranking movement is a `translateY` on a fixed row height, not a reflow of a
 * list. The row is absolutely positioned and offset by
 * `calc(var(--auction-row-h) * index)`, so when the order changes React only
 * updates one inline transform per row and the browser interpolates it on the
 * compositor. No layout, no measurement pass, no FLIP bookkeeping, and the
 * fixed height means resizing the viewport re-derives every offset from the CSS
 * variable without any JavaScript running at all.
 *
 * Rows below the cut carry an extra `--auction-cut-gap`, which opens a real
 * band for the cut-off marker to sit in rather than having it overlay the two
 * rows it divides. It also makes the moment that matters legible: a challenger
 * crossing the line visibly travels further than one moving inside the pack.
 */

import { memo } from "react";

import { cn } from "@/lib/utils";
import { accentFor, formatInr, PROMOTED_SLOTS, type AuctionBid, type BidAccent } from "@/lib/promote";
import { RollingAmount } from "@/components/promote/rolling-number";

/** Icon-tile accents, restricted to the palette design.md allows for tiles. */
const ACCENT_CLASS: Record<BidAccent, string> = {
  orange: "bg-gradient-to-br from-[#ff6b1a] to-[#ff8a3d] text-white",
  violet: "bg-[#8b5cf6] text-white",
  rose: "bg-[#f43f5e] text-white",
  amber: "bg-[#f59e0b] text-white",
  ink: "bg-white/12 text-white",
};

export type AuctionRowProps = {
  bid: AuctionBid;
  /** 0-based slot on the board. Drives the vertical offset. */
  index: number;
  /** True for ~1s after this row's bid changed. */
  isHighlighted: boolean;
  /** Rupees the bid just moved by, shown beside the amount during the flash. */
  movedBy?: number | null;
  /** Renders this row as the visitor's own. */
  isYou?: boolean;
};

function AuctionRowImpl({ bid, index, isHighlighted, movedBy, isYou = false }: AuctionRowProps) {
  const promoted = bid.position <= PROMOTED_SLOTS;
  const accent = isYou ? "orange" : accentFor(bid.id);

  return (
    <li
      className="absolute inset-x-0 top-0 transition-transform duration-[520ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
      style={{
        transform: `translateY(calc(var(--auction-row-h) * ${index} + ${
          index >= PROMOTED_SLOTS ? "var(--auction-cut-gap)" : "0px"
        }))`,
      }}
      aria-current={isYou ? "true" : undefined}
    >
      {/* Inner element owns the entrance animation so it never fights the
          ranking transform on the element above it. */}
      <div
        className={cn(
          "animate-bh-bid-enter relative flex h-[var(--auction-row-h)] items-center gap-3 rounded-xl px-2.5 sm:gap-4 sm:px-3",
          "transition-colors duration-300",
          promoted ? "bg-white/[0.04]" : "bg-transparent",
          isYou && "ring-1 ring-primary/60 ring-inset",
        )}
      >
        {/* The flash. An overlay rather than a background change, so it can fade
            out over the row's own colours without a second transition. */}
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 rounded-xl bg-primary/15 opacity-0 transition-opacity duration-500",
            isHighlighted && "opacity-100",
          )}
        />

        <span
          aria-hidden
          className={cn(
            "relative flex size-6 shrink-0 items-center justify-center rounded-md font-mono text-[11px] font-semibold tabular-nums sm:size-7 sm:text-xs",
            bid.position === 1 && "bg-gradient-to-br from-[#ff6b1a] to-[#ff8a3d] text-white",
            bid.position > 1 && promoted && "bg-white/12 text-white",
            !promoted && "bg-white/5 text-white/40",
          )}
        >
          {String(bid.position).padStart(2, "0")}
        </span>

        <span
          aria-hidden
          className={cn(
            "relative flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold sm:size-9",
            ACCENT_CLASS[accent],
            !promoted && "opacity-60",
          )}
        >
          {bid.productName.slice(0, 1).toUpperCase()}
        </span>

        <span className="relative flex min-w-0 flex-col">
          <span
            className={cn(
              "truncate text-sm font-semibold sm:text-[0.95rem]",
              promoted ? "text-white" : "text-white/55",
            )}
          >
            {bid.productName}
          </span>
          <span
            className={cn(
              "text-[10px] font-medium tracking-[0.12em] uppercase sm:text-[11px]",
              promoted ? "text-primary" : "text-white/35",
            )}
          >
            {isYou && promoted
              ? "You — holding"
              : isYou
                ? "You — outbid"
                : promoted
                  ? "Promoted"
                  : "Outbid"}
          </span>
        </span>

        <span className="relative ml-auto flex items-center gap-2 sm:gap-3">
          {/* Reserved width, not conditional mounting: a chip appearing and
              disappearing would nudge the amount sideways twice a tick. */}
          <span
            aria-hidden
            className={cn(
              "hidden w-14 justify-end text-[11px] font-semibold text-success transition-opacity duration-300 sm:flex",
              isHighlighted && movedBy && movedBy > 0 ? "opacity-100" : "opacity-0",
            )}
          >
            {movedBy && movedBy > 0 ? `▲ ${formatInr(movedBy)}` : null}
          </span>
          <RollingAmount
            value={bid.amount}
            className={cn(
              "text-sm font-semibold sm:text-base",
              promoted ? "text-white" : "text-white/50",
            )}
          />
        </span>
      </div>
    </li>
  );
}

/**
 * Memoised because the board re-renders on every tick while at most two rows
 * actually changed. Without this, six rows would rebuild forty times a minute
 * to redraw identical markup.
 */
export const AuctionRow = memo(AuctionRowImpl);
