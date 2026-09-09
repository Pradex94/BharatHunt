import "server-only";

import { createServiceClient } from "@/lib/supabase/service";

/**
 * The reads behind /admin/ai-news.
 *
 * Every function here uses the service-role client, so **callers MUST verify
 * `getIsAdmin()` first** — the same contract `services/admin.ts` and
 * `services/investors.ts` hold. These tables mostly have no read policy at all
 * (`ai_news_sources` and `ai_ingestion_runs` are operational configuration and
 * logs), so this module is the only way to see them, which is exactly why it
 * carries the warning rather than the check: a module that checked would invite
 * a caller that assumed it had.
 */

export type AdminAiSource = {
  id: string;
  name: string;
  source_type: string;
  source_category: string;
  feed_url: string | null;
  api_endpoint: string | null;
  publisher: string | null;
  homepage_url: string | null;
  region: string;
  reliability_score: number;
  enabled: boolean;
  auto_publish: boolean;
  priority: number;
  poll_interval_minutes: number;
  consecutive_failures: number;
  is_healthy: boolean;
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_error_at: string | null;
  last_error: string | null;
  total_articles_seen: number;
};

/** Every configured source, in scheduler order. */
export async function getAiSourcesAdmin(): Promise<AdminAiSource[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("ai_news_sources")
    .select(
      "id, name, source_type, source_category, feed_url, api_endpoint, publisher, homepage_url, region, reliability_score, enabled, auto_publish, priority, poll_interval_minutes, consecutive_failures, is_healthy, last_attempt_at, last_success_at, last_error_at, last_error, total_articles_seen",
    )
    .order("priority", { ascending: true })
    .order("name", { ascending: true })
    .limit(200);

  if (error) throw new Error(`Failed to load AI news sources: ${error.message}`);
  return (data ?? []) as AdminAiSource[];
}

export type AdminAiRun = {
  id: string;
  trigger_source: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  sources_attempted: number;
  sources_succeeded: number;
  sources_failed: number;
  articles_fetched: number;
  articles_relevant: number;
  articles_duplicate: number;
  articles_rejected: number;
  stories_created: number;
  stories_updated: number;
  scores_recomputed: number;
  errors: unknown;
};

/** The ingestion log — the "View ingestion logs" half of section 23. */
export async function getAiIngestionRunsAdmin(limit = 12): Promise<AdminAiRun[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("ai_ingestion_runs")
    .select(
      "id, trigger_source, status, started_at, finished_at, duration_ms, sources_attempted, sources_succeeded, sources_failed, articles_fetched, articles_relevant, articles_duplicate, articles_rejected, stories_created, stories_updated, scores_recomputed, errors",
    )
    .order("started_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to load ingestion runs: ${error.message}`);
  return (data ?? []) as AdminAiRun[];
}

export type AdminAiStory = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  category: string;
  sub_category: string | null;
  region: string;
  status: string;
  is_hidden: boolean;
  featured: boolean;
  trend_score: number | null;
  recency_score: number | null;
  velocity_score: number | null;
  engagement_score: number | null;
  authority_score: number | null;
  source_count: number;
  article_count: number;
  view_count: number;
  first_seen_at: string | null;
  last_seen_at: string | null;
  top_source_name: string | null;
  top_source_url: string | null;
  primary_entity: string | null;
  created_at: string;
};

const ADMIN_STORY_COLUMNS =
  "id, slug, title, summary, category, sub_category, region, status, is_hidden, featured, trend_score, recency_score, velocity_score, engagement_score, authority_score, source_count, article_count, view_count, first_seen_at, last_seen_at, top_source_name, top_source_url, primary_entity, created_at";

/**
 * The review queue: stories the pipeline was not confident enough to publish.
 *
 * Oldest first, the same fairness argument as the launch review queue — a
 * newest-first queue leaves the bottom entry growing staler every time another
 * arrives.
 */
export async function getPendingAiStoriesAdmin(limit = 40): Promise<AdminAiStory[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("ai_stories")
    .select(ADMIN_STORY_COLUMNS)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(`Failed to load pending AI stories: ${error.message}`);
  return (data ?? []) as AdminAiStory[];
}

/** Recent stories in every status, for the management table. */
export async function getRecentAiStoriesAdmin(limit = 60): Promise<AdminAiStory[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("ai_stories")
    .select(ADMIN_STORY_COLUMNS)
    .order("last_seen_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) throw new Error(`Failed to load AI stories: ${error.message}`);
  return (data ?? []) as AdminAiStory[];
}

export type AdminAiArticle = {
  id: string;
  title: string;
  source_name: string;
  source_url: string;
  published_at: string | null;
  fetched_at: string;
  status: string;
  is_ai_related: boolean;
  relevance_score: number | null;
  category: string | null;
  region: string | null;
  rejected_reason: string | null;
  story_id: string | null;
};

/**
 * Incoming articles, newest first — including the rejections.
 *
 * Showing what was thrown away is the point. A classifier nobody can audit is a
 * classifier nobody can fix, and the fastest way to find a bad weight in
 * lib/ai-news/classify.ts is to read a page of things it refused alongside their
 * scores.
 */
export async function getRecentAiArticlesAdmin(limit = 60): Promise<AdminAiArticle[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("ai_news_articles")
    .select(
      "id, title, source_name, source_url, published_at, fetched_at, status, is_ai_related, relevance_score, category, region, rejected_reason, story_id",
    )
    .order("fetched_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to load AI articles: ${error.message}`);
  return (data ?? []) as AdminAiArticle[];
}

export type AdminAiStats = {
  published: number;
  pending: number;
  hidden: number;
  articles: number;
  sourcesEnabled: number;
  sourcesUnhealthy: number;
};

/**
 * The counter row at the top of the admin screen.
 *
 * Six HEAD counts rather than one aggregate query: each is an index-only count
 * that returns a number and no rows, and they run concurrently. A single
 * grouped query would be one round trip but would need a function, and this
 * page is not on anyone's critical path.
 */
export async function getAiAdminStats(): Promise<AdminAiStats> {
  const supabase = createServiceClient();

  const [published, pending, hidden, articles, sources] = await Promise.all([
    supabase
      .from("ai_stories")
      .select("id", { count: "exact", head: true })
      .eq("status", "published")
      .eq("is_hidden", false)
      .then((result) => result.count ?? 0),
    supabase
      .from("ai_stories")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .then((result) => result.count ?? 0),
    supabase
      .from("ai_stories")
      .select("id", { count: "exact", head: true })
      .eq("is_hidden", true)
      .then((result) => result.count ?? 0),
    supabase
      .from("ai_news_articles")
      .select("id", { count: "exact", head: true })
      .then((result) => result.count ?? 0),
    supabase
      .from("ai_news_sources")
      .select("enabled, is_healthy")
      .limit(200)
      .then((result) => result.data ?? []),
  ]);

  return {
    published,
    pending,
    hidden,
    articles,
    sourcesEnabled: sources.filter((source) => source.enabled).length,
    sourcesUnhealthy: sources.filter((source) => source.enabled && !source.is_healthy).length,
  };
}
