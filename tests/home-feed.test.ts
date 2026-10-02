import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildLaunchBoard, pickRecentLaunches, pickTodaysHunt } from "../lib/home-feed.ts";

// 29 Sep 2026, 15:00 IST.
const NOW = new Date("2026-09-29T09:30:00Z");

function launch(id: string, publishedAt: string | null, upvotes = 0, trend = 0) {
  return { id, published_at: publishedAt, upvote_count: upvotes, trend_score: trend };
}

describe("buildLaunchBoard — the heading is always true of the rows", () => {
  it("uses today's launches when today has enough of them", () => {
    const pool = [
      launch("a", "2026-09-29T04:00:00Z", 3),
      launch("b", "2026-09-29T05:00:00Z", 9),
      launch("c", "2026-09-29T06:00:00Z", 1),
      launch("old", "2026-09-20T06:00:00Z", 50),
    ];
    const board = buildLaunchBoard(pool, [], NOW);
    assert.deepEqual(board.scope, { kind: "today", day: "2026-09-29" });
    assert.deepEqual(
      board.products.map((p) => [p.id, p.rank]),
      [["b", 1], ["a", 2], ["c", 3]],
    );
  });

  it("counts a launch at 00:25 IST as that day, not the previous UTC day", () => {
    // 28 Sep 18:55 UTC is 29 Sep 00:25 IST.
    const pool = [
      launch("a", "2026-09-28T18:55:00Z"),
      launch("b", "2026-09-29T02:00:00Z"),
      launch("c", "2026-09-29T03:00:00Z"),
    ];
    assert.equal(buildLaunchBoard(pool, [], NOW).scope.kind, "today");
  });

  it("names an older day rather than calling it today", () => {
    const pool = ["a", "b", "c"].map((id) => launch(id, "2026-09-27T06:00:00Z"));
    assert.deepEqual(buildLaunchBoard(pool, [], NOW).scope, { kind: "day", day: "2026-09-27" });
  });

  it("widens to the week when the latest day is thin", () => {
    const pool = [
      launch("a", "2026-09-29T04:00:00Z", 1),
      launch("b", "2026-09-26T04:00:00Z", 7),
      launch("c", "2026-09-24T04:00:00Z", 2),
      launch("too-old", "2026-09-10T04:00:00Z", 99),
    ];
    const board = buildLaunchBoard(pool, [], NOW);
    assert.equal(board.scope.kind, "week");
    assert.deepEqual(
      board.products.map((p) => p.id),
      ["b", "c", "a"],
    );
  });

  it("falls back to the all-time board when the week is thin too", () => {
    const pool = [launch("a", "2026-09-29T04:00:00Z")];
    const allTime = [launch("x", "2026-01-01T00:00:00Z", 40), launch("y", null, 60)];
    const board = buildLaunchBoard(pool, allTime, NOW);
    assert.equal(board.scope.kind, "all-time");
    assert.deepEqual(
      board.products.map((p) => [p.id, p.rank]),
      [["y", 1], ["x", 2]],
    );
  });

  it("caps the board at five", () => {
    const pool = Array.from({ length: 8 }, (_, i) => launch(`p${i}`, "2026-09-29T04:00:00Z", i));
    assert.equal(buildLaunchBoard(pool, [], NOW).products.length, 5);
  });
});

describe("pickTodaysHunt", () => {
  it("ranks by 24-hour activity, then upvotes, then recency", () => {
    const pool = [
      launch("quiet-new", "2026-09-29T04:00:00Z", 0, 0),
      launch("busy", "2026-09-20T04:00:00Z", 1, 30),
      launch("upvoted", "2026-09-21T04:00:00Z", 8, 0),
    ];
    assert.deepEqual(
      pickTodaysHunt(pool).map((p) => p.id),
      ["busy", "upvoted", "quiet-new"],
    );
  });

  it("treats a numeric-string trend score as a number", () => {
    const pool = [
      { ...launch("a", null), trend_score: "4" },
      { ...launch("b", null), trend_score: "12" },
    ];
    assert.deepEqual(
      pickTodaysHunt(pool).map((p) => p.id),
      ["b", "a"],
    );
  });
});

describe("pickRecentLaunches", () => {
  it("is newest first and never repeats a card shown above it", () => {
    const pool = [
      launch("a", "2026-09-27T04:00:00Z"),
      launch("b", "2026-09-29T04:00:00Z"),
      launch("c", "2026-09-28T04:00:00Z"),
    ];
    assert.deepEqual(
      pickRecentLaunches(pool, ["b"]).map((p) => p.id),
      ["c", "a"],
    );
  });
});

describe("curated Daily 5 picks never compete in the rankings", () => {
  const curated = (id: string, publishedAt: string, upvotes: number) => ({
    ...launch(id, publishedAt, upvotes, 99),
    source: "daily_agent",
  });

  it("keeps a curated pick out of Today's Hunt however much it trends", () => {
    const pool = [curated("bot", "2026-09-29T05:00:00Z", 50), launch("maker", "2026-09-29T04:00:00Z", 1)];
    assert.deepEqual(pickTodaysHunt(pool).map((p) => p.id), ["maker"]);
  });

  it("builds the daily board from maker launches only", () => {
    const pool = [
      curated("bot", "2026-09-29T05:00:00Z", 50),
      launch("a", "2026-09-29T04:00:00Z", 3),
      launch("b", "2026-09-29T04:30:00Z", 2),
      launch("c", "2026-09-29T06:00:00Z", 1),
    ];
    const board = buildLaunchBoard(pool, [], NOW);
    assert.deepEqual(board.products.map((p) => p.id), ["a", "b", "c"]);
  });

  it("still lists a curated pick under Recently launched", () => {
    const pool = [curated("bot", "2026-09-29T05:00:00Z", 0), launch("maker", "2026-09-29T04:00:00Z")];
    assert.deepEqual(pickRecentLaunches(pool, []).map((p) => p.id), ["bot", "maker"]);
  });
});
