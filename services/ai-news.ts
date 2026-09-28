import "server-only";

import { cache } from "react";

import { cacheRemember } from "@/lib/cache";
import { createPublicClient } from "@/lib/supabase/server";
import { isMissingColumnError } from "@/lib/supabase/errors";
import {
  AI_CATEGORY_VALUES,
  AI_SORTS,
  AI_STORIES_PAGE_SIZE,
  AI_TRENDING_LIMIT,
  companyFromParam,
  dateRangeFromParam,
  regionFromParam,
  sinceHoursFor,
  sourceFromParam,
  type AiDateRange,
  type AiRegion,
  type AiSort,
} from "@/lib/ai-news/constants";

/**
 * Every public read for /ai, in one place — the same contract
 * `services/products.ts` holds for the marketplace.
 *
 * Three things are true of everything in this file:
 *
 *  - **It runs on the anon client.** Nothing on /ai is personalised, and the RLS
 *    policies (`status = 'published' and not is_hidden`) are what decide
 *    visibility. Using `createPublicClient` rather than the Clerk-scoped one is
 *    what lets these pages be cached and revalidated instead of re-rendered per
 *    request — see the note in lib/supabase/server.ts.
 *  - **It is cached.** A news page is the same bytes for every visitor between
 *    ingestion runs, so a short Redis TTL absorbs essentially all of the traffic.
 *    Every key shares `AI_NEWS_CACHE_PREFIX`, so one admin action can invalidate
 *    the lot (`cacheInvalidatePrefix`).
 *  - **It never ships the dataset to the browser.** Filtering, searching,
 *    ranking and paging all happen in `ai_story_search`, which returns one page
 *    and a total. Section 8 of the brief is explicit about this and it is also
 *    just how the marketplace already works.
 */

// ── Cache keys / TTLs ────────────────────────────────────────────────────

/** Shared by every key here, so one write can invalidate all of them. */
export const AI_NEWS_CACHE_PREFIX = "bh:ai-news:";

/**
 * Feeds and lists change on every ingestion run, which is every ten minutes at
 * the fastest. Sixty seconds is short enough that a manual run in /admin/ai-news
 * shows up while an admin is still looking at the page, and long enough to
 * absorb a burst of traffic on one story.
 */
const LIST_TTL = 60;

/** Rollups compare 24- and 72-hour windows; a minute of staleness is invisible. */
const AGGREGATE_TTL = 300;

/** The freshness stamp is the one thing a visitor watches tick. */
const FRESHNESS_TTL = 30;

// ── Types ────────────────────────────────────────────────────────────────

/** One story, in the shape every card renders from. */
export type AiStoryCard = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  category: string;
  sub_category: string | null;
  region: string;
  trend_score: number | null;
  source_count: number;
  article_count: number;
  view_count: number;
  first_seen_at: string | null;
  last_seen_at: string | null;
  top_source_name: string | null;
  top_source_url: string | null;
  image_url: string | null;
  featured: boolean;
};

export type AiStoryQuery = {
  q?: string;
  /**
   * Stored category values, not slugs — the page maps the URL token first. An
   * empty array means a topic and a type that contradict each other, and the
   * answer is no stories without a query.
   */
  categories?: string[];
  region?: AiRegion;
  sort?: AiSort;
  page?: number;
  /** Date window; resolved to whole hours so it can sit in a cache key. */
  since?: AiDateRange;
  /** An `ai_entities` slug (a company). */
  company?: string;
  /** A publication name, matched against every article in the story. */
  source?: string;
};

export type AiStoryPage = {
  stories: AiStoryCard[];
  totalCount: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  /**
   * True when a date/company/source filter was asked for but the database has
   * not been migrated to support it (20260929010000). The page says so instead
   * of showing unfiltered stories under a filtered heading.
   */
  filtersUnavailable?: boolean;
};

/**
 * PostgREST's answer when no function matches the named arguments — i.e. the
 * three-filter `ai_story_search` migration has not been applied yet.
 */
function isMissingFunctionSignature(error: { code?: string | null; message?: string | null }): boolean {
  return (
    error.code === "PGRST202" ||
    (error.message ?? "").toLowerCase().includes("could not find the function")
  );
}

/**
 * Every field of a query, validated.
 *
 * `searchAiStories` is reachable from a public Server Action (`loadMoreAiStories`),
 * so its input is whatever a browser sent. Unknown values are dropped rather
 * than forwarded — they would otherwise become cache keys and RPC arguments.
 */
function normalizeQuery(query: AiStoryQuery) {
  const q = typeof query.q === "string" ? query.q.trim().slice(0, 120) || undefined : undefined;
  const categories = Array.isArray(query.categories)
    ? query.categories.filter((value) => AI_CATEGORY_VALUES.includes(value))
    : undefined;
  const sort = (AI_SORTS as readonly string[]).includes(query.sort ?? "")
    ? (query.sort as AiSort)
    : "trending";

  return {
    q,
    categories,
    // An array that arrived empty is the contradiction case; one that became
    // empty because every value was unknown asked for a category that does not
    // exist, and gets the same answer.
    contradictory: Array.isArray(query.categories) && categories?.length === 0,
    region: regionFromParam(query.region),
    sort,
    page: Math.max(1, Math.trunc(Number(query.page) || 1)),
    since: dateRangeFromParam(query.since),
    company: companyFromParam(query.company),
    source: sourceFromParam(query.source),
  };
}

/**
 * The windowed `total_count` off a feed row.
 *
 * `ai_story_search` returns the pagination total on every row (a window
 * function is how you get one without a second query), so it has to come off
 * before the row is handed to a card. Deleted rather than destructured, because
 * a discarded binding is the kind of thing lint flags and a reader has to
 * double-check.
 */
function stripTotal(row: AiStoryCard & { total_count?: number }): AiStoryCard {
  const story = { ...row };
  delete story.total_count;
  return story;
}

// ── The feed ─────────────────────────────────────────────────────────────

/**
 * One page of stories for the given filters.
 *
 * The whole query is a single RPC: filters, free-text search, ordering and the
 * total count for pagination all resolve in one plan against the indexes in
 * 20260910000000. Returning an empty page rather than throwing when the
 * migration has not been applied yet is deliberate — /ai then renders its empty
 * state instead of a 500, which is the same graceful-degradation contract
 * `services/products.ts` keeps for unmigrated columns.
 */
export async function searchAiStories(query: AiStoryQuery = {}): Promise<AiStoryPage> {
  const normalized = normalizeQuery(query);
  const { page } = normalized;
  const pageSize = AI_STORIES_PAGE_SIZE;
  const empty: AiStoryPage = { stories: [], totalCount: 0, page, pageSize, hasMore: false };

  if (normalized.contradictory) return empty;

  const sinceHours = sinceHoursFor(normalized.since);
  const key = `${AI_NEWS_CACHE_PREFIX}feed:${JSON.stringify({
    q: normalized.q ?? "",
    categories: [...(normalized.categories ?? [])].sort(),
    region: normalized.region ?? "",
    sort: normalized.sort,
    page,
    since: sinceHours ?? "",
    company: normalized.company ?? "",
    source: normalized.source ?? "",
  })}`;

  return cacheRemember(key, LIST_TTL, async () => {
    const supabase = createPublicClient();

    // The three newer arguments are only sent when set, so the plain feed keeps
    // calling the six-argument signature and works whether or not
    // 20260929010000 has been applied.
    const hubFilters = {
      ...(sinceHours !== undefined ? { since_hours: sinceHours } : {}),
      ...(normalized.company ? { entity_filter: normalized.company } : {}),
      ...(normalized.source ? { source_filter: normalized.source } : {}),
    };

    const { data, error } = await supabase.rpc("ai_story_search", {
      search_query: normalized.q ?? null,
      category_filter: normalized.categories?.length ? normalized.categories : null,
      region_filter: normalized.region ?? null,
      sort_mode: normalized.sort,
      page_limit: pageSize,
      page_offset: (page - 1) * pageSize,
      ...hubFilters,
    });

    if (error) {
      if (Object.keys(hubFilters).length > 0 && isMissingFunctionSignature(error)) {
        return { ...empty, filtersUnavailable: true };
      }
      if (isMissingColumnError(error)) return empty;
      throw new Error(`Failed to load AI stories: ${error.message}`);
    }

    const rows = (data ?? []) as (AiStoryCard & { total_count: number })[];
    const totalCount = rows[0]?.total_count ?? 0;

    return {
      stories: rows.map(stripTotal),
      totalCount: Number(totalCount),
      page,
      pageSize,
      hasMore: page * pageSize < Number(totalCount),
    };
  });
}

/**
 * The week's stories in trend order — one query that the hub's brief, side
 * stories, highlights and India rail are all cut from.
 *
 * Forty-eight is the RPC's own page ceiling and comfortably more than every
 * section together shows. It never reaches the browser: the sections are server
 * components and only what they render is sent.
 *
 * Falls back to the unwindowed trending order before 20260929010000 is applied;
 * the trend score already decays with age, so that is nearly the same list.
 */
export async function getAiWeekPool(): Promise<AiStoryCard[]> {
  return cacheRemember(`${AI_NEWS_CACHE_PREFIX}week-pool`, LIST_TTL, async () => {
    const supabase = createPublicClient();
    const base = {
      search_query: null,
      category_filter: null,
      region_filter: null,
      sort_mode: "trending",
      page_limit: 48,
      page_offset: 0,
    };

    let { data, error } = await supabase.rpc("ai_story_search", { ...base, since_hours: 24 * 7 });
    if (error && isMissingFunctionSignature(error)) {
      ({ data, error } = await supabase.rpc("ai_story_search", base));
    }
    if (error) return [];
    return ((data ?? []) as (AiStoryCard & { total_count: number })[]).map(stripTotal);
  });
}

/** The "🔥 Trending Now" rail: highest BharatHunt Trend Score, live stories only. */
export async function getTrendingAiStories(
  limit = AI_TRENDING_LIMIT,
  region?: AiRegion,
): Promise<AiStoryCard[]> {
  const key = `${AI_NEWS_CACHE_PREFIX}trending:${limit}:${region ?? "all"}`;

  return cacheRemember(key, LIST_TTL, async () => {
    const supabase = createPublicClient();
    const { data, error } = await supabase.rpc("ai_story_search", {
      search_query: null,
      category_filter: null,
      region_filter: region ?? null,
      sort_mode: "trending",
      page_limit: limit,
      page_offset: 0,
    });

    if (error) return [];
    return ((data ?? []) as (AiStoryCard & { total_count: number })[]).map(stripTotal);
  });
}

/**
 * The single "Top AI Story" card.
 *
 * Never hardcoded (section 6). An admin's `featured` flag wins if one is set —
 * that is what the flag is for — and otherwise it is simply the highest-ranked
 * live story. Returns null when there is nothing published, so the page can
 * render its empty state rather than a card with no content in it.
 */
export async function getFeaturedAiStory(region?: AiRegion): Promise<AiStoryCard | null> {
  const key = `${AI_NEWS_CACHE_PREFIX}featured:${region ?? "all"}`;

  return cacheRemember(key, LIST_TTL, async () => {
    const supabase = createPublicClient();

    const { data: pinned } = await supabase
      .from("ai_stories")
      .select(
        "id, slug, title, summary, category, sub_category, region, trend_score, source_count, article_count, view_count, first_seen_at, last_seen_at, top_source_name, top_source_url, image_url, featured",
      )
      .eq("status", "published")
      .eq("is_hidden", false)
      .eq("featured", true)
      .order("trend_score", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (pinned) return pinned as AiStoryCard;

    const top = await getTrendingAiStories(1, region);
    return top[0] ?? null;
  });
}

/** How many published stories per category, for the filter rail's counts. */
export async function getAiCategoryCounts(): Promise<Record<string, number>> {
  return cacheRemember(`${AI_NEWS_CACHE_PREFIX}category-counts`, AGGREGATE_TTL, async () => {
    const supabase = createPublicClient();
    // Only the category column, so this is an index-only read of the live set
    // rather than a table scan carrying every row's text.
    const { data, error } = await supabase
      .from("ai_stories")
      .select("category")
      .eq("status", "published")
      .eq("is_hidden", false)
      .limit(5000);

    if (error) return {};

    const counts: Record<string, number> = {};
    for (const row of data ?? []) {
      counts[row.category] = (counts[row.category] ?? 0) + 1;
    }
    return counts;
  });
}

// ── One story ────────────────────────────────────────────────────────────

export type AiStoryDetail = AiStoryCard & {
  keywords: string[];
  published_at: string | null;
};

/**
 * A single published story by slug, or null.
 *
 * Wrapped in React `cache()` so the story page and its `generateMetadata` share
 * one round trip instead of querying twice — the same treatment
 * `getPublishedProductBySlug` gets, for the same reason.
 */
export const getAiStoryBySlug = cache(async (slug: string): Promise<AiStoryDetail | null> => {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("ai_stories")
    .select(
      "id, slug, title, summary, category, sub_category, region, trend_score, source_count, article_count, view_count, first_seen_at, last_seen_at, top_source_name, top_source_url, image_url, featured, keywords, published_at",
    )
    .eq("slug", slug)
    .eq("status", "published")
    .eq("is_hidden", false)
    .maybeSingle();

  if (error || !data) return null;
  return data as AiStoryDetail;
});

export type AiCoverageArticle = {
  id: string;
  title: string;
  source_name: string;
  source_url: string;
  published_at: string | null;
  author: string | null;
  external_engagement: number | null;
};

/**
 * The publications covering a story — the "Covered by 4 sources" list.
 *
 * Read with the anon key: `ai_news_articles` has a policy that makes an article
 * visible exactly when its story is, so this needs no elevated privilege and no
 * separate visibility check.
 */
export async function getAiStoryCoverage(storyId: string): Promise<AiCoverageArticle[]> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("ai_news_articles")
    .select("id, title, source_name, source_url, published_at, author, external_engagement")
    .eq("story_id", storyId)
    .neq("status", "rejected")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(30);

  if (error) return [];
  return (data ?? []) as AiCoverageArticle[];
}

export type AiStoryEntity = {
  name: string;
  slug: string;
  entity_type: string;
  website: string | null;
  is_primary: boolean;
};

/** The companies, models, people and tools a story names. */
export async function getAiStoryEntities(storyId: string): Promise<AiStoryEntity[]> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("ai_story_entities")
    .select("is_primary, mentions, entity:ai_entities!ai_story_entities_entity_id_fkey(name, slug, entity_type, website)")
    .eq("story_id", storyId)
    .order("is_primary", { ascending: false })
    .order("mentions", { ascending: false })
    .limit(12);

  if (error) return [];

  return (data ?? [])
    .filter((row): row is typeof row & { entity: NonNullable<typeof row.entity> } => Boolean(row.entity))
    .map((row) => ({
      name: row.entity.name,
      slug: row.entity.slug,
      entity_type: row.entity.entity_type,
      website: row.entity.website,
      is_primary: row.is_primary,
    }));
}

/**
 * The story's score history, newest first (section 15).
 *
 * Used to say "trending up" rather than merely "popular": the page compares the
 * current score with the oldest snapshot in the window it asks for. Returns an
 * empty array for a story we have only observed once, and every caller must
 * treat that as "no direction known" rather than as "flat".
 */
export async function getAiStoryTrendHistory(
  storyId: string,
  hours = 24,
): Promise<{ trend_score: number | null; calculated_at: string }[]> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const supabase = createPublicClient();

  const { data, error } = await supabase
    .from("ai_trend_snapshots")
    .select("trend_score, calculated_at")
    .eq("story_id", storyId)
    .gte("calculated_at", since)
    .order("calculated_at", { ascending: false })
    .limit(48);

  if (error) return [];
  return data ?? [];
}

/** Stories that mention any of the same entities, for "related coverage". */
export async function getRelatedAiStories(
  storyId: string,
  entitySlugs: string[],
  limit = 4,
): Promise<AiStoryCard[]> {
  if (entitySlugs.length === 0) return [];

  const supabase = createPublicClient();
  const { data: entityRows } = await supabase
    .from("ai_entities")
    .select("id")
    .in("slug", entitySlugs.slice(0, 4));

  const entityIds = (entityRows ?? []).map((row) => row.id);
  if (entityIds.length === 0) return [];

  const { data: links } = await supabase
    .from("ai_story_entities")
    .select("story_id")
    .in("entity_id", entityIds)
    .neq("story_id", storyId)
    .limit(40);

  const storyIds = [...new Set((links ?? []).map((row) => row.story_id))].slice(0, 20);
  if (storyIds.length === 0) return [];

  const { data } = await supabase
    .from("ai_stories")
    .select(
      "id, slug, title, summary, category, sub_category, region, trend_score, source_count, article_count, view_count, first_seen_at, last_seen_at, top_source_name, top_source_url, image_url, featured",
    )
    .in("id", storyIds)
    .eq("status", "published")
    .eq("is_hidden", false)
    .order("trend_score", { ascending: false, nullsFirst: false })
    .limit(limit);

  return (data ?? []) as AiStoryCard[];
}

// ── Rollups ──────────────────────────────────────────────────────────────

export type AiTrendingTopic = {
  category: string;
  current_count: number;
  prior_count: number;
  /** Null when the prior window was too small for a percentage to mean anything. */
  change_pct: number | null;
};

export async function getTrendingAiTopics(windowHours = 24): Promise<AiTrendingTopic[]> {
  return cacheRemember(
    `${AI_NEWS_CACHE_PREFIX}topics:${windowHours}`,
    AGGREGATE_TTL,
    async () => {
      const supabase = createPublicClient();
      const { data, error } = await supabase.rpc("ai_trending_topics", {
        window_hours: windowHours,
        min_prior: 3,
        row_limit: 8,
      });
      if (error) return [];
      return (data ?? []) as AiTrendingTopic[];
    },
  );
}

export type AiTrendingEntity = {
  id: string;
  name: string;
  slug: string;
  entity_type: string;
  website: string | null;
  current_count: number;
  prior_count: number;
  change_pct: number | null;
  mentions: number;
  latest_story_title: string | null;
  latest_story_slug: string | null;
  latest_seen_at: string | null;
};

/** "AI Companies Making Noise" (section 18) — and the same call serves models. */
export async function getTrendingAiEntities(
  entityType: "company" | "model" | "person" | "tool" | "topic" = "company",
  windowHours = 72,
  limit = 6,
): Promise<AiTrendingEntity[]> {
  return cacheRemember(
    `${AI_NEWS_CACHE_PREFIX}entities:${entityType}:${windowHours}:${limit}`,
    AGGREGATE_TTL,
    async () => {
      const supabase = createPublicClient();
      const { data, error } = await supabase.rpc("ai_trending_entities", {
        type_filter: entityType,
        window_hours: windowHours,
        min_prior: 2,
        row_limit: limit,
      });
      if (error) return [];
      return (data ?? []) as AiTrendingEntity[];
    },
  );
}

// ── Freshness ────────────────────────────────────────────────────────────

export type AiFreshness = {
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_story_at: string | null;
  stories_24h: number;
  published_total: number;
};

/**
 * When the pipeline last ran, and how much it holds.
 *
 * Everything the hero's "Updated 4 minutes ago" line needs, and everything it
 * needs to *stop* saying that when the pipeline is down. Falls back to a
 * null-everything record rather than throwing: a missing freshness stamp must
 * degrade the header, not the page.
 */
export async function getAiFreshness(): Promise<AiFreshness> {
  const empty: AiFreshness = {
    last_attempt_at: null,
    last_success_at: null,
    last_story_at: null,
    stories_24h: 0,
    published_total: 0,
  };

  return cacheRemember(`${AI_NEWS_CACHE_PREFIX}freshness`, FRESHNESS_TTL, async () => {
    const supabase = createPublicClient();
    const { data, error } = await supabase.rpc("ai_news_freshness");
    if (error || !data?.length) return empty;
    return data[0] as AiFreshness;
  });
}

/**
 * How many live stories have been covered since `since` — the "5 new AI
 * stories" banner in section 25.
 *
 * A HEAD count, so the browser is told a number and never handed the rows. The
 * page then offers a refresh rather than reordering itself under the reader,
 * which is the part of section 25 that actually matters.
 */
export async function countAiStoriesSince(since: string): Promise<number> {
  const supabase = createPublicClient();
  const { count, error } = await supabase
    .from("ai_stories")
    .select("id", { count: "exact", head: true })
    .eq("status", "published")
    .eq("is_hidden", false)
    .gt("published_at", since);

  if (error) return 0;
  return count ?? 0;
}

/** Every live story slug, for the sitemap. */
export async function getAllAiStorySlugs(): Promise<{ slug: string; last_seen_at: string | null }[]> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("ai_stories")
    .select("slug, last_seen_at")
    .eq("status", "published")
    .eq("is_hidden", false)
    .order("last_seen_at", { ascending: false })
    .limit(5000);

  if (error) return [];
  return data ?? [];
}

// ── AI Pulse ─────────────────────────────────────────────────────────────

export type AiPulse = {
  stories_24h: number;
  multi_source_24h: number | null;
  sources_24h: number | null;
  topics_24h: number | null;
  companies_7d: number | null;
  models_7d: number | null;
  tools_7d: number | null;
};

/**
 * The headline counts for the AI Pulse strip, or null before 20260929010000.
 *
 * Every field is a count of published rows over a stated window. The page
 * prints the window with the number and hides a tile whose count is null, so
 * nothing here is ever estimated.
 */
export async function getAiPulse(): Promise<AiPulse | null> {
  return cacheRemember(`${AI_NEWS_CACHE_PREFIX}pulse`, AGGREGATE_TTL, async () => {
    const supabase = createPublicClient();
    const { data, error } = await supabase.rpc("ai_hub_pulse");
    if (error || !data?.length) return null;
    const row = data[0];
    // `bigint` counts: PostgREST sends them as JSON numbers, but Number() keeps
    // this correct if a driver ever hands one back as a string.
    const num = (value: number | null) => (value === null ? null : Number(value));
    return {
      stories_24h: Number(row.stories_24h ?? 0),
      multi_source_24h: num(row.multi_source_24h),
      sources_24h: num(row.sources_24h),
      topics_24h: num(row.topics_24h),
      companies_7d: num(row.companies_7d),
      models_7d: num(row.models_7d),
      tools_7d: num(row.tools_7d),
    };
  });
}

export type AiActiveSource = { source_name: string; story_count: number };

/** Publications with published stories in the last 30 days — the Source filter. */
export async function getAiActiveSources(): Promise<AiActiveSource[]> {
  return cacheRemember(`${AI_NEWS_CACHE_PREFIX}sources:720`, AGGREGATE_TTL, async () => {
    const supabase = createPublicClient();
    const { data, error } = await supabase.rpc("ai_active_sources", {
      window_hours: 720,
      row_limit: 40,
    });
    if (error) return [];
    return (data ?? []).map((row) => ({
      source_name: row.source_name,
      story_count: Number(row.story_count),
    }));
  });
}

// ── The funding tie-in (section 21) ──────────────────────────────────────

export type AiFundingRound = {
  id: string;
  startup_name: string;
  startup_slug: string;
  amount: string | null;
  funding_stage: string;
  investors: string[];
  lead_investor: string | null;
  announcement_date: string;
  source_name: string;
  source_url: string;
};

/**
 * Recent AI funding rounds from the Funding Intelligence dataset.
 *
 * Reads `funding_rounds` directly rather than duplicating any of it: section 21
 * asks for a small section, not a second funding system. The rows are already
 * gated by that feature's own RLS policy (`status = 'published' and not
 * is_hidden`), so this needs no extra check.
 *
 * Degrades to an empty list — and therefore to the section not rendering — when
 * the funding migrations have not been applied. That feature ships on its own
 * schedule and /ai must not depend on it having landed first.
 */
export async function getRecentAiFundingRounds(limit = 5): Promise<AiFundingRound[]> {
  return cacheRemember(`${AI_NEWS_CACHE_PREFIX}funding:${limit}`, AGGREGATE_TTL, async () => {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("funding_rounds")
      .select(
        "id, startup_name, startup_slug, amount, funding_stage, investors, lead_investor, announcement_date, source_name, source_url",
      )
      .eq("industry", "AI")
      .order("announcement_date", { ascending: false })
      .limit(limit);

    if (error) return [];
    return (data ?? []) as AiFundingRound[];
  });
}
