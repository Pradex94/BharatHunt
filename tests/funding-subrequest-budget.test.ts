import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createSubrequestBudget,
  FREE_PLAN_SUBREQUEST_LIMIT,
  MAX_SUBREQUESTS_PER_ARTICLE,
  RESERVED_SUBREQUESTS,
  subrequestLimitFromEnv,
} from "../lib/funding/subrequest-budget.ts";

/**
 * These tests stand in for a production incident.
 *
 * The first live ingestion run made ~8 Supabase calls per article across 40
 * articles and hit the Cloudflare Workers Free-plan ceiling of 50 subrequests
 * per invocation. Everything after the fifth article threw — including the two
 * writes that record what happened, so the run reported HTTP 200 and left no
 * trace of having failed. The assertions below are the rules that stop that
 * recurring; the negative ones matter most.
 */

describe("subrequestLimitFromEnv", () => {
  it("falls back to the Free-plan ceiling when unset", () => {
    assert.equal(subrequestLimitFromEnv(undefined), FREE_PLAN_SUBREQUEST_LIMIT);
    assert.equal(subrequestLimitFromEnv(""), FREE_PLAN_SUBREQUEST_LIMIT);
  });

  it("falls back rather than throwing on nonsense", () => {
    // A typo in an environment variable must not stop ingestion, and the
    // fallback is the conservative direction.
    for (const raw of ["abc", "-5", "0", "NaN", " "]) {
      assert.equal(subrequestLimitFromEnv(raw), FREE_PLAN_SUBREQUEST_LIMIT);
    }
  });

  it("accepts a raised ceiling, which is the Workers Paid migration", () => {
    assert.equal(subrequestLimitFromEnv("10000"), 10_000);
    // parseInt semantics: a trailing unit is tolerated rather than rejected.
    assert.equal(subrequestLimitFromEnv("1000ms"), 1000);
  });
});

describe("createSubrequestBudget", () => {
  it("holds back the reserve so the run can always write its own log", () => {
    const budget = createSubrequestBudget(50, 6);
    assert.equal(budget.usable, 44);
    assert.equal(budget.remaining(), 44);
  });

  it("counts what it spends", () => {
    const budget = createSubrequestBudget(50, 6);
    budget.spend();
    budget.spend(3);
    assert.equal(budget.used, 4);
    assert.equal(budget.remaining(), 40);
  });

  it("refuses the article that would cross the line", () => {
    const budget = createSubrequestBudget(20, 6); // usable 14
    budget.spend(10);
    assert.equal(budget.canAfford(4), true);
    assert.equal(budget.canAfford(5), false);
  });

  it("never reports negative headroom once overspent", () => {
    // Over-spending is possible (a helper may cost more than its estimate);
    // reporting a negative remainder would make `canAfford` arithmetic lie.
    const budget = createSubrequestBudget(10, 2);
    budget.spend(50);
    assert.equal(budget.remaining(), 0);
    assert.equal(budget.canAfford(1), false);
  });

  it("treats a negative spend as zero rather than refunding budget", () => {
    const budget = createSubrequestBudget(20, 5);
    budget.spend(-10);
    assert.equal(budget.used, 0);
  });

  it("still leaves work possible when the reserve swallows the limit", () => {
    // Misconfiguration must degrade to "do a little", never to a silent stall.
    const budget = createSubrequestBudget(4, 10);
    assert.equal(budget.usable, 1);
    assert.equal(budget.canAfford(1), true);
  });

  it("defaults to the Free plan", () => {
    const budget = createSubrequestBudget();
    assert.equal(budget.usable, FREE_PLAN_SUBREQUEST_LIMIT - RESERVED_SUBREQUESTS);
  });

  it("fits at least one article on a default Free-plan budget", () => {
    // The property that makes a cold start drain instead of deadlock: if a
    // fresh budget could not afford a single article, every run would stop
    // before doing anything and the backlog would never move.
    const budget = createSubrequestBudget();
    assert.equal(budget.canAfford(MAX_SUBREQUESTS_PER_ARTICLE + 2), true);
  });

  it("stops a Free-plan run before the platform does", () => {
    // Walk a budget the way a run does and assert we stop under 50, not at it.
    const budget = createSubrequestBudget();
    let articles = 0;
    budget.spend(2); // source selection + feed fetch
    budget.spend(); // batched duplicate lookup
    while (budget.canAfford(MAX_SUBREQUESTS_PER_ARTICLE)) {
      budget.spend(MAX_SUBREQUESTS_PER_ARTICLE);
      articles += 1;
    }
    assert.ok(articles >= 1, "a run must make progress");
    assert.ok(
      budget.used + RESERVED_SUBREQUESTS <= FREE_PLAN_SUBREQUEST_LIMIT,
      `used ${budget.used} + reserve must stay inside the platform ceiling`,
    );
  });
});
