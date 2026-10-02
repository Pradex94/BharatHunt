/**
 * Agent settings: the defaults, and the one function that turns a
 * `daily_agent_configs` row into values the pipeline can trust.
 *
 * Every number here is a bound on work, so every one is clamped again in code
 * even though the database has check constraints: a config read from an older
 * row, or written by a future migration with a looser check, must still not be
 * able to tell the agent to fetch two hundred websites in one invocation.
 *
 * Framework-agnostic (no `next/*`, no Supabase) so `tests/` can cover it.
 */

import type { ScoreWeights } from "./types.ts";

/** The first agent. Daily 10 or Weekly 25 later are new rows with their own key. */
export const DAILY5_AGENT = "daily5";

export const LOG_PREFIX = "[BHARATHUNT-DAILY5]";

/** The system profile that owns every curated product (see the migration). */
export const CURATOR_PROFILE_ID = "system_bharathunt_curator";

export const DEFAULT_WEIGHTS: ScoreWeights = {
  india: 25,
  completeness: 15,
  website: 15,
  uniqueness: 10,
  launchReadiness: 15,
  relevance: 20,
};

export type AgentConfig = {
  agentType: string;
  label: string;
  enabled: boolean;
  dailyTarget: number;
  /** "HH:MM", local to `timezone`. */
  runTime: string;
  timezone: string;
  mode: "approval" | "auto_publish";
  autoPublishAllowed: boolean;
  minIndiaConfidence: number;
  minQualityScore: number;
  enabledSources: string[];
  /** MAX_DISCOVERY_RESULTS: candidates kept from discovery per batch. */
  maxDiscoveryCandidates: number;
  /** Websites fetched for verification per batch — the expensive stage. */
  maxSitesPerBatch: number;
  /** MAX_AI_CALLS_PER_BATCH. Zero calls are made without ANTHROPIC_API_KEY regardless. */
  maxAiCalls: number;
  /** MAX_CONCURRENT_REQUESTS. */
  maxConcurrentRequests: number;
  /** REQUEST_TIMEOUT, ms. */
  requestTimeoutMs: number;
  /** CACHE_TTL, days: how long a verified site's result is reused instead of refetched. */
  cacheTtlDays: number;
  weights: ScoreWeights;
  filters: Record<string, unknown>;
  notifyEnabled: boolean;
  manualUrls: string[];
};

/** The row as the database returns it — loosely typed on purpose. */
export type AgentConfigRow = {
  agent_type: string;
  label?: string | null;
  enabled?: boolean | null;
  daily_target?: number | null;
  run_time?: string | null;
  timezone?: string | null;
  mode?: string | null;
  auto_publish_allowed?: boolean | null;
  min_india_confidence?: number | null;
  min_quality_score?: number | null;
  enabled_sources?: string[] | null;
  max_discovery_candidates?: number | null;
  max_sites_per_batch?: number | null;
  max_ai_calls?: number | null;
  max_concurrent_requests?: number | null;
  request_timeout_ms?: number | null;
  cache_ttl_days?: number | null;
  score_weights?: unknown;
  filters?: unknown;
  notify_enabled?: boolean | null;
  manual_urls?: string[] | null;
};

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** True when `zone` is an IANA zone this runtime knows. */
export function isValidTimezone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export function isValidRunTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/**
 * Weights from the stored object, each clamped to 0–100. A weight that is
 * missing keeps its default; if every weight is zero the defaults come back,
 * because an all-zero weighting would make every product score 0.
 */
export function parseWeights(raw: unknown): ScoreWeights {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const weights = { ...DEFAULT_WEIGHTS };
  for (const key of Object.keys(DEFAULT_WEIGHTS) as (keyof ScoreWeights)[]) {
    if (source[key] !== undefined) weights[key] = clampInt(source[key], 0, 100, DEFAULT_WEIGHTS[key]);
  }
  const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  return total > 0 ? weights : { ...DEFAULT_WEIGHTS };
}

export function parseConfig(row: AgentConfigRow): AgentConfig {
  const timezone = row.timezone && isValidTimezone(row.timezone) ? row.timezone : "Asia/Kolkata";
  const runTime = row.run_time && isValidRunTime(row.run_time) ? row.run_time : "09:00";
  return {
    agentType: row.agent_type,
    label: row.label?.trim() || "BharatHunt Daily 5",
    enabled: row.enabled !== false,
    dailyTarget: clampInt(row.daily_target, 1, 25, 5),
    runTime,
    timezone,
    mode: row.mode === "auto_publish" ? "auto_publish" : "approval",
    autoPublishAllowed: row.auto_publish_allowed === true,
    minIndiaConfidence: clampInt(row.min_india_confidence, 0, 100, 70),
    minQualityScore: clampInt(row.min_quality_score, 0, 100, 60),
    enabledSources: Array.isArray(row.enabled_sources) ? row.enabled_sources.filter(Boolean) : [],
    maxDiscoveryCandidates: clampInt(row.max_discovery_candidates, 1, 200, 40),
    maxSitesPerBatch: clampInt(row.max_sites_per_batch, 1, 100, 15),
    maxAiCalls: clampInt(row.max_ai_calls, 0, 100, 10),
    maxConcurrentRequests: clampInt(row.max_concurrent_requests, 1, 8, 3),
    requestTimeoutMs: clampInt(row.request_timeout_ms, 1000, 20000, 8000),
    cacheTtlDays: clampInt(row.cache_ttl_days, 1, 365, 30),
    weights: parseWeights(row.score_weights),
    filters:
      row.filters && typeof row.filters === "object" && !Array.isArray(row.filters)
        ? (row.filters as Record<string, unknown>)
        : {},
    notifyEnabled: row.notify_enabled !== false,
    manualUrls: Array.isArray(row.manual_urls) ? row.manual_urls.filter(Boolean) : [],
  };
}

/** Auto-publish needs the mode *and* the kill switch. Either one off means approval. */
export function autoPublishActive(config: AgentConfig): boolean {
  return config.mode === "auto_publish" && config.autoPublishAllowed;
}

/** The parts of a `Date` in `timezone`: its local calendar day and minutes past midnight. */
export function localClock(now: Date, timezone: string): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

/** True once the local clock has reached the configured run time today. */
export function isRunDue(now: Date, config: Pick<AgentConfig, "runTime" | "timezone">): boolean {
  const [hours, minutes] = config.runTime.split(":").map(Number);
  return localClock(now, config.timezone).minutes >= hours * 60 + minutes;
}
