import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { analyzeLaunchOpportunities, RECOMMEND_THRESHOLD, scorePlatformFit } from "../lib/launch-agent/fit.ts";
import { analyzeProductSignals, inferTags } from "../lib/launch-agent/signals.ts";
import { parsePlatformRow, validatePlatformInput, type PlatformInput } from "../lib/launch-agent/registry.ts";
import { validateAnalysis, validateKit, validateOverrides, mergeKit } from "../lib/launch-agent/validate.ts";
import { buildUtmUrl, stripUtm, utmSourceFor } from "../lib/launch-agent/utm.ts";
import { buildLaunchTimeline, isDateString, snapToWeekday } from "../lib/launch-agent/timeline.ts";
import { checkRequirements, readinessOf } from "../lib/launch-agent/requirements.ts";
import { canMarkManually, preparedStatus } from "../lib/launch-agent/status.ts";
import { featureAccess } from "../lib/launch-agent/access.ts";
import { authorizeCampaignAccess } from "../lib/launch-agent/ownership.ts";
import { NOW, PLATFORM_ROWS, PLATFORMS, platform, product } from "./launch-agent-fixtures.ts";

describe("product signals", () => {
  it("infers audience tags from the listing, not from nothing", () => {
    const tags = inferTags(product());
    assert.ok(tags.includes("ai"));
    assert.ok(tags.includes("productivity"));
    assert.ok(!tags.includes("developer"), "no developer words, no GitHub link");
  });

  it("matches single words whole, so 'ai' does not fire inside 'maintain'", () => {
    const tags = inferTags(product({ name: "Maintainly", tagline: "Maintain your garden schedule", description: "Plants and watering reminders.", tags: [], category: "Other" }));
    assert.ok(!tags.includes("ai"));
  });

  it("treats a GitHub link as developer and open-source evidence", () => {
    const tags = inferTags(product({ githubUrl: "https://github.com/x/y", category: "Developer Tools" }));
    assert.ok(tags.includes("open_source") && tags.includes("developer"));
  });

  it("scores listing completeness from real fields", () => {
    const full = analyzeProductSignals(product({ videoUrl: "https://youtu.be/x" }), NOW);
    const bare = analyzeProductSignals(product({ description: null, heroImageUrl: null, screenshotUrls: [], websiteUrl: null, makerName: null }), NOW);
    assert.ok(full.completeness.score > 85, `full=${full.completeness.score}`);
    assert.ok(bare.completeness.score < 30, `bare=${bare.completeness.score}`);
    assert.equal(full.ageDays, 0);
  });
});

describe("platform fit", () => {
  it("returns structured, bounded recommendations sorted by fit", () => {
    const analysis = analyzeLaunchOpportunities(product(), PLATFORMS, NOW);
    assert.ok(analysis.productFit >= 0 && analysis.productFit <= 100);
    assert.equal(analysis.recommendations.length, PLATFORMS.length);
    for (let i = 1; i < analysis.recommendations.length; i++) {
      assert.ok(analysis.recommendations[i - 1].fitScore >= analysis.recommendations[i].fitScore);
    }
    const ph = analysis.recommendations.find((rec) => rec.slug === "product-hunt")!;
    assert.equal(ph.automationLevel, "ASSISTED");
    assert.equal(ph.priority, "HIGH");
    assert.match(ph.reason, /Product Hunt/);
    // Round-trips through the validator unchanged in shape.
    assert.deepEqual(validateAnalysis(JSON.parse(JSON.stringify(analysis))), analysis);
  });

  it("keeps a developer-only platform away from a consumer product", () => {
    const signals = analyzeProductSignals(product(), NOW);
    const devhunt = scorePlatformFit(platform("devhunt"), product(), signals);
    assert.ok(devhunt.fitScore <= 30);
    assert.equal(devhunt.recommended, false);
    assert.match(devhunt.reason, /Lower fit/);
  });

  it("recommends DevHunt and Show HN for an open-source developer tool", () => {
    const dev = product({
      name: "QueryLens",
      tagline: "Open source SQL query profiler for Postgres",
      description: "QueryLens is an open source CLI that profiles slow Postgres queries and suggests indexes. Install it with npm and point it at your database.",
      category: "Developer Tools",
      githubUrl: "https://github.com/x/querylens",
      techStack: ["TypeScript", "Postgres"],
      tags: ["database", "cli"],
    });
    const analysis = analyzeLaunchOpportunities(dev, PLATFORMS, NOW);
    const bySlug = Object.fromEntries(analysis.recommendations.map((rec) => [rec.slug, rec]));
    assert.ok(bySlug.devhunt.fitScore >= 75, `devhunt=${bySlug.devhunt.fitScore}`);
    assert.ok(bySlug["show-hn"].recommended);
  });

  it("caps Show HN when there is nothing to try", () => {
    const signals = analyzeProductSignals(product({ websiteUrl: null }), NOW);
    const hn = scorePlatformFit(platform("show-hn"), product({ websiteUrl: null }), signals);
    assert.ok(hn.fitScore <= 25);
  });

  it("ignores inactive platforms", () => {
    const inactive = PLATFORMS.map((p) => (p.slug === "uneed" ? { ...p, active: false } : p));
    const analysis = analyzeLaunchOpportunities(product(), inactive, NOW);
    assert.ok(!analysis.recommendations.some((rec) => rec.slug === "uneed"));
  });

  it("recommends at the documented threshold", () => {
    const analysis = analyzeLaunchOpportunities(product(), PLATFORMS, NOW);
    for (const rec of analysis.recommendations) assert.equal(rec.recommended, rec.fitScore >= RECOMMEND_THRESHOLD);
  });
});

describe("structured output validation", () => {
  it("never throws on malformed analysis and rejects what it cannot use", () => {
    for (const junk of [null, 42, "x", [], { productFit: "high" }]) {
      assert.equal(validateAnalysis(junk), null);
    }
    const partial = validateAnalysis({ productFit: 140, recommendations: [{ slug: "x" }, null, { slug: "ph", platform: "PH", fitScore: 90, priority: "HIGH", automationLevel: "ASSISTED" }] });
    assert.equal(partial?.productFit, 100);
    assert.equal(partial?.recommendations.length, 1);
  });

  it("builds a complete kit from garbage", () => {
    const kit = validateKit({ title: 7, tagline: "<script>alert(1)</script>Hi", hashtags: ["#ok", "bad tag", 3], xThread: "nope" });
    assert.equal(kit.title, "");
    assert.equal(kit.tagline, "alert(1) Hi");
    assert.deepEqual(kit.hashtags, ["#ok"]);
    assert.deepEqual(kit.xThread, []);
  });

  it("validates maker overrides and lays them over generated copy", () => {
    const overrides = validateOverrides({ tagline: "  Mine  ", hashtags: "launch, #india", keywords: "a\nb", unknown: "x", xThread: "one\n\ntwo" });
    assert.deepEqual(overrides, { tagline: "Mine", hashtags: ["#launch", "#india"], keywords: ["a", "b"], xThread: ["one", "two"] });
    const merged = mergeKit({ title: "T", tagline: "Generated" }, overrides);
    assert.equal(merged.title, "T");
    assert.equal(merged.tagline, "Mine");
  });
});

describe("registry", () => {
  it("drops unusable rows and downgrades an inconsistent AUTOMATED row", () => {
    assert.equal(parsePlatformRow({ ...PLATFORM_ROWS[0], website_url: "javascript:alert(1)" }), null);
    assert.equal(parsePlatformRow({ ...PLATFORM_ROWS[0], automation_level: "MAGIC" }), null);
    const lying = parsePlatformRow({ ...PLATFORM_ROWS[0], automation_level: "AUTOMATED", api_supported: false });
    assert.equal(lying?.automationLevel, "ASSISTED");
    const broken = parsePlatformRow({ ...PLATFORM_ROWS[0], requirements: "oops", fit_rules: [1, 2] });
    assert.deepEqual(broken?.requirements, []);
    assert.deepEqual(broken?.fitRules, {});
  });

  const input: PlatformInput = {
    slug: "new-place",
    name: "New Place",
    description: "A place",
    websiteUrl: "https://new.example.com",
    submissionUrl: "",
    guidelinesUrl: "",
    category: "directory",
    automationLevel: "AI_PREPARED",
    apiSupported: false,
    requiresUserAction: true,
    active: true,
    requirementsJson: '[{"key":"name","label":"Name","required":true}]',
    supportedProductTypes: "",
    audienceTags: "saas, indie maker",
    fitRulesJson: "{}",
    contentStyle: "directory",
    launchRulesJson: '{"phase":1}',
    instructions: "",
    adapter: "default",
    priority: 50,
  };

  it("accepts a valid admin form", () => {
    const result = validatePlatformInput(input);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.row.audience_tags, ["saas", "indie_maker"]);
      assert.equal(result.row.submission_url, null);
    }
  });

  it("refuses an AUTOMATED platform without an API, bad JSON and non-https links", () => {
    assert.equal(validatePlatformInput({ ...input, automationLevel: "AUTOMATED" }).ok, false);
    assert.equal(validatePlatformInput({ ...input, requirementsJson: "{not json" }).ok, false);
    assert.equal(validatePlatformInput({ ...input, submissionUrl: "http://insecure.example.com" }).ok, false);
    assert.equal(validatePlatformInput({ ...input, slug: "Bad Slug" }).ok, false);
  });
});

describe("requirements and statuses", () => {
  it("checks the listing, lists manual steps separately and computes readiness", () => {
    const ph = platform("product-hunt");
    const checks = checkRequirements(ph, product(), null);
    const byKey = Object.fromEntries(checks.map((check) => [check.key, check]));
    assert.equal(byKey.website_url.status, "ok");
    assert.equal(byKey.first_comment.status, "missing");
    assert.equal(byKey.first_comment.fix, "generate");
    assert.equal(byKey.video.status, "missing");
    assert.equal(byKey.account.status, "manual");
    const readiness = readinessOf(checks, false);
    assert.ok(readiness > 80 && readiness < 100, `readiness=${readiness}`);
  });

  it("flags missing product information", () => {
    const checks = checkRequirements(platform("product-hunt"), product({ screenshotUrls: [] }), null);
    assert.equal(preparedStatus("ASSISTED", checks), "MISSING_INFORMATION");
    const complete = checkRequirements(platform("product-hunt"), product(), validateKit({ firstComment: "hi", categories: ["x"] }));
    assert.equal(preparedStatus("ASSISTED", complete), "READY_TO_SUBMIT");
    assert.equal(preparedStatus("AI_PREPARED", complete), "READY");
  });

  it("never lets a maker hand-mark an automated platform as published", () => {
    assert.equal(canMarkManually("AUTOMATED", "READY", "PUBLISHED"), false);
    assert.equal(canMarkManually("ASSISTED", "READY_TO_SUBMIT", "SUBMITTED"), true);
    assert.equal(canMarkManually("AI_PREPARED", "NOT_STARTED", "PUBLISHED"), false);
  });
});

describe("timeline", () => {
  it("orders by phase and respects platform weekdays", () => {
    const analysis = analyzeLaunchOpportunities(product(), PLATFORMS, NOW);
    const { start, entries } = buildLaunchTimeline(analysis.recommendations, PLATFORMS, { publishedAt: "2026-09-14T10:00:00Z", now: NOW });
    assert.equal(start, "2026-09-14");
    assert.ok(entries.length > 0);
    for (const entry of entries) assert.ok(isDateString(entry.date) && entry.date >= "2026-09-15");
    const peerlist = entries.find((entry) => entry.slug === "peerlist");
    if (peerlist) assert.equal(new Date(`${peerlist.date}T00:00:00Z`).getUTCDay(), 1);
    const ph = entries.find((entry) => entry.slug === "product-hunt")!;
    const uneed = entries.find((entry) => entry.slug === "uneed")!;
    assert.ok(uneed.date < ph.date, "queue-based directory before the big launch");
    assert.equal(new Set(entries.map((entry) => entry.date)).size, entries.length, "one launch per day");
  });

  it("starts an old launch's plan today, never in the past", () => {
    const analysis = analyzeLaunchOpportunities(product(), PLATFORMS, NOW);
    const { start } = buildLaunchTimeline(analysis.recommendations, PLATFORMS, { publishedAt: "2025-01-01T00:00:00Z", now: NOW });
    assert.equal(start, "2026-09-15");
  });

  it("validates dates strictly", () => {
    assert.equal(isDateString("2026-02-30"), false);
    assert.equal(isDateString("2026-9-1"), false);
    assert.equal(snapToWeekday("2026-09-15", [1]), "2026-09-21");
  });
});

describe("utm links", () => {
  it("tags links without clobbering the maker's own parameters", () => {
    const url = buildUtmUrl("https://x.example.com/path?ref=a&utm_source=mine", "product-hunt");
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get("utm_source"), "mine");
    assert.equal(parsed.searchParams.get("utm_medium"), "launch");
    assert.equal(parsed.searchParams.get("ref"), "a");
    assert.equal(utmSourceFor("show-hn"), "hackernews");
    assert.equal(buildUtmUrl("javascript:alert(1)", "uneed"), "javascript:alert(1)");
    assert.equal(stripUtm(buildUtmUrl("https://x.example.com/?ref=a", "uneed")), "https://x.example.com/?ref=a");
  });
});

describe("access and ownership", () => {
  it("allows every feature for now", () => {
    assert.deepEqual(featureAccess({ userId: "u", feature: "copilot" }), { allowed: true, tier: "free" });
  });

  it("user A cannot read or change user B's campaign", () => {
    const productOfB = { creatorId: "user_B", status: "published" };
    for (const intent of ["read", "write"] as const) {
      const decision = authorizeCampaignAccess({ userId: "user_A", product: productOfB, intent });
      assert.equal(decision.ok, false);
      if (!decision.ok) assert.equal(decision.status, 404, "same answer as not found");
    }
  });

  it("rejects signed-out callers, unpublished products, and admin writes", () => {
    assert.equal(authorizeCampaignAccess({ userId: null, product: { creatorId: "a", status: "published" }, intent: "read" }).ok, false);
    const pending = authorizeCampaignAccess({ userId: "a", product: { creatorId: "a", status: "pending" }, intent: "read" });
    assert.equal(pending.ok, false);
    assert.equal(authorizeCampaignAccess({ userId: "admin", isAdmin: true, product: { creatorId: "a", status: "published" }, intent: "write" }).ok, false);
    assert.deepEqual(authorizeCampaignAccess({ userId: "a", product: { creatorId: "a", status: "published" }, intent: "write" }), { ok: true, role: "owner" });
  });
});
