import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import { getCacheMetrics, isCacheEnabled } from "@/lib/cache";
import { contentHash, KNOWLEDGE_VERSION, type KnowledgeInput } from "@/lib/intelligence/knowledge";
import { normalizeSite } from "@/lib/daily-agent/domain";
import { verifiedCompanyName } from "@/lib/intelligence/connections";
import { duplicateListings, suspiciousInvestorName } from "@/lib/platform-health";

/**
 * Admin → Platform Health: one read of every background system's last
 * success, last failure and backlog, from the tables those systems already
 * write. Nothing new is recorded for this page.
 *
 * Service-role, so callers MUST verify `getIsAdmin()` first. Every block is
 * fail-soft: a table that is missing or a query that fails becomes `error` on
 * that block, never a broken dashboard.
 */

type Block<T> = { ok: true; data: T } | { ok: false; error: string };

async function block<T>(load: () => Promise<T>): Promise<Block<T>> {
  try {
    return { ok: true, data: await load() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function must<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

export type AiNewsHealth = {
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastFailureError: string | null;
  enabledSources: number;
  failingSources: number;
  lastRun: {
    startedAt: string;
    status: string;
    fetched: number;
    relevant: number;
    rejected: number;
    duplicates: number;
    storiesCreated: number;
  } | null;
};

export type FundingHealth = {
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastFailureError: string | null;
  enabledSources: number;
  failingSources: number;
  pendingReview: number;
  publishedRounds: number;
};

export type Daily5Health = {
  lastCompletedAt: string | null;
  lastFailureAt: string | null;
  lastFailureError: string | null;
  latest: { date: string; status: string; published: number; needsReview: number } | null;
  pendingCandidates: number;
};

export type IndexHealth = {
  published: number;
  indexed: number;
  stale: number;
  lastIndexedAt: string | null;
  lastSignalsAt: string | null;
};

export type DataQuality = {
  duplicateListings: { key: string; products: { slug: string; name: string }[] }[];
  uncategorised: number;
  missingLogo: number;
  thinDescription: number;
  missingState: number;
  roundsMissing: { stage: number; location: number; investors: number; total: number };
  suspiciousInvestors: string[];
  unverifiedCompanyNames: { slug: string; name: string; stored: string }[];
};

export type PlatformHealth = {
  checkedAt: string;
  catalogue: Block<{ published: number; pending: number; makers: number; curated: number; publicLists: number }>;
  ai: Block<AiNewsHealth>;
  funding: Block<FundingHealth>;
  daily5: Block<Daily5Health>;
  index: Block<IndexHealth>;
  search: Block<{ searches24h: number; zeroResult24h: number; matches24h: number }>;
  quality: Block<DataQuality>;
  cache: { enabled: boolean; hits: number; misses: number };
  config: { cloudinary: boolean; llmKey: boolean; jobSecret: boolean };
};

const count = { count: "exact" as const, head: true };

export async function getPlatformHealth(): Promise<PlatformHealth> {
  const db = createServiceClient();
  const since24h = new Date(Date.now() - 86_400_000).toISOString();

  const [catalogue, ai, funding, daily5, index, search, quality, cacheMetrics] = await Promise.all([
    block(async () => {
      const [published, pending, makers, curated, publicLists] = await Promise.all([
        db.from("products").select("id", count).eq("status", "published"),
        db.from("products").select("id", count).eq("status", "pending"),
        db.from("profiles").select("id", count),
        db.from("products").select("id", count).eq("status", "published").eq("source", "daily_agent"),
        db.from("user_lists").select("id", count).eq("is_public", true),
      ]);
      for (const result of [published, pending, makers]) if (result.error) throw new Error(result.error.message);
      return {
        published: published.count ?? 0,
        pending: pending.count ?? 0,
        makers: makers.count ?? 0,
        // Optional tables/columns: absent before their migrations.
        curated: curated.error ? 0 : (curated.count ?? 0),
        publicLists: publicLists.error ? 0 : (publicLists.count ?? 0),
      };
    }),

    block<AiNewsHealth>(async () => {
      const [success, failure, latest, sources] = await Promise.all([
        db.from("ai_ingestion_runs").select("started_at").in("status", ["ok", "partial"]).gt("sources_attempted", 0).order("started_at", { ascending: false }).limit(1),
        db.from("ai_ingestion_runs").select("started_at, errors").eq("status", "failed").order("started_at", { ascending: false }).limit(1),
        db
          .from("ai_ingestion_runs")
          .select("started_at, status, articles_fetched, articles_relevant, articles_rejected, articles_duplicate, stories_created")
          .gt("sources_attempted", 0)
          .order("started_at", { ascending: false })
          .limit(1),
        db.from("ai_news_sources").select("consecutive_failures").eq("enabled", true).neq("source_type", "manual"),
      ]);
      const failed = must(failure)[0];
      const run = must(latest)[0];
      const errors = (failed?.errors ?? []) as unknown;
      return {
        lastSuccessAt: must(success)[0]?.started_at ?? null,
        lastFailureAt: failed?.started_at ?? null,
        lastFailureError: Array.isArray(errors) && errors.length > 0 ? JSON.stringify(errors[0]).slice(0, 240) : null,
        enabledSources: must(sources).length,
        failingSources: must(sources).filter((row) => (row.consecutive_failures ?? 0) > 0).length,
        lastRun: run
          ? {
              startedAt: run.started_at,
              status: run.status,
              fetched: run.articles_fetched,
              relevant: run.articles_relevant,
              rejected: run.articles_rejected,
              duplicates: run.articles_duplicate,
              storiesCreated: run.stories_created,
            }
          : null,
      };
    }),

    block<FundingHealth>(async () => {
      const [success, failure, sources, pending, published] = await Promise.all([
        db.from("funding_ingestion_logs").select("started_at").eq("ok", true).order("started_at", { ascending: false }).limit(1),
        db.from("funding_ingestion_logs").select("started_at, error_detail").eq("ok", false).order("started_at", { ascending: false }).limit(1),
        db.from("funding_sources").select("consecutive_failures").eq("enabled", true).neq("source_type", "manual"),
        db.from("funding_rounds").select("id", count).eq("status", "pending"),
        db.from("funding_rounds").select("id", count).eq("status", "published"),
      ]);
      const failed = must(failure)[0];
      return {
        lastSuccessAt: must(success)[0]?.started_at ?? null,
        lastFailureAt: failed?.started_at ?? null,
        lastFailureError: failed?.error_detail?.slice(0, 240) ?? null,
        enabledSources: must(sources).length,
        failingSources: must(sources).filter((row) => (row.consecutive_failures ?? 0) > 0).length,
        pendingReview: pending.count ?? 0,
        publishedRounds: published.count ?? 0,
      };
    }),

    block<Daily5Health>(async () => {
      const live = () => db.from("daily_agent_batches").select("batch_date, status, published_count, needs_review_count, completed_at, updated_at, error_message").eq("agent_type", "daily5").eq("is_dry_run", false);
      const [completed, failed, latest, pending] = await Promise.all([
        live().eq("status", "completed").order("completed_at", { ascending: false, nullsFirst: false }).limit(1),
        live().eq("status", "failed").order("updated_at", { ascending: false }).limit(1),
        live().order("batch_date", { ascending: false }).limit(1),
        db.from("daily_agent_candidates").select("id", count).in("status", ["selected", "needs_review"]),
      ]);
      const lastFailed = must(failed)[0];
      const newest = must(latest)[0];
      return {
        lastCompletedAt: must(completed)[0]?.completed_at ?? null,
        lastFailureAt: lastFailed?.updated_at ?? null,
        lastFailureError: lastFailed?.error_message?.slice(0, 240) ?? null,
        latest: newest
          ? { date: newest.batch_date, status: newest.status, published: newest.published_count, needsReview: newest.needs_review_count }
          : null,
        pendingCandidates: pending.error ? 0 : (pending.count ?? 0),
      };
    }),

    block<IndexHealth>(async () => {
      const [products, intelligence] = await Promise.all([
        db
          .from("products")
          .select("id, name, tagline, description, category, pricing_type, tags, website_url, github_url, launch_state, launch_state_source, source, platform_links, signals_at")
          .eq("status", "published")
          .limit(5000),
        db.from("product_intelligence").select("product_id, content_hash, knowledge_version, indexed_at").limit(5000),
      ]);
      type Row = KnowledgeInput & { signals_at: string | null };
      const rows = must(products) as unknown as Row[];
      const stored = new Map(must(intelligence).map((row) => [row.product_id, `${row.content_hash}:${row.knowledge_version}`]));
      const latest = (values: (string | null)[]) => values.reduce<string | null>((a, b) => (b && (!a || b > a) ? b : a), null);
      return {
        published: rows.length,
        indexed: stored.size,
        stale: rows.filter((row) => stored.get(row.id) !== `${contentHash(row)}:${KNOWLEDGE_VERSION}`).length,
        lastIndexedAt: latest(must(intelligence).map((row) => row.indexed_at)),
        lastSignalsAt: latest(rows.map((row) => row.signals_at)),
      };
    }),

    block(async () => {
      const rows = must(
        await db.from("search_queries").select("result_count, source").gte("created_at", since24h).limit(20000),
      ) as { result_count: number; source?: string | null }[];
      return {
        searches24h: rows.filter((row) => row.source !== "match").length,
        zeroResult24h: rows.filter((row) => row.result_count === 0).length,
        matches24h: rows.filter((row) => row.source === "match").length,
      };
    }),

    block<DataQuality>(async () => {
      const [products, rounds, investors, picks] = await Promise.all([
        db
          .from("products")
          .select("id, slug, name, website_url, category, hero_image_url, description, launch_state")
          .eq("status", "published")
          .limit(5000),
        db.from("funding_rounds").select("funding_stage, location, city, investors").eq("status", "published").limit(5000),
        db.from("funding_investors").select("name").gt("published_deal_count", 0).limit(5000),
        db
          .from("daily_agent_candidates")
          .select("facts, product:products!daily_agent_candidates_product_id_fkey(slug, name, website_url)")
          .eq("status", "published"),
      ]);
      const rows = must(products);
      const roundRows = must(rounds) as { funding_stage: string | null; location: string | null; city: string | null; investors: string[] | null }[];
      return {
        duplicateListings: duplicateListings(rows, (url) => normalizeSite(url)?.key ?? null).map((group) => ({
          key: group.key,
          products: group.products.map(({ slug, name }) => ({ slug, name })),
        })),
        uncategorised: rows.filter((row) => row.category === "Other").length,
        missingLogo: rows.filter((row) => !row.hero_image_url).length,
        thinDescription: rows.filter((row) => (row.description ?? "").trim().length < 40).length,
        missingState: rows.filter((row) => !row.launch_state).length,
        roundsMissing: {
          total: roundRows.length,
          stage: roundRows.filter((row) => !row.funding_stage || row.funding_stage === "Undisclosed").length,
          location: roundRows.filter((row) => !row.location && !row.city).length,
          investors: roundRows.filter((row) => !row.investors?.length).length,
        },
        suspiciousInvestors: must(investors)
          .map((row) => row.name)
          .filter(suspiciousInvestorName)
          .slice(0, 20),
        unverifiedCompanyNames: (picks.error ? [] : (picks.data ?? [])).flatMap((row) => {
          const product = (Array.isArray(row.product) ? row.product[0] : row.product) as
            | { slug: string; name: string; website_url: string | null }
            | null;
          const stored = (row.facts as { companyName?: string | null } | null)?.companyName ?? null;
          if (!product || !stored || verifiedCompanyName(stored, product)) return [];
          return [{ slug: product.slug, name: product.name, stored }];
        }),
      };
    }),

    getCacheMetrics().catch(() => null),
  ]);

  return {
    checkedAt: new Date().toISOString(),
    catalogue,
    ai,
    funding,
    daily5,
    index,
    search,
    quality,
    cache: { enabled: isCacheEnabled(), hits: cacheMetrics?.hits ?? 0, misses: cacheMetrics?.misses ?? 0 },
    config: {
      cloudinary: Boolean(process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME && process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET),
      llmKey: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
      jobSecret: Boolean(process.env.DAILY_AGENT_JOB_SECRET),
    },
  };
}
