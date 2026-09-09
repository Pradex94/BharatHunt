import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  computeTrendScore,
  hourBucket,
  trendDirection,
  TREND_WEIGHTS,
  VELOCITY_WINDOW_HOURS,
} from "../lib/ai-news/trend.ts";

/**
 * The BharatHunt Trend Score.
 *
 * Two of these are the brief's own requirements rather than ours: section 16's
 * "eight articles in two hours must beat ten over a month", and section 4's
 * "if there is insufficient data, don't fabricate a score".
 */

const NOW = new Date("2026-09-09T12:00:00Z");
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 60 * 60 * 1000);

describe("the weights", () => {
  it("sum to exactly 1, so the result is already 0..100", () => {
    const total = Object.values(TREND_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
    assert.ok(Math.abs(total - 1) < 1e-9, `weights sum to ${total}`);
  });
});

describe("section 16 — velocity beats history", () => {
  it("ranks 8 articles in 2 hours above 10 articles over 30 days", () => {
    // Story A: a long tail. Ten articles spread across a month, the most recent
    // of them a week old.
    const storyA = computeTrendScore({
      articleTimes: Array.from({ length: 10 }, (_, index) => hoursAgo(24 * (7 + index * 2))),
      sourceCount: 6,
      sourceReliabilities: Array(6).fill(0.85),
      viewCount: 400,
      now: NOW,
    });

    // Story B: a burst. Eight articles inside the last two hours, from four
    // publications, and nobody has read it here yet.
    const storyB = computeTrendScore({
      articleTimes: Array.from({ length: 8 }, (_, index) => hoursAgo(index * 0.25)),
      sourceCount: 4,
      sourceReliabilities: Array(4).fill(0.8),
      viewCount: 0,
      now: NOW,
    });

    assert.ok(
      (storyB.trendScore ?? 0) > (storyA.trendScore ?? 0),
      `burst ${storyB.trendScore} should beat archive ${storyA.trendScore}`,
    );
    // And for the right reason, not by accident.
    assert.ok((storyB.velocity ?? 0) > (storyA.velocity ?? 0));
    assert.ok((storyB.recency ?? 0) > (storyA.recency ?? 0));
  });

  it("measures velocity against the observed span, not the whole window", () => {
    // A two-hour-old story with eight articles is moving at four an hour.
    // Dividing by the six-hour window instead would report 1.3 and let a slower
    // story with a longer history overtake it.
    const burst = computeTrendScore({
      articleTimes: Array.from({ length: 8 }, (_, index) => hoursAgo(index * 0.25)),
      sourceCount: 4,
      sourceReliabilities: [0.8],
      viewCount: 0,
      now: NOW,
    });
    assert.ok((burst.inputs.articlesPerHour ?? 0) > 3);
    assert.equal(burst.inputs.articlesInVelocityWindow, 8);
  });

  it("does not let a syndication burst inside one minute report an absurd rate", () => {
    const spike = computeTrendScore({
      articleTimes: [hoursAgo(0.001), hoursAgo(0.002), hoursAgo(0.003)],
      sourceCount: 3,
      sourceReliabilities: [0.8, 0.8, 0.8],
      viewCount: 0,
      now: NOW,
    });
    // Floored at a quarter hour, so three articles in a minute is 12/hour, not
    // 180/hour. Velocity saturates either way; the point is that the *input* is
    // bounded rather than divided by something approaching zero.
    assert.ok(Number.isFinite(spike.inputs.articlesPerHour ?? 0));
    assert.ok((spike.inputs.articlesPerHour ?? 0) <= 12);
  });

  it("counts nothing outside the velocity window", () => {
    const stale = computeTrendScore({
      articleTimes: [hoursAgo(VELOCITY_WINDOW_HOURS + 1)],
      sourceCount: 1,
      sourceReliabilities: [0.8],
      viewCount: 0,
      now: NOW,
    });
    assert.equal(stale.inputs.articlesInVelocityWindow, 0);
    assert.equal(stale.velocity, 0);
  });
});

describe("section 4 — no score is invented", () => {
  it("returns null when there is no usable publication time", () => {
    const result = computeTrendScore({
      articleTimes: [],
      sourceCount: 3,
      sourceReliabilities: [0.9, 0.9, 0.9],
      viewCount: 1000,
      now: NOW,
    });
    assert.equal(result.trendScore, null);
    assert.equal(result.recency, null);
    assert.equal(result.velocity, null);
    // The parts that *are* known are still returned, so an operator can see
    // why the story is unrankable rather than a blank row.
    assert.ok(result.sources > 0);
    assert.ok(result.authority > 0);
  });

  it("returns null when nothing is covering the story", () => {
    const result = computeTrendScore({
      articleTimes: [hoursAgo(1)],
      sourceCount: 0,
      sourceReliabilities: [],
      viewCount: 0,
      now: NOW,
    });
    assert.equal(result.trendScore, null);
  });

  it("ignores a future timestamp rather than pinning recency at 100", () => {
    const future = new Date(NOW.getTime() + 48 * 60 * 60 * 1000);
    const result = computeTrendScore({
      articleTimes: [future],
      sourceCount: 1,
      sourceReliabilities: [0.8],
      viewCount: 0,
      now: NOW,
    });
    // The only timestamp was discarded, so there is nothing left to rank on.
    assert.equal(result.trendScore, null);
  });
});

describe("bounds and monotonicity", () => {
  it("stays inside 0..100 at both extremes", () => {
    const max = computeTrendScore({
      articleTimes: Array.from({ length: 50 }, () => NOW),
      sourceCount: 60,
      sourceReliabilities: Array(60).fill(1),
      viewCount: 1_000_000,
      externalEngagement: 1_000_000,
      now: NOW,
    });
    assert.ok((max.trendScore ?? 0) <= 100);

    const min = computeTrendScore({
      articleTimes: [hoursAgo(24 * 365)],
      sourceCount: 1,
      sourceReliabilities: [0],
      viewCount: 0,
      now: NOW,
    });
    assert.ok((min.trendScore ?? 0) >= 0);
  });

  it("scores a story higher as more independent sources cover it", () => {
    const score = (sourceCount: number) =>
      computeTrendScore({
        articleTimes: [hoursAgo(1)],
        sourceCount,
        sourceReliabilities: Array(sourceCount).fill(0.8),
        viewCount: 0,
        now: NOW,
      }).trendScore ?? 0;

    assert.ok(score(1) < score(3));
    assert.ok(score(3) < score(6));
  });

  it("prefers an official announcement to an aggregator link, all else equal", () => {
    const official = computeTrendScore({
      articleTimes: [hoursAgo(1)],
      sourceCount: 1,
      sourceReliabilities: [0.98],
      viewCount: 0,
      now: NOW,
    });
    const aggregator = computeTrendScore({
      articleTimes: [hoursAgo(1)],
      sourceCount: 1,
      sourceReliabilities: [0.4],
      viewCount: 0,
      now: NOW,
    });
    assert.ok((official.trendScore ?? 0) > (aggregator.trendScore ?? 0));
  });

  it("decays with the clock even when nothing changes", () => {
    const article = [hoursAgo(0)];
    const fresh = computeTrendScore({
      articleTimes: article,
      sourceCount: 3,
      sourceReliabilities: [0.8, 0.8, 0.8],
      viewCount: 0,
      now: NOW,
    });
    const later = computeTrendScore({
      articleTimes: article,
      sourceCount: 3,
      sourceReliabilities: [0.8, 0.8, 0.8],
      viewCount: 0,
      now: new Date(NOW.getTime() + 24 * 60 * 60 * 1000),
    });
    assert.ok((later.trendScore ?? 0) < (fresh.trendScore ?? 0));
  });

  it("counts an external engagement figure alongside first-party views", () => {
    const withHn = computeTrendScore({
      articleTimes: [hoursAgo(1)],
      sourceCount: 2,
      sourceReliabilities: [0.8, 0.45],
      viewCount: 0,
      externalEngagement: 400,
      now: NOW,
    });
    const without = computeTrendScore({
      articleTimes: [hoursAgo(1)],
      sourceCount: 2,
      sourceReliabilities: [0.8, 0.45],
      viewCount: 0,
      now: NOW,
    });
    assert.ok((withHn.trendScore ?? 0) > (without.trendScore ?? 0));
  });
});

describe("hourBucket", () => {
  it("is the UTC hour, matching the CHECK on ai_trend_snapshots.bucket_hour", () => {
    assert.equal(hourBucket(new Date("2026-09-09T12:34:56Z")), "2026-09-09T12");
    assert.match(hourBucket(NOW), /^\d{4}-\d{2}-\d{2}T\d{2}$/);
  });

  it("puts two runs in the same hour in the same bucket, so a re-run is an upsert", () => {
    assert.equal(
      hourBucket(new Date("2026-09-09T12:00:00Z")),
      hourBucket(new Date("2026-09-09T12:59:59Z")),
    );
  });
});

describe("trendDirection", () => {
  it("is null with nothing to compare against — not 'flat'", () => {
    // Section 15's whole point: a story observed once is popular, and only a
    // story we have watched climb is trending.
    assert.equal(trendDirection(80, null), null);
    assert.equal(trendDirection(null, 40), null);
  });

  it("reports a real rise and a real fall", () => {
    assert.deepEqual(trendDirection(80, 60), { direction: "up", delta: 20 });
    assert.deepEqual(trendDirection(40, 70), { direction: "down", delta: -30 });
  });

  it("calls a small wobble flat rather than a trend", () => {
    assert.equal(trendDirection(62, 60)?.direction, "flat");
  });
});
