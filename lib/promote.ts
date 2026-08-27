/**
 * Bharat Hunt Promote — the auction model, and the scripted demo that stands in
 * for it until a bidding backend exists.
 *
 * Framework-agnostic on purpose: no React, no Supabase, no `window`. The
 * /promote page's visual components take `AuctionBid[]` as props and know
 * nothing about where those bids came from, so replacing the demo engine below
 * with a real feed (Supabase Realtime, a server action, a polling endpoint) is a
 * change to `components/promote/auction-provider.tsx` alone — every board, row,
 * slot card and the bid panel keep working untouched.
 *
 * ── Demo vs. real ────────────────────────────────────────────────────────────
 * Everything exported here whose name starts with `DEMO_` is invented. The
 * products do not exist, the bids were never placed, and the UI that renders
 * them is required to say so (see `isDemo` on the board). That is not a nicety:
 * a marketing page that shows fabricated activity as if it were real is fake
 * social proof, and it would poison the credibility the transparency section of
 * the page is trying to build.
 *
 * ── What the backend will have to own ────────────────────────────────────────
 * Bid amounts here are advanced client-side because nothing is at stake. When
 * money is, none of this arithmetic may be trusted: the server validates the
 * amount, authenticates the bidder, verifies they own the product, enforces the
 * increment and the round's end time, and rate-limits the endpoint. The client
 * only ever renders what the server sends back.
 */

/** How many positions are actually sold. Everything below this is "in the running". */
export const PROMOTED_SLOTS = 3;

/** Minimum step over the bid you are trying to beat, in rupees. */
export const BID_INCREMENT = 100;

/**
 * Rows the board shows. One more than this is kept in state so the row leaving
 * the bottom has somewhere to slide to before it unmounts.
 */
export const BOARD_SIZE = 6;

/** Length of a demo round, seeded so the countdown reads 02:18:42 on first paint. */
export const DEMO_ROUND_SECONDS = 2 * 3600 + 18 * 60 + 42;

/** How often the demo advances, in ms. Slow enough to read, quick enough to feel contested. */
export const DEMO_TICK_MS = 3400;

/**
 * A new round starts once the scripted contenders pass this. Without a ceiling,
 * a tab left open for an hour would drift into lakhs and stop reading as a
 * plausible promotion budget.
 *
 * Measured on the contenders alone. The visitor's own bid is not the demo
 * running away, and a reset triggered by it would delete the one row on the
 * board they actually care about.
 */
const DEMO_RESET_ABOVE = 6000;

/** The id the visitor's own simulated bid is filed under. */
export const YOU_BID_ID = "you";

export type AuctionBid = {
  id: string;
  productName: string;
  productSlug: string;
  logo?: string | null;
  amount: number;
  /** 1-based rank. Derived from `amount` by `rankBids` — never set by hand. */
  position: number;
  /** `active` = holds one of the paid slots. `outbid` = in the running, below the cut. */
  status: "active" | "outbid";
};

/** Accent for a product's initial-letter tile. Restricted to design.md's icon-tile palette. */
export type BidAccent = "orange" | "violet" | "rose" | "amber" | "ink";

export type AuctionContender = {
  id: string;
  productName: string;
  productSlug: string;
  accent: BidAccent;
};

/**
 * Invented products. Deliberately not real Bharat Hunt listings: putting a real
 * maker's product on a fabricated leaderboard would imply they paid for a slot
 * that does not exist yet.
 */
const DEMO_CONTENDERS: AuctionContender[] = [
  { id: "kirana-os", productName: "Kirana OS", productSlug: "kirana-os", accent: "orange" },
  { id: "vaayu", productName: "Vaayu Analytics", productSlug: "vaayu-analytics", accent: "violet" },
  { id: "setu-api", productName: "Setu API", productSlug: "setu-api", accent: "ink" },
  { id: "chai-crm", productName: "Chai CRM", productSlug: "chai-crm", accent: "amber" },
  { id: "prism-docs", productName: "Prism Docs", productSlug: "prism-docs", accent: "rose" },
  { id: "bolt-ledger", productName: "Bolt Ledger", productSlug: "bolt-ledger", accent: "ink" },
  { id: "arka-ai", productName: "Arka AI", productSlug: "arka-ai", accent: "violet" },
  { id: "nimbus-pay", productName: "Nimbus Pay", productSlug: "nimbus-pay", accent: "orange" },
  { id: "tinkr", productName: "Tinkr Studio", productSlug: "tinkr-studio", accent: "rose" },
];

const DEMO_SEED_AMOUNTS = [2400, 1850, 1200, 1050, 900, 750];

const ACCENT_BY_ID = new Map(DEMO_CONTENDERS.map((c) => [c.id, c.accent] as const));

/** Tile colour for a contender. Falls back to orange for the visitor's own bid. */
export function accentFor(id: string): BidAccent {
  return ACCENT_BY_ID.get(id) ?? "orange";
}

/**
 * Sort by amount, assign 1-based positions, and mark everything past the cut as
 * outbid. The single place ranking is decided, so no component ever has to.
 *
 * Ties break on id rather than on array order: two equal amounts must produce
 * the same board whichever order they arrived in, or the server and the client
 * could render different HTML for identical data.
 */
export function rankBids(bids: AuctionBid[]): AuctionBid[] {
  return [...bids]
    .sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id))
    .map((bid, index) => ({
      ...bid,
      position: index + 1,
      status: index < PROMOTED_SLOTS ? ("active" as const) : ("outbid" as const),
    }));
}

/** The next bid that would be accepted, given the current leader. */
export function minimumNextBid(topAmount: number): number {
  return topAmount + BID_INCREMENT;
}

/**
 * Indian digit grouping, hand-rolled rather than `Intl.NumberFormat("en-IN")`.
 *
 * This string is rendered on the server and again during hydration. A Node
 * build without full ICU groups differently from the browser, which would be a
 * hydration mismatch that only appears on some hosts — the worst kind. Six
 * lines of arithmetic have no such failure mode.
 */
export function formatInr(amount: number): string {
  const rounded = Math.round(amount);
  const digits = String(Math.abs(rounded));
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}` : last3;
  return `${rounded < 0 ? "-" : ""}₹${grouped}`;
}

/** `8322` → `{ hours: "02", minutes: "18", seconds: "42" }`. Clamped at zero. */
export function splitDuration(totalSeconds: number): {
  hours: string;
  minutes: string;
  seconds: string;
} {
  const safe = Math.max(0, Math.floor(totalSeconds));
  return {
    hours: String(Math.floor(safe / 3600)).padStart(2, "0"),
    minutes: String(Math.floor((safe % 3600) / 60)).padStart(2, "0"),
    seconds: String(safe % 60).padStart(2, "0"),
  };
}

/** Below this many seconds the countdown starts reading as urgent. */
export const URGENT_BELOW_SECONDS = 30 * 60;
/** Below this, more so. */
export const CRITICAL_BELOW_SECONDS = 5 * 60;

/* ── The slots being sold ─────────────────────────────────────────────────── */

export type PromoSlot = {
  position: number;
  /** Name of the tier, not of whoever currently holds it. */
  tier: string;
  /** Where the placement is actually shown. Kept in step with `lib/advertise.ts`. */
  visibility: string;
  blurb: string;
};

export const PROMO_SLOTS: PromoSlot[] = [
  {
    position: 1,
    tier: "Spotlight",
    visibility: "Homepage + marketplace",
    blurb:
      "The single top placement — carried on the homepage and above the marketplace listing.",
  },
  {
    position: 2,
    tier: "Featured",
    visibility: "Marketplace + category",
    blurb: "Top row of the marketplace and of your product's category page.",
  },
  {
    position: 3,
    tier: "Featured",
    visibility: "Category page",
    blurb: "Top row of your product's category page, where browsing intent is highest.",
  },
];

/* ── The demo engine ──────────────────────────────────────────────────────── */

export type AuctionState = {
  bids: AuctionBid[];
  /** Monotonic tick counter. Chooses the next scripted event. */
  step: number;
  /** The bid that just changed, so the UI can flash exactly one row. */
  movedId: string | null;
  /** What it moved by, in rupees. `null` when nothing moved (seed, reset). */
  movedBy: number | null;
};

export const DEMO_SEED_BIDS: AuctionBid[] = rankBids(
  DEMO_SEED_AMOUNTS.map((amount, index) => ({
    id: DEMO_CONTENDERS[index].id,
    productName: DEMO_CONTENDERS[index].productName,
    productSlug: DEMO_CONTENDERS[index].productSlug,
    amount,
    position: 0,
    status: "outbid" as const,
  })),
);

export const DEMO_INITIAL_STATE: AuctionState = {
  bids: DEMO_SEED_BIDS,
  step: 0,
  movedId: null,
  movedBy: null,
};

type DemoEvent =
  /** The bid at index `from` outbids the one at index `over`. */
  | { kind: "raise"; from: number; over: number }
  /** A contender who is not on the board enters just above index `over`. */
  | { kind: "enter"; over: number };

/**
 * A hand-authored cycle rather than a random walk.
 *
 * Randomness would buy nothing here and cost two things: the sequence could not
 * be unit-tested, and the interesting beats — a challenger crossing the cut
 * line, the lead changing hands — would land whenever they happened to instead
 * of at a readable rhythm. Every entry below is a specific piece of drama.
 */
const DEMO_SCRIPT: DemoEvent[] = [
  { kind: "raise", from: 2, over: 1 }, // third place takes second
  { kind: "raise", from: 3, over: 2 }, // a challenger crosses the cut line
  { kind: "enter", over: 1 }, // a new bidder arrives straight into the slots
  { kind: "raise", from: 1, over: 0 }, // the lead changes hands
  { kind: "raise", from: 4, over: 3 }, // movement below the cut
  { kind: "raise", from: 2, over: 0 }, // and again, from further back
  { kind: "enter", over: 2 }, // a second newcomer, onto the last paid slot
  { kind: "raise", from: 5, over: 2 }, // the bottom of the board jumps the cut
];

/** Increments vary with the step so raises do not all read as the same +₹100. */
function raiseAmount(target: number, step: number): number {
  return target + BID_INCREMENT * (1 + (step % 3));
}

/**
 * Advance the demo one step. Pure: same input, same output, no clock, no random.
 *
 * Returns the seed state once the leader passes the ceiling, which reads as a
 * fresh round starting rather than as numbers running away.
 */
export function advanceAuction(state: AuctionState): AuctionState {
  const step = state.step + 1;

  const contenderLeader = state.bids.find((bid) => bid.id !== YOU_BID_ID);
  if (contenderLeader && contenderLeader.amount > DEMO_RESET_ABOVE) {
    return { bids: startNewRound(state), step, movedId: null, movedBy: null };
  }

  const event = DEMO_SCRIPT[state.step % DEMO_SCRIPT.length];

  if (event.kind === "enter") {
    const target = state.bids[event.over];
    if (!target) return { ...state, step, movedId: null, movedBy: null };

    const onBoard = new Set(state.bids.map((bid) => bid.id));
    const entrant = DEMO_CONTENDERS.find((contender) => !onBoard.has(contender.id));
    // Every contender is already bidding. Nothing to enter, so leave the board
    // alone this tick rather than inventing a duplicate row.
    if (!entrant) return { ...state, step, movedId: null, movedBy: null };

    const amount = raiseAmount(target.amount, step);
    return {
      bids: trimBoard(
        rankBids([
          ...state.bids,
          {
            id: entrant.id,
            productName: entrant.productName,
            productSlug: entrant.productSlug,
            amount,
            position: 0,
            status: "outbid",
          },
        ]),
      ),
      step,
      movedId: entrant.id,
      movedBy: amount,
    };
  }

  const mover = state.bids[event.from];
  const target = state.bids[event.over];
  if (!mover || !target) return { ...state, step, movedId: null, movedBy: null };

  const amount = raiseAmount(target.amount, step);
  return {
    bids: trimBoard(
      rankBids(state.bids.map((bid) => (bid.id === mover.id ? { ...bid, amount } : bid))),
    ),
    step,
    movedId: mover.id,
    movedBy: amount - mover.amount,
  };
}

/**
 * Apply a bid from the visitor. Same shape as a raise, so the board treats the
 * demo bidder exactly like every other contender — including being outbid a few
 * seconds later, which is the entire point of the page.
 */
export function applyBid(
  state: AuctionState,
  bid: { id: string; productName: string; productSlug: string; amount: number },
): AuctionState {
  const existing = state.bids.some((entry) => entry.id === bid.id);
  const next: AuctionBid[] = existing
    ? state.bids.map((entry) => (entry.id === bid.id ? { ...entry, ...bid } : entry))
    : [...state.bids, { ...bid, position: 0, status: "outbid" as const }];

  return {
    bids: trimBoard(rankBids(next)),
    step: state.step,
    movedId: bid.id,
    movedBy: bid.amount,
  };
}

/**
 * Reseed the contenders for a fresh round, carrying the visitor's bid across.
 *
 * Their bid outlives the round it was placed in on purpose: watching your own
 * row vanish because an unrelated timer elapsed reads as the page losing your
 * input, not as a new round beginning.
 */
function startNewRound(state: AuctionState): AuctionBid[] {
  const you = state.bids.find((bid) => bid.id === YOU_BID_ID);
  return you ? trimBoard(rankBids([...DEMO_SEED_BIDS, you])) : DEMO_SEED_BIDS;
}

/**
 * Keep one row more than the board shows. That extra row is what the board
 * slides off its bottom edge when a newcomer arrives; without it, a losing
 * bidder would vanish mid-animation.
 *
 * The visitor's own bid is never trimmed — watching your row fall off the
 * bottom is precisely the moment you would want to be looking at it.
 */
function trimBoard(bids: AuctionBid[]): AuctionBid[] {
  if (bids.length <= BOARD_SIZE + 1) return bids;

  const kept = bids.slice(0, BOARD_SIZE + 1);
  if (kept.some((bid) => bid.id === YOU_BID_ID)) return kept;

  const you = bids.find((bid) => bid.id === YOU_BID_ID);
  return you ? rankBids([...kept.slice(0, BOARD_SIZE), you]) : kept;
}

/* ── Static example: one category's board ─────────────────────────────────── */

export type CategoryAuctionEntry = {
  productName: string;
  amount: number;
  /** Change since the previous round, in rupees. Illustrative, like the rest. */
  delta: number;
  accent: BidAccent;
};

/**
 * A frozen snapshot per category, rendered with no JavaScript at all.
 *
 * The animated board in the hero already carries the "this is contested"
 * message; a second live ticker further down the page would cost another timer
 * and add nothing. Categories are the real ones from `lib/constants.ts`,
 * because offering to bid inside a category that does not exist on the platform
 * would be a promise the marketplace cannot keep.
 */
export const DEMO_CATEGORY_AUCTIONS: { category: string; entries: CategoryAuctionEntry[] }[] = [
  {
    category: "Developer Tools",
    entries: [
      { productName: "Setu API", amount: 2400, delta: 300, accent: "ink" },
      { productName: "Bolt Ledger", amount: 1800, delta: 150, accent: "orange" },
      { productName: "Tinkr Studio", amount: 950, delta: -100, accent: "rose" },
    ],
  },
  {
    category: "Productivity",
    entries: [
      { productName: "Kirana OS", amount: 2150, delta: 200, accent: "orange" },
      { productName: "Prism Docs", amount: 1600, delta: 250, accent: "rose" },
      { productName: "Chai CRM", amount: 1100, delta: 100, accent: "amber" },
    ],
  },
  {
    category: "Design Tools",
    entries: [
      { productName: "Tinkr Studio", amount: 1950, delta: 350, accent: "rose" },
      { productName: "Prism Docs", amount: 1400, delta: -50, accent: "violet" },
      { productName: "Vaayu Analytics", amount: 850, delta: 100, accent: "violet" },
    ],
  },
  {
    category: "Marketing",
    entries: [
      { productName: "Vaayu Analytics", amount: 2050, delta: 250, accent: "violet" },
      { productName: "Nimbus Pay", amount: 1500, delta: 200, accent: "orange" },
      { productName: "Chai CRM", amount: 900, delta: -150, accent: "amber" },
    ],
  },
];
