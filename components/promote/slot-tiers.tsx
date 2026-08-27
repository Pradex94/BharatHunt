"use client";

/* Design system: design.md (Bharat Hunt — orange) · /promote
 *
 * The three positions being sold, on the white canvas.
 *
 * A second view of the same auction rather than a second auction: the amounts
 * come from the top three rows of the board above, so a slot card and the
 * leaderboard can never disagree. That is also why the cards are here and not
 * another animated table — the board already made the "this is contested"
 * argument, and repeating it would cost a second timer for no new information.
 *
 * No medal emoji. design.md asks for premium and minimal, and a designed rank
 * chip in the numeric face says "podium" without the clip art.
 */

import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { PROMO_SLOTS, type PromoSlot } from "@/lib/promote";
import { useAuction } from "@/components/promote/auction-provider";
import { RollingAmount } from "@/components/promote/rolling-number";
import { RoundCountdown } from "@/components/promote/countdown";
import { PromoteCta } from "@/components/promote/promote-cta";

function SlotCard({ slot, amount }: { slot: PromoSlot; amount: number | null }) {
  const isSpotlight = slot.position === 1;

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
            "flex size-9 items-center justify-center rounded-xl font-mono text-sm font-bold tabular-nums",
            isSpotlight
              ? "bg-gradient-to-br from-[#ff6b1a] to-[#ff8a3d] text-white shadow-[0_6px_18px_-6px_rgba(255,107,26,0.6)]"
              : "bg-secondary-bg text-ink",
          )}
        >
          {String(slot.position).padStart(2, "0")}
        </span>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-[0.14em] uppercase",
            isSpotlight ? "bg-primary/10 text-primary" : "bg-secondary-bg text-muted",
          )}
        >
          {slot.tier}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <h3 className="text-lg font-bold text-ink">{slot.visibility}</h3>
        <p className="text-sm leading-relaxed text-body">{slot.blurb}</p>
      </div>

      <dl className="mt-auto grid grid-cols-2 gap-4 border-t border-border pt-4">
        <div className="flex flex-col gap-1">
          <dt className="text-[11px] font-medium tracking-[0.12em] text-muted uppercase">
            Current bid
          </dt>
          <dd className="text-xl font-bold text-ink">
            {amount === null ? (
              <span className="text-base font-semibold text-muted">Open</span>
            ) : (
              <RollingAmount value={amount} />
            )}
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-[11px] font-medium tracking-[0.12em] text-muted uppercase">
            Ends in
          </dt>
          <dd>
            <RoundCountdown tone="light" size="sm" />
          </dd>
        </div>
      </dl>

      <PromoteCta
        href="#place-bid"
        event="promote_slot_cta"
        eventParams={{ slot_position: slot.position, slot_tier: slot.tier }}
        variant={isSpotlight ? "default" : "outline"}
        className="w-full"
      >
        Bid for this slot
        <ArrowRight className="size-4" aria-hidden="true" />
      </PromoteCta>
    </article>
  );
}

export function SlotTiers() {
  const { bids, isDemo } = useAuction();

  return (
    <>
      <div className="grid gap-5 md:grid-cols-3">
        {PROMO_SLOTS.map((slot) => (
          <SlotCard key={slot.position} slot={slot} amount={bids[slot.position - 1]?.amount ?? null} />
        ))}
      </div>
      {isDemo && (
        <p className="mt-5 text-center text-xs text-muted">
          Amounts are taken from the example auction above — illustrative figures, not real bids.
        </p>
      )}
    </>
  );
}
