import "server-only";

import { cache } from "react";

import { isMissingTableError } from "@/lib/supabase/errors";
import { createServiceClient } from "@/lib/supabase/service";
import { parseConfig, type AgentConfig, type AgentConfigRow } from "@/lib/daily-agent/config";
import type { ExistingProduct } from "@/lib/daily-agent/domain";
import type { StoredArticle, StoredRound } from "@/lib/daily-agent/sources";
import type { CandidateStatus } from "@/lib/daily-agent/types";
import type { Database, Json } from "@/types/database";

/**
 * Every database read and write the Daily 5 agent makes.
 *
 * All of it goes through the service-role client: the agent's tables have RLS
 * on and no policies (see 20261002000000_daily_agent.sql), so nothing here is
 * reachable from a browser session. Callers are the job route (secret-gated),
 * the admin actions (`getIsAdmin()`-gated) and the public /daily-5 page, which
 * only ever calls the `getPublished…` readers at the bottom — and those select
 * published rows only.
 */

export type BatchRow = Database["public"]["Tables"]["daily_agent_batches"]["Row"];
export type CandidateRow = Database["public"]["Tables"]["daily_agent_candidates"]["Row"];
export type CandidateInsert = Database["public"]["Tables"]["daily_agent_candidates"]["Insert"];
export type CandidateUpdate = Database["public"]["Tables"]["daily_agent_candidates"]["Update"];
export type BatchUpdate = Database["public"]["Tables"]["daily_agent_batches"]["Update"];

// ── Configuration ────────────────────────────────────────────────────────

export async function getAgentConfig(agentType: string): Promise<AgentConfig | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("daily_agent_configs")
    .select("*")
    .eq("agent_type", agentType)
    .maybeSingle();
  // Before 20261002000000 is applied the agent simply is not set up: the hourly
  // scheduler gets a quiet "not set up" rather than a 500 every hour.
  if (error && isMissingTableError(error)) return null;
  if (error) throw new Error(`Could not read the agent settings: ${error.message}`);
  return data ? parseConfig(data as AgentConfigRow) : null;
}

export async function updateAgentConfig(
  agentType: string,
  patch: Database["public"]["Tables"]["daily_agent_configs"]["Update"],
): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase.from("daily_agent_configs").update(patch).eq("agent_type", agentType);
  if (error) throw new Error(`Could not save the agent settings: ${error.message}`);
}

// ── Batches ──────────────────────────────────────────────────────────────

/**
 * Today's live batch, created if it does not exist.
 *
 * The partial unique index on (agent_type, batch_date) for live batches is
 * what makes this idempotent: two callers racing to create today's batch both
 * insert with `ignoreDuplicates`, and both then read the one row that won.
 */
export async function findOrCreateLiveBatch(input: {
  agentType: string;
  batchDate: string;
  trigger: "scheduled" | "manual";
  targetCount: number;
  configSnapshot: Json;
}): Promise<BatchRow> {
  const supabase = createServiceClient();
  const existing = await supabase
    .from("daily_agent_batches")
    .select("*")
    .eq("agent_type", input.agentType)
    .eq("batch_date", input.batchDate)
    .eq("is_dry_run", false)
    .maybeSingle();
  if (existing.data) return existing.data;

  const { error } = await supabase.from("daily_agent_batches").insert({
    agent_type: input.agentType,
    batch_date: input.batchDate,
    is_dry_run: false,
    trigger: input.trigger,
    target_count: input.targetCount,
    config_snapshot: input.configSnapshot,
  });
  // 23505 = the other caller won the race; the read below finds its row.
  if (error && error.code !== "23505") throw new Error(`Could not create today's batch: ${error.message}`);

  const { data, error: readError } = await supabase
    .from("daily_agent_batches")
    .select("*")
    .eq("agent_type", input.agentType)
    .eq("batch_date", input.batchDate)
    .eq("is_dry_run", false)
    .single();
  if (readError || !data) throw new Error(`Could not read today's batch: ${readError?.message ?? "missing"}`);
  return data;
}

export async function createDryRunBatch(input: {
  agentType: string;
  batchDate: string;
  targetCount: number;
  configSnapshot: Json;
}): Promise<BatchRow> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("daily_agent_batches")
    .insert({
      agent_type: input.agentType,
      batch_date: input.batchDate,
      is_dry_run: true,
      trigger: "manual",
      target_count: input.targetCount,
      config_snapshot: input.configSnapshot,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(`Could not start a dry run: ${error?.message ?? "missing"}`);
  return data;
}

export async function getBatch(batchId: string): Promise<BatchRow | null> {
  const supabase = createServiceClient();
  const { data } = await supabase.from("daily_agent_batches").select("*").eq("id", batchId).maybeSingle();
  return data ?? null;
}

export async function listBatches(agentType: string, limit = 30): Promise<BatchRow[]> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("daily_agent_batches")
    .select("*")
    .eq("agent_type", agentType)
    .order("started_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

/**
 * Takes the batch's lease. Atomic: the update only matches when nobody holds
 * an unexpired lease, so the scheduler and the admin's button cannot advance
 * one batch at the same time.
 */
export async function claimBatch(batchId: string, leaseSeconds: number): Promise<BatchRow | null> {
  const supabase = createServiceClient();
  const now = new Date();
  const until = new Date(now.getTime() + leaseSeconds * 1000).toISOString();
  const { data } = await supabase
    .from("daily_agent_batches")
    .update({ locked_until: until })
    .eq("id", batchId)
    .or(`locked_until.is.null,locked_until.lt.${now.toISOString()}`)
    .select("*")
    .maybeSingle();
  return data ?? null;
}

/** Writes the step's results and releases the lease in the same update. */
export async function releaseBatch(batchId: string, patch: BatchUpdate): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("daily_agent_batches")
    .update({ ...patch, locked_until: null })
    .eq("id", batchId);
  if (error) throw new Error(`Could not save the batch: ${error.message}`);
}

export async function updateBatch(batchId: string, patch: BatchUpdate): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase.from("daily_agent_batches").update(patch).eq("id", batchId);
  if (error) throw new Error(`Could not update the batch: ${error.message}`);
}

/**
 * Recomputes the batch's counters from its candidates. Counters are derived,
 * never incremented, so they cannot drift from the rows they count.
 */
export async function recountBatch(batchId: string): Promise<Record<CandidateStatus, number>> {
  const supabase = createServiceClient();
  const { data } = await supabase.from("daily_agent_candidates").select("status").eq("batch_id", batchId);
  const counts = {
    discovered: 0,
    already_exists: 0,
    skipped: 0,
    ineligible: 0,
    needs_review: 0,
    eligible: 0,
    selected: 0,
    publishing: 0,
    published: 0,
    rejected: 0,
  } satisfies Record<CandidateStatus, number>;
  for (const row of data ?? []) {
    const status = row.status as CandidateStatus;
    if (status in counts) counts[status] += 1;
  }
  const total = (data ?? []).length;
  await updateBatch(batchId, {
    discovered_count: total,
    duplicate_count: counts.already_exists,
    skipped_count: counts.skipped,
    ineligible_count: counts.ineligible,
    needs_review_count: counts.needs_review,
    eligible_count: counts.eligible + counts.selected + counts.publishing + counts.published,
    selected_count: counts.selected + counts.publishing + counts.published,
    published_count: counts.published,
    rejected_count: counts.rejected,
  });
  return counts;
}

// ── Candidates ───────────────────────────────────────────────────────────

/** Inserts discovery results; a domain already in the batch is ignored, not duplicated. */
export async function insertCandidates(rows: CandidateInsert[]): Promise<number> {
  if (rows.length === 0) return 0;
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("daily_agent_candidates")
    // `defaultToNull: false`: in a bulk insert, a column some rows omit must
    // take its default, not NULL — rows here differ (a duplicate carries a
    // status and a reason, a fresh candidate does not).
    .upsert(rows, { onConflict: "batch_id,normalized_domain", ignoreDuplicates: true, defaultToNull: false })
    .select("id");
  if (error) throw new Error(`Could not save candidates: ${error.message}`);
  return data?.length ?? 0;
}

export async function getCandidates(batchId: string, statuses?: CandidateStatus[]): Promise<CandidateRow[]> {
  const supabase = createServiceClient();
  let query = supabase
    .from("daily_agent_candidates")
    .select("*")
    .eq("batch_id", batchId)
    .order("rank", { ascending: true, nullsFirst: false })
    .order("overall_score", { ascending: false, nullsFirst: false })
    .order("discovery_score", { ascending: false });
  if (statuses?.length) query = query.in("status", statuses);
  const { data, error } = await query;
  if (error) throw new Error(`Could not read candidates: ${error.message}`);
  return data ?? [];
}

export async function getCandidate(candidateId: string): Promise<CandidateRow | null> {
  const supabase = createServiceClient();
  const { data } = await supabase.from("daily_agent_candidates").select("*").eq("id", candidateId).maybeSingle();
  return data ?? null;
}

export async function updateCandidate(candidateId: string, patch: CandidateUpdate): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase.from("daily_agent_candidates").update(patch).eq("id", candidateId);
  if (error) throw new Error(`Could not update the candidate: ${error.message}`);
}

/**
 * Moves a candidate between statuses only if it is still in one of `from`.
 * The conditional update is the concurrency guard for every admin action:
 * two clicks on Approve leave the second matching nothing.
 */
export async function transitionCandidate(
  candidateId: string,
  from: CandidateStatus[],
  patch: CandidateUpdate,
): Promise<CandidateRow | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("daily_agent_candidates")
    .update(patch)
    .eq("id", candidateId)
    .in("status", from)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`Could not update the candidate: ${error.message}`);
  return data ?? null;
}

/**
 * The most recent verdict for each of these domains in *other* batches, for the
 * verification cache and the "seen recently" rule.
 */
export async function domainHistory(
  keys: string[],
  excludeBatchId: string,
  sinceIso: string,
): Promise<Map<string, CandidateRow>> {
  const history = new Map<string, CandidateRow>();
  if (keys.length === 0) return history;
  const supabase = createServiceClient();
  for (let index = 0; index < keys.length; index += 100) {
    const { data } = await supabase
      .from("daily_agent_candidates")
      .select("*")
      .in("normalized_domain", keys.slice(index, index + 100))
      .neq("batch_id", excludeBatchId)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false });
    for (const row of data ?? []) if (!history.has(row.normalized_domain)) history.set(row.normalized_domain, row);
  }
  return history;
}

/**
 * Every product on BharatHunt, in any status, for the duplicate check — a
 * maker's pending submission is as much a duplicate as a live listing. Paged,
 * because PostgREST caps a single response.
 */
export async function getExistingProducts(): Promise<ExistingProduct[]> {
  const supabase = createServiceClient();
  const products: ExistingProduct[] = [];
  for (let from = 0; from < 20_000; from += 1000) {
    const { data, error } = await supabase
      .from("products")
      .select("id, name, website_url, github_url")
      .order("created_at", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(`Could not read products for the duplicate check: ${error.message}`);
    products.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return products;
}

// ── Discovery queries (the database-backed sources) ──────────────────────

export async function recentArticles(sinceIso: string, limit: number): Promise<StoredArticle[]> {
  const supabase = createServiceClient();
  const [ai, funding] = await Promise.all([
    supabase
      .from("ai_news_articles")
      .select("title, source_url, excerpt, published_at, source_name, source:ai_news_sources(region)")
      .gte("fetched_at", sinceIso)
      .order("fetched_at", { ascending: false })
      .limit(limit),
    supabase
      .from("funding_news")
      .select("title, url, excerpt, published_at, source_name")
      .gte("fetched_at", sinceIso)
      .order("fetched_at", { ascending: false })
      .limit(limit),
  ]);
  const articles: StoredArticle[] = [];
  for (const row of ai.data ?? []) {
    const source = row.source as { region?: string } | { region?: string }[] | null;
    const region = Array.isArray(source) ? source[0]?.region : source?.region;
    articles.push({
      title: row.title,
      url: row.source_url,
      excerpt: row.excerpt,
      publishedAt: row.published_at,
      sourceName: row.source_name,
      region: region === "india" || region === "global" ? region : null,
    });
  }
  for (const row of funding.data ?? []) {
    articles.push({
      title: row.title,
      url: row.url,
      excerpt: row.excerpt,
      publishedAt: row.published_at,
      sourceName: row.source_name,
      region: "india",
    });
  }
  return articles;
}

export async function recentFundingRounds(sinceDate: string, limit: number): Promise<StoredRound[]> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("funding_rounds")
    .select("startup_name, headline, summary, source_url, location, city, announcement_date")
    .eq("status", "published")
    .eq("is_hidden", false)
    .gte("announcement_date", sinceDate)
    .order("announcement_date", { ascending: false })
    .limit(limit);
  return (data ?? []).map((row) => ({
    startupName: row.startup_name,
    headline: row.headline,
    summary: row.summary,
    sourceUrl: row.source_url,
    location: row.location,
    city: row.city,
    announcedOn: row.announcement_date,
  }));
}

// ── Public reads (/daily-5) ──────────────────────────────────────────────

export type Daily5Product = {
  rank: number;
  candidateId: string;
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string | null;
  category: string;
  hero_image_url: string | null;
  website_url: string | null;
  pricing_type: string;
  launch_state: string | null;
  upvote_count: number;
  companyName: string | null;
  city: string | null;
  whyInteresting: string | null;
};

export type Daily5Day = { date: string; products: Daily5Product[] };

const PUBLIC_AGENT = "daily5";

/** The dates that have at least one published product, newest first. */
export const getDaily5Dates = cache(async (limit = 60): Promise<string[]> => {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("daily_agent_batches")
    .select("batch_date")
    .eq("agent_type", PUBLIC_AGENT)
    .eq("is_dry_run", false)
    .gt("published_count", 0)
    .order("batch_date", { ascending: false })
    .limit(limit);
  return (data ?? []).map((row) => row.batch_date);
});

/**
 * One day's published products, in the order the agent ranked them. Only
 * candidates whose product is actually live are returned, so an unpublished,
 * rejected or deleted product never appears.
 */
export const getDaily5Day = cache(async (date: string): Promise<Daily5Day | null> => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const supabase = createServiceClient();
  const { data: batch } = await supabase
    .from("daily_agent_batches")
    .select("id, batch_date")
    .eq("agent_type", PUBLIC_AGENT)
    .eq("batch_date", date)
    .eq("is_dry_run", false)
    .maybeSingle();
  if (!batch) return null;

  const { data } = await supabase
    .from("daily_agent_candidates")
    .select(
      "id, rank, facts, content, product:products!daily_agent_candidates_product_id_fkey(id, slug, name, tagline, description, category, hero_image_url, website_url, pricing_type, launch_state, upvote_count, status)",
    )
    .eq("batch_id", batch.id)
    .eq("status", "published")
    .order("rank", { ascending: true, nullsFirst: false });

  const products: Daily5Product[] = [];
  for (const row of data ?? []) {
    const product = (Array.isArray(row.product) ? row.product[0] : row.product) as
      | (Omit<Daily5Product, "rank" | "candidateId" | "companyName" | "city" | "whyInteresting"> & { status: string })
      | null;
    if (!product || product.status !== "published") continue;
    const facts = (row.facts ?? {}) as { companyName?: string | null; city?: string | null };
    const content = (row.content ?? {}) as { whyInteresting?: string | null };
    products.push({
      ...product,
      upvote_count: product.upvote_count ?? 0,
      rank: products.length + 1,
      candidateId: row.id,
      companyName: facts.companyName ?? null,
      city: facts.city ?? null,
      whyInteresting: content.whyInteresting ?? null,
    });
  }
  return products.length ? { date: batch.batch_date, products } : null;
});
