import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  advanceAuction,
  applyBid,
  BOARD_SIZE,
  BID_INCREMENT,
  DEMO_INITIAL_STATE,
  DEMO_SEED_BIDS,
  formatInr,
  minimumNextBid,
  PROMOTED_SLOTS,
  rankBids,
  splitDuration,
  YOU_BID_ID,
  type AuctionBid,
  type AuctionState,
} from "../lib/promote.ts";

/**
 * The demo auction is scripted rather than random precisely so it can be
 * checked here: these tests are the reason the engine lives in `lib/` with no
 * React in it. The visual components are not tested — what matters is that the
 * data they are handed is always a coherent board.
 */

function bid(id: string, amount: number): AuctionBid {
  return { id, productName: id, productSlug: id, amount, position: 0, status: "outbid" };
}

/** Every invariant a board must satisfy, whatever produced it. */
function assertWellFormed(state: AuctionState) {
  const { bids } = state;

  assert.ok(bids.length <= BOARD_SIZE + 1, "board never exceeds one row past the visible size");
  assert.equal(new Set(bids.map((entry) => entry.id)).size, bids.length, "no duplicate bidders");

  bids.forEach((entry, index) => {
    assert.equal(entry.position, index + 1, "positions are contiguous and 1-based");
    assert.equal(
      entry.status,
      index < PROMOTED_SLOTS ? "active" : "outbid",
      "status follows position",
    );
    if (index > 0) {
      assert.ok(bids[index - 1].amount >= entry.amount, "amounts are non-increasing");
    }
  });
}

describe("formatInr", () => {
  it("groups the Indian way", () => {
    assert.equal(formatInr(950), "₹950");
    assert.equal(formatInr(2400), "₹2,400");
    assert.equal(formatInr(120000), "₹1,20,000");
    assert.equal(formatInr(10000000), "₹1,00,00,000");
  });

  it("handles small and negative values", () => {
    assert.equal(formatInr(0), "₹0");
    assert.equal(formatInr(7), "₹7");
    assert.equal(formatInr(-2400), "-₹2,400");
  });

  it("rounds rather than emitting a fraction", () => {
    assert.equal(formatInr(2400.6), "₹2,401");
  });
});

describe("splitDuration", () => {
  it("pads each unit to two digits", () => {
    assert.deepEqual(splitDuration(8322), { hours: "02", minutes: "18", seconds: "42" });
    assert.deepEqual(splitDuration(0), { hours: "00", minutes: "00", seconds: "00" });
  });

  it("clamps below zero instead of rendering negative time", () => {
    assert.deepEqual(splitDuration(-5), { hours: "00", minutes: "00", seconds: "00" });
  });
});

describe("rankBids", () => {
  it("orders by amount and marks everything past the cut as outbid", () => {
    const ranked = rankBids([bid("a", 100), bid("b", 900), bid("c", 500), bid("d", 50)]);

    assert.deepEqual(
      ranked.map((entry) => entry.id),
      ["b", "c", "a", "d"],
    );
    assert.deepEqual(
      ranked.map((entry) => entry.status),
      ["active", "active", "active", "outbid"],
    );
  });

  it("breaks ties on id, so identical data always renders identically", () => {
    const one = rankBids([bid("zeta", 500), bid("alpha", 500)]);
    const other = rankBids([bid("alpha", 500), bid("zeta", 500)]);

    assert.deepEqual(
      one.map((entry) => entry.id),
      other.map((entry) => entry.id),
    );
  });
});

describe("minimumNextBid", () => {
  it("is one increment over the leader", () => {
    assert.equal(minimumNextBid(2400), 2400 + BID_INCREMENT);
  });
});

describe("advanceAuction", () => {
  it("leaves the seed board well formed", () => {
    assertWellFormed(DEMO_INITIAL_STATE);
  });

  it("stays well formed across a long run", () => {
    let state = DEMO_INITIAL_STATE;
    for (let tick = 0; tick < 400; tick += 1) {
      state = advanceAuction(state);
      assertWellFormed(state);
    }
  });

  it("is deterministic — the same state always produces the same next state", () => {
    const once = advanceAuction(DEMO_INITIAL_STATE);
    const twice = advanceAuction(DEMO_INITIAL_STATE);
    assert.deepEqual(once, twice);
  });

  it("moves exactly one bidder per tick, upward", () => {
    let state = DEMO_INITIAL_STATE;

    for (let tick = 0; tick < 40; tick += 1) {
      const before = new Map(state.bids.map((entry) => [entry.id, entry.amount]));
      const next = advanceAuction(state);

      // A reset returns the seed board; nothing moved.
      if (next.movedId === null) {
        state = next;
        continue;
      }

      const changed = next.bids.filter((entry) => before.get(entry.id) !== entry.amount);
      assert.equal(changed.length, 1, "one bidder changes per tick");
      assert.equal(changed[0].id, next.movedId, "the reported mover is the one that changed");

      const previous = before.get(next.movedId);
      if (previous !== undefined) {
        assert.ok(changed[0].amount > previous, "a raise only ever goes up");
      }

      state = next;
    }
  });

  it("resets instead of letting amounts run away", () => {
    let state = DEMO_INITIAL_STATE;
    let sawReset = false;

    for (let tick = 0; tick < 300; tick += 1) {
      state = advanceAuction(state);
      if (state.bids === DEMO_SEED_BIDS) sawReset = true;
      assert.ok(state.bids[0].amount <= 20000, "the leader never runs away");
    }

    assert.ok(sawReset, "a long-running demo returns to the seed board");
  });
});

describe("applyBid", () => {
  it("puts a large enough bid at the top", () => {
    const next = applyBid(DEMO_INITIAL_STATE, {
      id: YOU_BID_ID,
      productName: "Your product",
      productSlug: "your-product",
      amount: 9000,
    });

    assert.equal(next.bids[0].id, YOU_BID_ID);
    assert.equal(next.bids[0].position, 1);
    assert.equal(next.bids[0].status, "active");
    assertWellFormed(next);
  });

  it("replaces the visitor's previous bid rather than listing them twice", () => {
    const first = applyBid(DEMO_INITIAL_STATE, {
      id: YOU_BID_ID,
      productName: "Your product",
      productSlug: "your-product",
      amount: 2500,
    });
    const second = applyBid(first, {
      id: YOU_BID_ID,
      productName: "Your product",
      productSlug: "your-product",
      amount: 3200,
    });

    assert.equal(second.bids.filter((entry) => entry.id === YOU_BID_ID).length, 1);
    assert.equal(second.bids[0].amount, 3200);
    assertWellFormed(second);
  });

  it("keeps the visitor on the board even once they are outbid off the bottom", () => {
    let state = applyBid(DEMO_INITIAL_STATE, {
      id: YOU_BID_ID,
      productName: "Your product",
      productSlug: "your-product",
      // Deliberately last place, so trimming would drop it if it could.
      amount: 1,
    });

    for (let tick = 0; tick < 200; tick += 1) {
      state = advanceAuction(state);
      assert.ok(
        state.bids.some((entry) => entry.id === YOU_BID_ID),
        "the visitor's own row survives trimming and round resets alike",
      );
      assertWellFormed(state);
    }
  });

  /*
   * Regression: a bid over the demo's ceiling used to trip the round reset,
   * which reseeded the board and silently deleted the visitor's own row a
   * couple of seconds after they placed it — taking the confirmation message
   * with it. The ceiling exists to stop the *scripted* bidders running away, so
   * it is measured on them alone.
   */
  it("does not reset the round just because the visitor bid big", () => {
    let state = applyBid(DEMO_INITIAL_STATE, {
      id: YOU_BID_ID,
      productName: "Your product",
      productSlug: "your-product",
      amount: 9000,
    });

    state = advanceAuction(state);

    const you = state.bids.find((entry) => entry.id === YOU_BID_ID);
    assert.ok(you, "the visitor is still on the board on the very next tick");
    assert.equal(you.amount, 9000, "and at the amount they bid");
  });

  it("carries the visitor across a round reset", () => {
    let state: AuctionState = DEMO_INITIAL_STATE;
    // Run the contenders up to the ceiling first, then join at the bottom.
    for (let tick = 0; tick < 12; tick += 1) state = advanceAuction(state);

    state = applyBid(state, {
      id: YOU_BID_ID,
      productName: "Your product",
      productSlug: "your-product",
      amount: 500,
    });

    let sawReset = false;
    for (let tick = 0; tick < 120 && !sawReset; tick += 1) {
      const before = state.bids.find((entry) => entry.id !== YOU_BID_ID)?.amount ?? 0;
      state = advanceAuction(state);
      const after = state.bids.find((entry) => entry.id !== YOU_BID_ID)?.amount ?? 0;
      if (after < before) sawReset = true;
    }

    assert.ok(sawReset, "the contenders reseeded at some point");
    assert.ok(
      state.bids.some((entry) => entry.id === YOU_BID_ID),
      "the visitor's bid survived the reseed",
    );
  });
});
