import "server-only";

import { createServiceClient } from "@/lib/supabase/service";

/**
 * Admin reads for /admin/funding.
 *
 * Everything here uses the service-role client, which bypasses RLS — so every
 * caller MUST have verified `getIsAdmin()` first. That is the same contract
 * `services/admin.ts` and `services/investors.ts` carry, and the page enforces
 * it before it renders anything.
 *
 * These are the only reads in the codebase that can see a pending round, a
 * rejected article or a source's `api_endpoint`. The public tables have no
 * policy admitting any of it (20260909000000), which is why the admin screen
 * cannot be built on the ordinary client.
 */

export type AdminFundingRound = {
  id: string;
  startup_name: string;
  startup_slug: string;
  headline: string;
  summary: string | null;
  amount: string | null;
  amount_numeric: number | null;
  currency: string | null;
  amount_inr: number | null;
  funding_stage: string;
  industry: string | null;
  location: string | null;
  city: string | null;
  investors: string[];
  lead_investor: string | null;
  announcement_date: string;
  source_name: string;
  source_url: string;
  source_published_at: string | null;
  status: string;
  is_featured: boolean;
  is_hidden: boolean;
  verified: boolean;
  confidence_score: number | null;
  extraction_method: string | null;
  review_note: string | null;
  created_at: string;
};

const ADMIN_ROUND_COLUMNS =
  "id, startup_name, startup_slug, headline, summary, amount, amount_numeric, currency, amount_inr, funding_stage, industry, location, city, investors, lead_investor, announcement_date, source_name, source_url, source_published_at, status, is_featured, is_hidden, verified, confidence_score, extraction_method, review_note, created_at";

/**
 * The review queue: rounds nobody has decided on.
 *
 * Ordered by confidence ascending, then oldest first. That is a deliberate
 * departure from the launch review queue in `services/admin.ts`, which is
 * strictly oldest-first for fairness — fairness is the right principle when a
 * person is waiting on the other end of the queue, and nobody is waiting here.
 * What matters instead is that the records most likely to be *wrong* are the
 * ones a reviewer sees first, because those are the ones where review changes
 * the outcome.
 */
export async function getFundingReviewQueue(limit = 100): Promise<AdminFundingRound[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("funding_rounds")
    .select(ADMIN_ROUND_COLUMNS)
    .in("status", ["pending", "processed", "error"])
    .order("confidence_score", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    // An unmigrated deploy has no such table, and an empty queue is the
    // truthful answer for that state — the rest of /admin/funding still works.
    console.error(`[admin] funding review queue unavailable: ${error.message}`);
    return [];
  }
  return (data ?? []) as AdminFundingRound[];
}

/** Recently published rounds, so an admin can feature, hide or correct one. */
export async function getPublishedFundingRounds(limit = 100): Promise<AdminFundingRound[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("funding_rounds")
    .select(ADMIN_ROUND_COLUMNS)
    .eq("status", "published")
    .order("announcement_date", { ascending: false })
    .limit(limit);

  if (error) {
    console.error(`[admin] published funding rounds unavailable: ${error.message}`);
    return [];
  }
  return (data ?? []) as AdminFundingRound[];
}

export type AdminFundingSource = {
  id: string;
  name: string;
  source_type: string;
  feed_url: string | null;
  api_endpoint: string | null;
  publisher: string | null;
  enabled: boolean;
  priority: number;
  poll_interval_minutes: number;
  consecutive_failures: number;
  is_healthy: boolean;
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_error_at: string | null;
  last_error: string | null;
};

export async function getFundingSources(): Promise<AdminFundingSource[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("funding_sources")
    .select(
      "id, name, source_type, feed_url, api_endpoint, publisher, enabled, priority, poll_interval_minutes, consecutive_failures, is_healthy, last_attempt_at, last_success_at, last_error_at, last_error",
    )
    .order("priority", { ascending: true });

  if (error) {
    console.error(`[admin] funding sources unavailable: ${error.message}`);
    return [];
  }
  return (data ?? []) as AdminFundingSource[];
}

export type IngestionRunSummary = {
  runId: string;
  startedAt: string;
  completedAt: string | null;
  durationMs: number;
  trigger: string;
  sources: number;
  articlesFetched: number;
  articlesCreated: number;
  duplicates: number;
  roundsCreated: number;
  rejected: number;
  errors: number;
  ok: boolean;
  failures: { source: string; error: string }[];
};

/**
 * The last few ingestion runs, folded from per-source log rows into one line
 * each.
 *
 * The table stores a row per source per run because that is what makes "which
 * feed failed" answerable; the screen wants "what happened at 14:05". Grouping
 * in TypeScript rather than SQL keeps the aggregate shape next to the component
 * that renders it, and the row count is bounded by the limit below.
 */
export async function getRecentIngestionRuns(runs = 8): Promise<IngestionRunSummary[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("funding_ingestion_logs")
    .select(
      "run_id, source_name, started_at, completed_at, duration_ms, articles_fetched, articles_created, duplicates, rounds_created, rejected, errors, error_detail, ok, trigger_source",
    )
    .order("started_at", { ascending: false })
    // Generous enough to cover `runs` whole runs even when every source ran.
    .limit(runs * 12);

  if (error) {
    console.error(`[admin] ingestion logs unavailable: ${error.message}`);
    return [];
  }

  const grouped = new Map<string, IngestionRunSummary>();

  for (const row of data ?? []) {
    const existing = grouped.get(row.run_id);
    const summary: IngestionRunSummary = existing ?? {
      runId: row.run_id,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      durationMs: 0,
      trigger: row.trigger_source,
      sources: 0,
      articlesFetched: 0,
      articlesCreated: 0,
      duplicates: 0,
      roundsCreated: 0,
      rejected: 0,
      errors: 0,
      ok: true,
      failures: [],
    };

    summary.sources += 1;
    summary.articlesFetched += row.articles_fetched;
    summary.articlesCreated += row.articles_created;
    summary.duplicates += row.duplicates;
    summary.roundsCreated += row.rounds_created;
    summary.rejected += row.rejected;
    summary.errors += row.errors;
    summary.durationMs += row.duration_ms ?? 0;

    // The run started when its earliest source did and ended when its latest
    // finished; rows arrive newest-first, so both ends have to be tracked.
    if (row.started_at < summary.startedAt) summary.startedAt = row.started_at;
    if (row.completed_at && (!summary.completedAt || row.completed_at > summary.completedAt)) {
      summary.completedAt = row.completed_at;
    }

    if (!row.ok) {
      summary.ok = false;
      summary.failures.push({
        source: row.source_name,
        error: row.error_detail ?? "Unknown error",
      });
    }

    grouped.set(row.run_id, summary);
  }

  return [...grouped.values()]
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
    .slice(0, runs);
}

export type AdminFundingStats = {
  pending: number;
  published: number;
  rejected: number;
  articles: number;
  startups: number;
  investors: number;
  lastSuccessfulRunAt: string | null;
};

/**
 * The counters across the top of the admin screen.
 *
 * Six `head: true` counts rather than one aggregate query: PostgREST answers a
 * head request with the count in a header and no rows, so each is cheap, and
 * the alternative is an RPC that exists only to serve one panel.
 */
export async function getAdminFundingStats(): Promise<AdminFundingStats> {
  const supabase = createServiceClient();

  const count = async (
    table: "funding_rounds" | "funding_news" | "funding_startups" | "funding_investors",
    status?: string[],
  ): Promise<number> => {
    let query = supabase.from(table).select("id", { count: "exact", head: true });
    if (status) query = query.in("status", status);
    const { count: total, error } = await query;
    if (error) return 0;
    return total ?? 0;
  };

  const [pending, published, rejected, articles, startups, investors, lastRun] = await Promise.all([
    count("funding_rounds", ["pending", "processed", "error"]),
    count("funding_rounds", ["published"]),
    count("funding_rounds", ["rejected"]),
    count("funding_news"),
    count("funding_startups"),
    count("funding_investors"),
    supabase
      .from("funding_ingestion_logs")
      .select("completed_at")
      .eq("ok", true)
      .order("completed_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    pending,
    published,
    rejected,
    articles,
    startups,
    investors,
    lastSuccessfulRunAt: lastRun.data?.completed_at ?? null,
  };
}
