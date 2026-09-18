import "server-only";

import { createServiceClient } from "@/lib/supabase/service";

/**
 * The state of the two ingestion pipelines, for the admin dashboard.
 *
 * Deliberately small: when each last *read* something, and how many of its
 * sources are currently failing. The full logs live on /admin/ai-news and
 * /admin/funding; this is the line that says whether to go and look.
 *
 * Service-role, so callers MUST verify `getIsAdmin()` first.
 */

export type PipelineStatus = {
  /** When the pipeline last read at least one source. Null if never, or unknown. */
  lastFetchAt: string | null;
  /** Who started that run: "cron", "scheduled", "admin"… as recorded. */
  lastTrigger: string | null;
  enabledSources: number;
  /** Enabled sources whose most recent attempt failed. */
  failingSources: number;
};

const UNKNOWN: PipelineStatus = {
  lastFetchAt: null,
  lastTrigger: null,
  enabledSources: 0,
  failingSources: 0,
};

/**
 * AI Trends. `ai_ingestion_runs` gets a row for every run, including the many
 * that find nothing due, so the filter on `sources_attempted` is what turns
 * "last run" into "last time it actually read anything".
 */
async function aiStatus(): Promise<PipelineStatus> {
  const supabase = createServiceClient();
  const [runs, sources] = await Promise.all([
    supabase
      .from("ai_ingestion_runs")
      .select("started_at, trigger_source")
      .gt("sources_attempted", 0)
      .order("started_at", { ascending: false })
      .limit(1),
    supabase
      .from("ai_news_sources")
      .select("consecutive_failures")
      .eq("enabled", true)
      .neq("source_type", "manual"),
  ]);

  if (runs.error || sources.error) {
    console.error(
      `[admin] AI pipeline status unavailable: ${runs.error?.message ?? sources.error?.message}`,
    );
    return UNKNOWN;
  }

  const last = runs.data?.[0];
  return {
    lastFetchAt: last?.started_at ?? null,
    lastTrigger: last?.trigger_source ?? null,
    enabledSources: sources.data.length,
    failingSources: sources.data.filter((row) => (row.consecutive_failures ?? 0) > 0).length,
  };
}

/**
 * Funding. Its log is a row per source per run, written only for sources that
 * were read, so the newest row already is the last real fetch.
 */
async function fundingStatus(): Promise<PipelineStatus> {
  const supabase = createServiceClient();
  const [logs, sources] = await Promise.all([
    supabase
      .from("funding_ingestion_logs")
      .select("started_at, trigger_source")
      .order("started_at", { ascending: false })
      .limit(1),
    supabase
      .from("funding_sources")
      .select("consecutive_failures")
      .eq("enabled", true)
      .neq("source_type", "manual"),
  ]);

  if (logs.error || sources.error) {
    console.error(
      `[admin] funding pipeline status unavailable: ${logs.error?.message ?? sources.error?.message}`,
    );
    return UNKNOWN;
  }

  const last = logs.data?.[0];
  return {
    lastFetchAt: last?.started_at ?? null,
    lastTrigger: last?.trigger_source ?? null,
    enabledSources: sources.data.length,
    failingSources: sources.data.filter((row) => (row.consecutive_failures ?? 0) > 0).length,
  };
}

/** Both pipelines. Never throws: a status line must not take the dashboard down. */
export async function getPipelineStatuses(): Promise<{ ai: PipelineStatus; funding: PipelineStatus }> {
  const [ai, funding] = await Promise.all([
    aiStatus().catch(() => UNKNOWN),
    fundingStatus().catch(() => UNKNOWN),
  ]);
  return { ai, funding };
}
