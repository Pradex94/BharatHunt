"use server";

/**
 * Admin actions for the Daily 5 agent.
 *
 * Same contract as lib/actions/launch-agent-admin.ts: identity, then admin, as
 * the first two statements of every export — each export of a `"use server"`
 * module is a public endpoint. The work itself lives in lib/daily-agent/*,
 * which does no permission checking.
 */

import { revalidatePath } from "next/cache";
import { auth, currentUser } from "@clerk/nextjs/server";

import { isAdminUser } from "@/lib/admin";
import { PRODUCT_CATEGORIES, PRODUCT_PRICING_TYPES } from "@/lib/constants";
import { DAILY5_AGENT, DEFAULT_WEIGHTS, isValidRunTime, isValidTimezone } from "@/lib/daily-agent/config";
import { normalizeSite } from "@/lib/daily-agent/domain";
import { publishCandidate } from "@/lib/daily-agent/publish";
import { advanceBatch, advanceLive, regenerateContent, resumeBatch, startDryRun, type StepResult } from "@/lib/daily-agent/run";
import { HYPE } from "@/lib/daily-agent/safety";
import { DISCOVERY_SOURCES } from "@/lib/daily-agent/sources";
import type { DraftContent } from "@/lib/daily-agent/types";
import {
  getAgentConfig,
  getBatch,
  getCandidate,
  recountBatch,
  transitionCandidate,
  updateAgentConfig,
  updateBatch,
  updateCandidate,
} from "@/services/daily-agent";
import type { Json } from "@/types/database";

type Result = { ok: true; message?: string } | { ok: false; error: string };

async function requireAdmin(): Promise<{ ok: true; actor: string } | { ok: false; error: string }> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Please log in." };
  const user = await currentUser();
  if (!isAdminUser(user)) {
    console.warn(JSON.stringify({ event: "daily_agent_admin_denied", userId, at: new Date().toISOString() }));
    return { ok: false, error: "You do not have access to the Daily 5 agent." };
  }
  return { ok: true, actor: userId };
}

function refresh() {
  revalidatePath("/admin/daily-agent");
}

/** Marks a batch complete once nothing in it waits for a decision. */
async function settleBatch(batchId: string) {
  const counts = await recountBatch(batchId);
  const batch = await getBatch(batchId);
  if (batch?.status === "review" && counts.selected + counts.needs_review + counts.publishing === 0) {
    await updateBatch(batchId, { status: "completed" });
  }
}

function denied(error: string): StepResult {
  return { ok: false, batchId: null, status: null, more: false, message: error };
}

/**
 * One step of a run, for the dashboard's Run buttons. The browser calls again
 * while `more` is true, so each step is its own invocation with its own budget
 * (the same pattern as the ingestion "Run now").
 */
export async function runDailyAgentStep(input: { kind: "dry" | "live"; batchId?: string | null }): Promise<StepResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return denied(admin.error);
  try {
    if (input.batchId) return await advanceBatch(input.batchId);
    if (input.kind === "dry") return await startDryRun(DAILY5_AGENT);
    return await advanceLive(DAILY5_AGENT, "manual");
  } catch (error) {
    return denied(error instanceof Error ? error.message : "The step failed.");
  } finally {
    refresh();
  }
}

export async function resumeDailyBatch(batchId: string): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;
  await resumeBatch(batchId);
  refresh();
  return { ok: true, message: "Batch resumed — press Continue to carry on." };
}

export async function approveDailyCandidate(candidateId: string): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;
  const result = await publishCandidate(candidateId, { actor: admin.actor });
  refresh();
  if (!result.ok) return result;
  return { ok: true, message: `Published at /products/${result.slug}` };
}

export async function rejectDailyCandidate(candidateId: string, note?: string | null): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;
  const row = await transitionCandidate(candidateId, ["selected", "eligible", "needs_review"], {
    status: "rejected",
    reviewed_by: admin.actor,
    reviewed_at: new Date().toISOString(),
    review_note: (note ?? "").trim().slice(0, 1000) || null,
  });
  if (!row) return { ok: false, error: "That candidate is not waiting for a decision." };
  await settleBatch(row.batch_id);
  refresh();
  return { ok: true, message: "Rejected. The agent will not propose this domain again for the cache period." };
}

/** Skip: not today, but not a rejection — it can be proposed again another day. */
export async function skipDailyCandidate(candidateId: string): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;
  const row = await transitionCandidate(candidateId, ["selected", "eligible", "needs_review", "discovered"], {
    status: "skipped",
    status_reason: "Skipped by an admin",
    reviewed_by: admin.actor,
    reviewed_at: new Date().toISOString(),
  });
  if (!row) return { ok: false, error: "That candidate is not waiting for a decision." };
  await settleBatch(row.batch_id);
  refresh();
  return { ok: true, message: "Skipped." };
}

/** Rebuilds the draft from the stored, verified facts. Nothing is refetched. */
export async function regenerateDailyCandidate(candidateId: string): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;
  const candidate = await getCandidate(candidateId);
  if (!candidate) return { ok: false, error: "That candidate no longer exists." };
  if (candidate.status === "published") return { ok: false, error: "Edit the live product instead." };
  if (!candidate.verified_at || Object.keys((candidate.facts ?? {}) as object).length === 0) {
    return { ok: false, error: "This candidate was never verified, so there are no facts to draft from." };
  }
  const config = await getAgentConfig(candidate.agent_type);
  if (!config) return { ok: false, error: "The agent's settings are missing." };
  const previous = (candidate.content ?? {}) as Partial<DraftContent>;
  const content = await regenerateContent(candidate, config);
  await updateCandidate(candidateId, {
    content: { ...content, pricingType: previous.pricingType ?? null } as unknown as Json,
  });
  refresh();
  return { ok: true, message: "Draft regenerated from the verified facts." };
}

export type CandidateEdit = {
  tagline: string;
  shortDescription: string;
  fullDescription: string;
  category: string;
  tags: string;
  pricingType: string;
};

export async function editDailyCandidate(candidateId: string, input: CandidateEdit): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;
  const candidate = await getCandidate(candidateId);
  if (!candidate) return { ok: false, error: "That candidate no longer exists." };
  if (candidate.status === "published") return { ok: false, error: "Edit the live product instead." };

  const tagline = input.tagline.trim();
  if (tagline.length < 10 || tagline.length > 120) return { ok: false, error: "Tagline must be 10–120 characters." };
  if (!(PRODUCT_CATEGORIES as readonly string[]).includes(input.category)) return { ok: false, error: "Choose a category." };
  const pricing = input.pricingType.trim();
  if (pricing && !(PRODUCT_PRICING_TYPES as readonly string[]).includes(pricing)) return { ok: false, error: "Choose a pricing type." };
  const all = `${tagline} ${input.shortDescription} ${input.fullDescription}`;
  if (HYPE.test(all)) {
    return { ok: false, error: "Remove unverifiable superlatives (#1, best, leading, revolutionary…) before saving." };
  }

  const previous = (candidate.content ?? {}) as Partial<DraftContent>;
  const content: DraftContent = {
    tagline,
    shortDescription: input.shortDescription.trim().slice(0, 300),
    fullDescription: input.fullDescription.trim().slice(0, 6000),
    category: input.category,
    tags: input.tags
      .split(",")
      .map((tag) => tag.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/(^-|-$)/g, ""))
      .filter(Boolean)
      .slice(0, 10),
    whyInteresting: previous.whyInteresting ?? "",
    generatedBy: "admin",
    pricingType: (pricing || null) as DraftContent["pricingType"],
  };
  await updateCandidate(candidateId, { content: content as unknown as Json });
  refresh();
  return { ok: true, message: "Saved." };
}

export type SettingsInput = {
  dailyTarget: number;
  runTime: string;
  timezone: string;
  mode: string;
  autoPublishAllowed: boolean;
  enabled: boolean;
  minIndiaConfidence: number;
  minQualityScore: number;
  enabledSources: string[];
  maxDiscoveryCandidates: number;
  maxSitesPerBatch: number;
  maxAiCalls: number;
  maxConcurrentRequests: number;
  requestTimeoutMs: number;
  cacheTtlDays: number;
  notifyEnabled: boolean;
  weights: Record<string, number>;
};

function bounded(value: number, min: number, max: number, label: string): number | string {
  if (!Number.isFinite(value) || value < min || value > max) return `${label} must be between ${min} and ${max}.`;
  return Math.round(value);
}

export async function saveDailyAgentSettings(input: SettingsInput): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;

  if (!isValidRunTime(input.runTime)) return { ok: false, error: "Run time must be HH:MM (24-hour)." };
  if (!isValidTimezone(input.timezone)) return { ok: false, error: "That timezone is not a valid IANA zone (e.g. Asia/Kolkata)." };
  const known = new Set(DISCOVERY_SOURCES.map((source) => source.key));
  if (input.enabledSources.some((key) => !known.has(key))) return { ok: false, error: "Unknown source." };

  const numbers = {
    daily_target: bounded(input.dailyTarget, 1, 25, "Daily target"),
    min_india_confidence: bounded(input.minIndiaConfidence, 0, 100, "Minimum India confidence"),
    min_quality_score: bounded(input.minQualityScore, 0, 100, "Minimum quality score"),
    max_discovery_candidates: bounded(input.maxDiscoveryCandidates, 1, 200, "Maximum discovery candidates"),
    max_sites_per_batch: bounded(input.maxSitesPerBatch, 1, 100, "Maximum sites per batch"),
    max_ai_calls: bounded(input.maxAiCalls, 0, 100, "Maximum AI calls"),
    max_concurrent_requests: bounded(input.maxConcurrentRequests, 1, 8, "Maximum concurrent requests"),
    request_timeout_ms: bounded(input.requestTimeoutMs, 1000, 20000, "Request timeout"),
    cache_ttl_days: bounded(input.cacheTtlDays, 1, 365, "Cache TTL"),
  };
  for (const value of Object.values(numbers)) if (typeof value === "string") return { ok: false, error: value };

  const weights: Record<string, number> = {};
  for (const key of Object.keys(DEFAULT_WEIGHTS)) {
    const value = Number(input.weights[key]);
    if (!Number.isFinite(value) || value < 0 || value > 100) return { ok: false, error: `Weight "${key}" must be 0–100.` };
    weights[key] = Math.round(value);
  }
  if (Object.values(weights).every((weight) => weight === 0)) return { ok: false, error: "At least one weight must be above zero." };

  await updateAgentConfig(DAILY5_AGENT, {
    ...(numbers as Record<keyof typeof numbers, number>),
    run_time: input.runTime,
    timezone: input.timezone,
    mode: input.mode === "auto_publish" ? "auto_publish" : "approval",
    auto_publish_allowed: Boolean(input.autoPublishAllowed),
    enabled: Boolean(input.enabled),
    enabled_sources: input.enabledSources,
    notify_enabled: Boolean(input.notifyEnabled),
    score_weights: weights,
  });
  refresh();
  return { ok: true, message: "Settings saved. They apply from the next batch." };
}

/** Queues product URLs for the next run's manual source. */
export async function queueDailyAgentUrls(text: string): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;
  const urls = text
    .split(/[\s,]+/)
    .map((value) => normalizeSite(value)?.homeUrl ?? null)
    .filter((value): value is string => Boolean(value));
  if (urls.length === 0) return { ok: false, error: "No valid URLs found." };
  const config = await getAgentConfig(DAILY5_AGENT);
  if (!config) return { ok: false, error: "The agent's settings are missing." };
  const merged = [...new Set([...config.manualUrls, ...urls])].slice(0, 50);
  await updateAgentConfig(DAILY5_AGENT, { manual_urls: merged });
  refresh();
  return { ok: true, message: `${urls.length} URL${urls.length === 1 ? "" : "s"} queued for the next run.` };
}
