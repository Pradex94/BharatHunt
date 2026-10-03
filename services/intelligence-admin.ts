import "server-only";

import { getCacheMetrics, isCacheEnabled } from "@/lib/cache";
import { isMissingTableError } from "@/lib/supabase/errors";
import { createServiceClient } from "@/lib/supabase/service";
import { contentHash, KNOWLEDGE_VERSION, type KnowledgeInput } from "@/lib/intelligence/knowledge";
import { conceptLabel } from "@/lib/intelligence/concepts";
import { queryConcepts } from "@/services/intelligence";
import { getComparePairs } from "@/services/compare-pairs";

/**
 * Read-only numbers for /admin/intelligence — the Product Intelligence
 * dashboard. Service role (admin page, gated by the caller). Every figure is
 * read from a table or derived with the same helper the live system uses;
 * nothing is estimated. "Needs re-index" uses the indexer's own content hash,
 * so it reports what the next run will actually do.
 *
 * Cost: a handful of narrow reads over bounded windows (30 days of daily
 * rollups, 30 days of searches). It runs only when an admin opens the page.
 */

export type SignalTotals = {
  visitors: number;
  views: number;
  websiteClicks: number;
  saves: number;
  compares: number;
  matchImpressions: number;
  matchClicks: number;
  searchClicks: number;
  upvotes: number;
  comments: number;
};

type RankedProduct = { slug: string; name: string; value: number };

export type IntelligenceStatus = {
  migrationApplied: boolean;
  published: number;
  indexed: number;
  stale: number;
  withoutSimilar: number;
  similarityRows: number;
  comparePages: number;
  lastIndexedAt: string | null;
  lastSignalsAt: string | null;
  topConcepts: { key: string; label: string; products: number }[];
  signals7d: SignalTotals;
  signals30d: SignalTotals;
  /** Oldest first, 14 IST days: unique visitors and weighted engagement events. */
  daily: { day: string; visitors: number; actions: number }[];
  eventsToday: number;
  trending: RankedProduct[];
  rising: RankedProduct[];
  mostSaved: RankedProduct[];
  mostCompared: RankedProduct[];
  totalSaves: number;
  match: { searches30d: number; zeroResult30d: number; impressions30d: number; clicks30d: number };
  zeroResultMatches: { query: string; searches: number }[];
  marketplaceSearches30d: number;
  topSearches: { query: string; searches: number }[];
  zeroResultSearches: { query: string; searches: number; readAs: string[] }[];
  lists: { total: number; public: number; items: number };
  cache: { enabled: boolean; hits: number; misses: number } ;
};

const PRODUCT_COLUMNS =
  "id, slug, name, tagline, description, category, pricing_type, tags, website_url, github_url, launch_state, launch_state_source, source, platform_links, bookmark_count, trend_score, rising_score, recent_saves, recent_compares, signals_at";

const EMPTY_TOTALS: SignalTotals = {
  visitors: 0, views: 0, websiteClicks: 0, saves: 0, compares: 0,
  matchImpressions: 0, matchClicks: 0, searchClicks: 0, upvotes: 0, comments: 0,
};

type DailyRow = {
  day: string; views: number; visitors: number; website_clicks: number; saves: number; compares: number;
  match_impressions: number; match_clicks: number; search_clicks: number; upvotes: number; comments: number;
};

function totals(rows: DailyRow[]): SignalTotals {
  return rows.reduce<SignalTotals>(
    (sum, row) => ({
      visitors: sum.visitors + row.visitors,
      views: sum.views + row.views,
      websiteClicks: sum.websiteClicks + row.website_clicks,
      saves: sum.saves + row.saves,
      compares: sum.compares + row.compares,
      matchImpressions: sum.matchImpressions + row.match_impressions,
      matchClicks: sum.matchClicks + row.match_clicks,
      searchClicks: sum.searchClicks + row.search_clicks,
      upvotes: sum.upvotes + row.upvotes,
      comments: sum.comments + row.comments,
    }),
    { ...EMPTY_TOTALS },
  );
}

function istDay(offsetDays: number): string {
  const ist = new Date(Date.now() + 5.5 * 3_600_000 - offsetDays * 86_400_000);
  return ist.toISOString().slice(0, 10);
}

function group<T>(rows: T[], key: (row: T) => string, label: (row: T) => string) {
  const counts = new Map<string, { query: string; searches: number }>();
  for (const row of rows) {
    const entry = counts.get(key(row)) ?? { query: label(row), searches: 0 };
    entry.searches += 1;
    counts.set(key(row), entry);
  }
  return [...counts.values()].sort((a, b) => b.searches - a.searches);
}

export async function getIntelligenceStatus(): Promise<IntelligenceStatus> {
  const db = createServiceClient();
  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const todayStart = new Date(`${istDay(0)}T00:00:00+05:30`).toISOString();

  const [products, intelligence, similarities, searches, daily, eventsToday, lists, listItems, cacheMetrics, pairs] =
    await Promise.all([
      db.from("products").select(PRODUCT_COLUMNS).eq("status", "published").limit(5000),
      db.from("product_intelligence").select("product_id, content_hash, knowledge_version, concepts, indexed_at").limit(5000),
      db.from("product_similarities").select("product_id").limit(50000),
      db.from("search_queries").select("query, query_normalized, result_count, source").gte("created_at", since30).limit(20000),
      db.from("product_signal_daily").select("*").gte("day", istDay(29)).limit(50000),
      db.from("product_events").select("id", { count: "exact", head: true }).gte("created_at", todayStart),
      db.from("user_lists").select("is_public").limit(10000),
      db.from("user_list_items").select("list_id", { count: "exact", head: true }),
      getCacheMetrics(),
      getComparePairs().catch(() => []),
    ]);

  type ProductRow = KnowledgeInput & {
    slug: string; bookmark_count: number | null; trend_score: number | null; rising_score: number | null;
    recent_saves: number | null; recent_compares: number | null; signals_at: string | null;
  };
  const rows = (products.data ?? []) as unknown as ProductRow[];
  const stored = new Map(
    (intelligence.data ?? []).map((row) => [row.product_id, `${row.content_hash}:${row.knowledge_version}`]),
  );
  const withSimilar = new Set((similarities.data ?? []).map((row) => row.product_id));

  const conceptCounts = new Map<string, number>();
  for (const row of intelligence.data ?? []) {
    for (const key of row.concepts ?? []) conceptCounts.set(key, (conceptCounts.get(key) ?? 0) + 1);
  }

  const dailyRows = (daily.data ?? []) as DailyRow[];
  const week = istDay(6);
  const byDay = new Map<string, { visitors: number; actions: number }>();
  for (const row of dailyRows) {
    const entry = byDay.get(row.day) ?? { visitors: 0, actions: 0 };
    entry.visitors += row.visitors;
    entry.actions += row.website_clicks + row.saves + row.compares + row.match_clicks + row.search_clicks + row.upvotes + row.comments;
    byDay.set(row.day, entry);
  }

  const ranked = (pick: (row: ProductRow) => number) =>
    rows
      .map((row) => ({ slug: row.slug, name: row.name, value: pick(row) }))
      .filter((entry) => entry.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

  const searchRows = (searches.data ?? []) as { query: string; query_normalized: string; result_count: number; source?: string }[];
  const matchRows = searchRows.filter((row) => row.source === "match");
  const marketRows = searchRows.filter((row) => row.source !== "match");
  const totals30 = totals(dailyRows);

  return {
    migrationApplied: !isMissingTableError(intelligence.error),
    published: rows.length,
    indexed: stored.size,
    stale: rows.filter((row) => stored.get(row.id) !== `${contentHash(row)}:${KNOWLEDGE_VERSION}`).length,
    withoutSimilar: rows.filter((row) => !withSimilar.has(row.id)).length,
    similarityRows: similarities.data?.length ?? 0,
    comparePages: pairs.length,
    lastIndexedAt: (intelligence.data ?? []).reduce<string | null>(
      (latest, row) => (!latest || row.indexed_at > latest ? row.indexed_at : latest),
      null,
    ),
    lastSignalsAt: rows.reduce<string | null>(
      (latest, row) => (row.signals_at && (!latest || row.signals_at > latest) ? row.signals_at : latest),
      null,
    ),
    topConcepts: [...conceptCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 16)
      .map(([key, count]) => ({ key, label: conceptLabel(key), products: count })),
    signals7d: totals(dailyRows.filter((row) => row.day >= week)),
    signals30d: totals30,
    daily: Array.from({ length: 14 }, (_, index) => {
      const day = istDay(13 - index);
      return { day, ...(byDay.get(day) ?? { visitors: 0, actions: 0 }) };
    }),
    eventsToday: eventsToday.count ?? 0,
    trending: ranked((row) => Number(row.trend_score ?? 0)),
    rising: ranked((row) => Number(row.rising_score ?? 0)),
    mostSaved: ranked((row) => (row.recent_saves ?? 0) || (row.bookmark_count ?? 0)),
    mostCompared: ranked((row) => row.recent_compares ?? 0),
    totalSaves: rows.reduce((sum, row) => sum + (row.bookmark_count ?? 0), 0),
    match: {
      searches30d: matchRows.length,
      zeroResult30d: matchRows.filter((row) => row.result_count === 0).length,
      impressions30d: totals30.matchImpressions,
      clicks30d: totals30.matchClicks,
    },
    zeroResultMatches: group(
      matchRows.filter((row) => row.result_count === 0),
      (row) => row.query_normalized,
      (row) => row.query,
    ).slice(0, 10),
    marketplaceSearches30d: marketRows.length,
    topSearches: group(marketRows, (row) => row.query_normalized, (row) => row.query).slice(0, 10),
    zeroResultSearches: group(
      marketRows.filter((row) => row.result_count === 0),
      (row) => row.query_normalized,
      (row) => row.query,
    )
      .slice(0, 12)
      .map((entry) => ({ ...entry, readAs: queryConcepts(entry.query).map(conceptLabel) })),
    lists: {
      total: lists.data?.length ?? 0,
      public: (lists.data ?? []).filter((list) => list.is_public).length,
      items: listItems.count ?? 0,
    },
    cache: { enabled: isCacheEnabled(), hits: cacheMetrics?.hits ?? 0, misses: cacheMetrics?.misses ?? 0 },
  };
}
