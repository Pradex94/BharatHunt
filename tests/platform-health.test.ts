import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { assessJob, JOB_SCHEDULES, nextCronRun, worstHealth } from "../lib/platform-health.ts";

const now = new Date("2026-10-04T12:00:00Z");
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString();

describe("assessJob", () => {
  it("is unknown with no runs", () => {
    assert.equal(assessJob({ lastSuccessAt: null, expectedHours: 1, now }).health, "unknown");
  });

  it("fails when the latest attempt failed, even after an earlier success", () => {
    assert.equal(assessJob({ lastSuccessAt: hoursAgo(2), lastFailureAt: hoursAgo(1), expectedHours: 24, now }).health, "fail");
    assert.equal(assessJob({ lastSuccessAt: null, lastFailureAt: hoursAgo(1), expectedHours: 24, now }).health, "fail");
  });

  it("grades a success by its age against the interval", () => {
    assert.equal(assessJob({ lastSuccessAt: hoursAgo(1), lastFailureAt: hoursAgo(5), expectedHours: 1, now }).health, "ok");
    assert.equal(assessJob({ lastSuccessAt: hoursAgo(2), expectedHours: 1, now }).health, "warn");
    assert.equal(assessJob({ lastSuccessAt: hoursAgo(4), expectedHours: 1, now }).health, "fail");
  });

  it("warns about failing sources on an otherwise healthy job", () => {
    const result = assessJob({ lastSuccessAt: hoursAgo(1), expectedHours: 24, failingSources: 2, now });
    assert.deepEqual(result, { health: "warn", reason: "2 sources failing" });
  });
});

describe("worstHealth", () => {
  it("picks the most severe", () => {
    assert.equal(worstHealth(["ok", "warn", "ok"]), "warn");
    assert.equal(worstHealth(["ok", "unknown", "fail"]), "fail");
    assert.equal(worstHealth([]), "unknown");
  });
});

describe("nextCronRun", () => {
  it("handles hourly and daily schedules in UTC", () => {
    assert.equal(nextCronRun("41 * * * *", now)?.toISOString(), "2026-10-04T12:41:00.000Z");
    assert.equal(nextCronRun("41 * * * *", new Date("2026-10-04T12:45:00Z"))?.toISOString(), "2026-10-04T13:41:00.000Z");
    assert.equal(nextCronRun("17 2 * * *", now)?.toISOString(), "2026-10-05T02:17:00.000Z");
    assert.equal(nextCronRun("*/5 * * * *", now), null);
  });

  it("matches the workflows it describes", () => {
    const crons = ["ingest", "daily-agent", "intelligence"].map((name) =>
      /cron:\s*"([^"]+)"/.exec(readFileSync(`.github/workflows/${name}.yml`, "utf8"))?.[1],
    );
    assert.deepEqual(crons, [JOB_SCHEDULES.ingest.cron, JOB_SCHEDULES.daily5.cron, JOB_SCHEDULES.intelligence.cron]);
  });
});
