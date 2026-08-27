"use client";

/* Design system: design.md (Bharat Hunt — orange) · /promote
 *
 * The leaderboard. Six contenders, a cut line after the third, and one row that
 * lives just below the clipping edge so a bidder pushed off the bottom has
 * somewhere to slide to.
 *
 * `AuctionBoard` is props-only and has no idea where its bids come from.
 * `LiveAuctionBoard` is the three-line adapter that binds it to whatever
 * `AuctionProvider` is currently serving — today a script, tomorrow a feed.
 */

import { cn } from "@/lib/utils";
import { BOARD_SIZE, PROMOTED_SLOTS, YOU_BID_ID, type AuctionBid } from "@/lib/promote";
import { useAuction } from "@/components/promote/auction-provider";
import { AuctionRow } from "@/components/promote/auction-row";
import { RoundCountdown } from "@/components/promote/countdown";

export type AuctionBoardProps = {
  bids: AuctionBid[];
  /**
   * Whether these bids are simulated. Required, not optional: the one thing this
   * component must never do is let invented activity pass for real activity, and
   * a prop you can forget is a prop that will be forgotten.
   */
  isDemo: boolean;
  highlightedId?: string | null;
  movedBy?: number | null;
  className?: string;
};

export function AuctionBoard({
  bids,
  isDemo,
  highlightedId = null,
  movedBy = null,
  className,
}: AuctionBoardProps) {
  // One more than the board shows. The extra row renders below the clip and is
  // what a displaced bidder slides into on its way out.
  const rendered = bids.slice(0, BOARD_SIZE + 1);

  return (
    <div
      className={cn(
        "relative rounded-3xl border border-white/10 bg-surface-dark-elevated p-3.5 shadow-[0_28px_70px_-24px_rgba(0,0,0,0.75)] sm:p-5",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        {isDemo ? (
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold tracking-[0.16em] text-primary uppercase sm:text-[11px]">
            <span className="relative flex size-1.5 shrink-0">
              <span
                aria-hidden
                className="animate-bh-live-pulse absolute inline-flex size-full rounded-full bg-primary"
              />
              <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
            </span>
            Live demo
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-1 text-[10px] font-semibold tracking-[0.16em] text-white uppercase sm:text-[11px]">
            Live promotion
          </span>
        )}

        <span className="text-[10px] font-medium tracking-[0.14em] text-white/40 uppercase sm:text-[11px]">
          Top {PROMOTED_SLOTS} get placed
        </span>
      </div>

      {isDemo && (
        <p className="mt-2.5 text-[11px] leading-relaxed text-white/45 sm:text-xs">
          A simulated auction using invented products. Nobody has placed these bids.
        </p>
      )}

      {/* Fixed row height in a CSS variable: every row's offset is derived from
          it in `calc()`, so a resize re-lays the board out with no JavaScript.
          `--auction-cut-gap` is the band the cut-off marker lives in — rows
          below the cut are pushed down by it (see auction-row.tsx). */}
      <div
        className="relative mt-3 [--auction-cut-gap:0.875rem] [--auction-row-h:3.25rem] sm:mt-4 sm:[--auction-row-h:3.75rem]"
        style={{ height: `calc(var(--auction-row-h) * ${BOARD_SIZE} + var(--auction-cut-gap))` }}
      >
        <ol className="absolute inset-0 overflow-hidden">
          {rendered.map((bid) => (
            <AuctionRow
              key={bid.id}
              bid={bid}
              index={bid.position - 1}
              isHighlighted={highlightedId === bid.id}
              movedBy={highlightedId === bid.id ? movedBy : null}
              isYou={bid.id === YOU_BID_ID}
            />
          ))}
        </ol>

        {/* The cut line. The whole emotional argument of the page in one rule:
            three of these bidders are being promoted and the rest are not. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 flex -translate-y-1/2 items-center gap-2.5"
          style={{
            top: `calc(var(--auction-row-h) * ${PROMOTED_SLOTS} + var(--auction-cut-gap) / 2)`,
          }}
        >
          <span className="h-px flex-1 bg-[repeating-linear-gradient(90deg,rgba(255,107,26,0.5)_0_5px,transparent_5px_11px)]" />
          <span className="rounded-full border border-primary/40 bg-surface-dark-elevated px-2 py-0.5 text-[9px] font-semibold tracking-[0.16em] text-primary uppercase sm:text-[10px]">
            Cut-off
          </span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3 sm:mt-4 sm:pt-4">
        <span className="text-[10px] font-medium tracking-[0.14em] text-white/40 uppercase sm:text-[11px]">
          Round ends in
        </span>
        <RoundCountdown tone="dark" size="md" />
      </div>
    </div>
  );
}

/**
 * The board, bound to the current auction source.
 *
 * This adapter is the entire integration surface. When real bidding ships,
 * `AuctionProvider` starts returning server data and `isDemo` becomes false —
 * nothing below this line changes.
 */
export function LiveAuctionBoard({ className }: { className?: string }) {
  const { bids, isDemo, highlightedId, movedBy } = useAuction();

  return (
    <AuctionBoard
      bids={bids}
      isDemo={isDemo}
      highlightedId={highlightedId}
      movedBy={movedBy}
      className={className}
    />
  );
}
