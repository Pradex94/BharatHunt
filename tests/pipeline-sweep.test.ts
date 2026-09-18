import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  isUnreadInSweep,
  MAX_SWEEP_BATCHES,
  resolveSweepStart,
  shouldRunAnotherBatch,
  SWEEP_MAX_AGE_MS,
} from "../lib/pipeline-sweep.ts";

const NOW = new Date("2026-09-19T08:00:00.000Z");

describe("resolveSweepStart", () => {
  it("starts a new sweep now when no start is given", () => {
    assert.equal(resolveSweepStart(undefined, NOW)?.toISOString(), NOW.toISOString());
    assert.equal(resolveSweepStart(null, NOW)?.toISOString(), NOW.toISOString());
    assert.equal(resolveSweepStart("", NOW)?.toISOString(), NOW.toISOString());
  });

  it("continues a sweep the server started a few minutes ago", () => {
    const started = new Date(NOW.getTime() - 4 * 60_000).toISOString();
    assert.equal(resolveSweepStart(started, NOW)?.toISOString(), started);
  });

  it("refuses a start older than the maximum age", () => {
    const stale = new Date(NOW.getTime() - SWEEP_MAX_AGE_MS - 1000).toISOString();
    assert.equal(resolveSweepStart(stale, NOW), null);
  });

  it("refuses a start from the future", () => {
    // Would otherwise make every source look unread, for as long as it liked.
    const future = new Date(NOW.getTime() + 60_000).toISOString();
    assert.equal(resolveSweepStart(future, NOW), null);
  });

  it("tolerates a few seconds of clock skew", () => {
    const skewed = new Date(NOW.getTime() + 2000).toISOString();
    assert.ok(resolveSweepStart(skewed, NOW));
  });

  it("refuses something that is not a date", () => {
    assert.equal(resolveSweepStart("yesterday", NOW), null);
  });
});

describe("isUnreadInSweep", () => {
  const sweep = new Date("2026-09-19T08:00:00.000Z");

  it("reads a source never attempted", () => {
    assert.equal(isUnreadInSweep(null, sweep), true);
    assert.equal(isUnreadInSweep(undefined, sweep), true);
  });

  it("reads a source last attempted before the sweep began", () => {
    assert.equal(isUnreadInSweep("2026-09-19T03:00:00.000Z", sweep), true);
  });

  it("skips a source an earlier batch of this sweep already stamped", () => {
    assert.equal(isUnreadInSweep("2026-09-19T08:00:30.000Z", sweep), false);
  });

  it("skips a source stamped at exactly the sweep's start", () => {
    // The first batch runs with a clock at or after the start it was issued;
    // a source it stamps at that same instant must not be read twice.
    assert.equal(isUnreadInSweep(sweep.toISOString(), sweep), false);
  });

  it("reads a source with a timestamp it cannot parse, rather than skip it", () => {
    assert.equal(isUnreadInSweep("not a date", sweep), true);
  });
});

describe("shouldRunAnotherBatch", () => {
  it("stops when a batch read nothing — the normal end", () => {
    assert.equal(shouldRunAnotherBatch(3, 0), false);
  });

  it("continues while batches keep reading sources", () => {
    assert.equal(shouldRunAnotherBatch(1, 8), true);
  });

  it("stops at the cap even if sources keep coming", () => {
    assert.equal(shouldRunAnotherBatch(MAX_SWEEP_BATCHES, 8), false);
  });

  it("converges: a simulated sweep over 26 sources, 8 a batch, ends by itself", () => {
    const sweep = new Date("2026-09-19T08:00:00.000Z");
    const sources = Array.from({ length: 26 }, () => ({ last: "2026-09-18T08:00:00.000Z" }));
    let batches = 0;
    let attempted = 0;
    do {
      const unread = sources.filter((source) => isUnreadInSweep(source.last, sweep)).slice(0, 8);
      unread.forEach((source, index) => {
        source.last = new Date(sweep.getTime() + (batches + 1) * 1000 + index).toISOString();
      });
      attempted = unread.length;
      batches += 1;
    } while (shouldRunAnotherBatch(batches, attempted));

    // 8 + 8 + 8 + 2, then one batch that finds nothing.
    assert.equal(batches, 5);
    assert.ok(sources.every((source) => !isUnreadInSweep(source.last, sweep)));
  });
});
