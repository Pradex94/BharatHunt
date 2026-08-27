"use client";

/* Design system: design.md (Bharat Hunt — orange) · /promote
 *
 * The one place on the page that knows where auction data comes from.
 *
 * Everything downstream — the board, the rows, the slot cards, the bid panel —
 * reads this context and renders props. Swapping the scripted demo for a real
 * feed means rewriting `useDemoAuction` below (Supabase Realtime subscription,
 * a polling server action, whatever ships) and changing `isDemo` to false. No
 * visual component moves.
 *
 * Two contexts rather than one, deliberately: the clock changes every second
 * and the board every few seconds, and a single context would re-render six
 * animated rows sixty times a minute for a countdown they do not display.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import {
  advanceAuction,
  applyBid,
  DEMO_INITIAL_STATE,
  DEMO_ROUND_SECONDS,
  DEMO_TICK_MS,
  minimumNextBid,
  PROMOTED_SLOTS,
  YOU_BID_ID,
  type AuctionBid,
} from "@/lib/promote";

export type AuctionContextValue = {
  bids: AuctionBid[];
  /** True while the bids are simulated. The board refuses to render without saying so. */
  isDemo: boolean;
  /** The row that just moved, for ~1s. Drives the flash; null the rest of the time. */
  highlightedId: string | null;
  /** Rupees the highlighted row moved by, so the flash can show the delta. */
  movedBy: number | null;
  /** Rupees the leader is at. */
  topAmount: number;
  /** Smallest amount the bid panel will accept. */
  minNextBid: number;
  /** The visitor's own simulated bid, once they have placed one. */
  yourBid: AuctionBid | null;
  /** Whether the visitor's bid is currently holding a paid slot. */
  yourBidIsWinning: boolean;
  /** Whether the demo is advancing (false under `prefers-reduced-motion`). */
  isRunning: boolean;
  /**
   * Place the visitor's simulated bid. When bidding is real this becomes an
   * async server action: the amount is validated, the bidder authenticated and
   * the product's ownership verified server-side before any state changes.
   */
  placeBid: (amount: number) => void;
};

const AuctionContext = createContext<AuctionContextValue | null>(null);
const ClockContext = createContext<number>(DEMO_ROUND_SECONDS);

export function useAuction(): AuctionContextValue {
  const value = useContext(AuctionContext);
  if (!value) throw new Error("useAuction must be used inside <AuctionProvider>");
  return value;
}

/** Seconds left in the current round. Separate context so the board ignores it. */
export function useAuctionClock(): number {
  return useContext(ClockContext);
}

export function AuctionProvider({ children }: { children: ReactNode }) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [state, setState] = useState(DEMO_INITIAL_STATE);
  const [clearedStep, setClearedStep] = useState(-1);
  const [secondsLeft, setSecondsLeft] = useState(DEMO_ROUND_SECONDS);

  const isRunning = !prefersReducedMotion;

  /*
   * The demo ticker.
   *
   * Under reduced motion it never starts: a leaderboard that reshuffles itself
   * is motion regardless of how the rearrangement is drawn, so the honest way
   * to respect the setting is to leave the board still and fully readable.
   *
   * The `document.hidden` guard keeps a backgrounded tab from accumulating
   * state changes nobody is looking at — the interval still fires (throttled by
   * the browser), it just does no work.
   */
  useEffect(() => {
    if (!isRunning) return;

    const timer = window.setInterval(() => {
      if (document.hidden) return;
      setState(advanceAuction);
    }, DEMO_TICK_MS);

    return () => window.clearInterval(timer);
  }, [isRunning]);

  /*
   * The flash on the row that just moved.
   *
   * Derived during render rather than mirrored into state: the highlight *is*
   * `state.movedId`, right up until a timer marks that step as spent. Only the
   * expiry needs an effect, and it fires from inside the timeout — so a tick
   * costs one render, not two.
   *
   * Keyed on `step` as well as the id, so a contender that raises twice in a
   * row flashes twice instead of once.
   */
  useEffect(() => {
    if (!state.movedId) return;

    const { step } = state;
    const timer = window.setTimeout(() => setClearedStep(step), 1100);
    return () => window.clearTimeout(timer);
  }, [state]);

  const highlightedId = state.movedId && clearedStep !== state.step ? state.movedId : null;

  /*
   * The round clock keeps running under reduced motion. A countdown is
   * information, not decoration — freezing it would make the page wrong rather
   * than calm. What reduced motion removes is the pulse on the seconds tile
   * (handled in the countdown component), not the count itself.
   */
  useEffect(() => {
    const timer = window.setInterval(() => {
      setSecondsLeft((seconds) => (seconds <= 1 ? DEMO_ROUND_SECONDS : seconds - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const placeBid = useCallback((amount: number) => {
    setState((previous) =>
      applyBid(previous, {
        id: YOU_BID_ID,
        productName: "Your product",
        productSlug: "your-product",
        amount,
      }),
    );
  }, []);

  const value = useMemo<AuctionContextValue>(() => {
    const topAmount = state.bids[0]?.amount ?? 0;
    const yourBid = state.bids.find((bid) => bid.id === YOU_BID_ID) ?? null;

    return {
      bids: state.bids,
      isDemo: true,
      highlightedId,
      movedBy: state.movedBy,
      topAmount,
      minNextBid: minimumNextBid(topAmount),
      yourBid,
      yourBidIsWinning: yourBid !== null && yourBid.position <= PROMOTED_SLOTS,
      isRunning,
      placeBid,
    };
  }, [state.bids, state.movedBy, highlightedId, isRunning, placeBid]);

  return (
    <AuctionContext.Provider value={value}>
      <ClockContext.Provider value={secondsLeft}>{children}</ClockContext.Provider>
    </AuctionContext.Provider>
  );
}
