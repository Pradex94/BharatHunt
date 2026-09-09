import "server-only";

import type { Json, TablesInsert, TablesUpdate } from "@/types/database";
import { createServiceClient } from "@/lib/supabase/service";
import {
  AUTO_PUBLISH_RELEVANCE,
  RESCORE_WINDOW_HOURS,
  SNAPSHOT_RETENTION_DAYS,
  STORY_WINDOW_HOURS,
} from "./constants.ts";
import { classifyArticle } from "./classify.ts";
import type { ExtractedEntity } from "./entities.ts";
import {
  contentHash,
  normalizeEntityName,
  normalizeTitle,
  normalizeUrl,
  splitPublisherSuffix,
  storyKey as buildStoryKey,
  storySlug,
} from "./normalize.ts";
import { composeSummary } from "./summarize.ts";
import {
  attributionFor,
  fetchSourceArticles,
  type FetchedArticle,
} from "./sources.ts";
import { computeTrendScore, hourBucket } from "./trend.ts";
import {
  findStoryForArticle,
  isSourceDue,
  sourcePriorFor,
  type SourceRow,
  type StoryCandidate,
} from "./grouping.ts";

/**
 * The pipeline, end to end:
 *
 *   sources → fetch → normalise → AI relevance filter → duplicate detection →
 *   classification → story grouping → trend scoring → Supabase
 *
 * Everything here runs with the service-role client, and nothing here checks
 * permissions. That is deliberate and it is the same split
 * `lib/review.ts` / `lib/actions/review.ts` uses: authorisation belongs to the
 * two callers — `app/api/ai-news/ingest/route.ts`, which requires the cron
 * shared secret, and `lib/actions/ai-news.ts`, which requires `getIsAdmin()`.
 * A module that did its own checking would invite a third caller that forgot.
 *
 * Three properties this run must have, because a cron will execute it every ten
 * minutes forever:
 *
 *  1. **Idempotent.** Running it twice over the same feed contents writes
 *     nothing the second time. `ai_news_articles.normalized_url` is unique and
 *     is checked before anything expensive happens.
 *  2. **Isolated failures.** One unreachable feed, one malformed XML document,
 *     one source returning HTML instead of a feed — each is recorded against
 *     that source and the run carries on (section 32).
 *  3. **Bounded.** A fixed source budget, a fixed article budget per source, a
 *     wall-clock deadline, and a rescore window. A run's cost is a function of
 *     how much is configured, never of how much has accumulated.
 */

// ── Budgets ──────────────────────────────────────────────────────────────

/**
 * How long a run may take before it stops starting new sources.
 *
 * Forty-five seconds, under both platform ceilings this app has run on (a
 * Vercel function's 60s and a Worker's request budget) with room for the
 * rescore pass that follows. Sources that do not get their turn are simply the
 * least due ones, and the next run — ten minutes later — starts with them.
 */
const RUN_BUDGET_MS = 45_000;

/** Sources per run. With ~26 configured and a 10-minute cron, everything due gets read. */
const MAX_SOURCES_PER_RUN = 8;

/**
 * Articles taken from one source per run.
 *
 * A feed's first page is 10-40 items and we only care about what is new since
 * the last poll, which is a handful. The cap matters for the first ever run
 * against a large archive, and for a source that suddenly emits its whole
 * history.
 */
const MAX_ARTICLES_PER_SOURCE = 40;

/** Stories rescored in one run. Bounds the pass against a growing archive. */
const MAX_RESCORED_STORIES = 400;

// ── The run ──────────────────────────────────────────────────────────────

export type IngestionError = { source: string; message: string };

export type IngestionSummary = {
  runId: string | null;
  status: "ok" | "partial" | "failed";
  durationMs: number;
  sourcesAttempted: number;
  sourcesSucceeded: number;
  sourcesFailed: number;
  articlesFetched: number;
  articlesRelevant: number;
  articlesDuplicate: number;
  articlesRejected: number;
  storiesCreated: number;
  storiesUpdated: number;
  scoresRecomputed: number;
  errors: IngestionError[];
};

export type RunOptions = {
  trigger?: "cron" | "admin" | "manual";
  /** Restrict the run to specific sources — the admin "fetch this one now" path. */
  sourceIds?: string[];
  /** Ignore `poll_interval_minutes`. Admin-only; a cron must never set this. */
  force?: boolean;
  maxSources?: number;
  now?: Date;
};

type ServiceClient = ReturnType<typeof createServiceClient>;

/** An article that survived classification and is ready to be written. */
type PreparedArticle = {
  fetched: FetchedArticle;
  normalizedUrl: string;
  hash: string;
  headline: string;
  classification: ReturnType<typeof classifyArticle>;
  sourceName: string;
  storyKey: string;
};

export async function runIngestion(options: RunOptions = {}): Promise<IngestionSummary> {
  const now = options.now ?? new Date();
  const startedAt = Date.now();
  const db = createServiceClient();
  const trigger = options.trigger ?? "cron";

  const summary: IngestionSummary = {
    runId: null,
    status: "ok",
    durationMs: 0,
    sourcesAttempted: 0,
    sourcesSucceeded: 0,
    sourcesFailed: 0,
    articlesFetched: 0,
    articlesRelevant: 0,
    articlesDuplicate: 0,
    articlesRejected: 0,
    storiesCreated: 0,
    storiesUpdated: 0,
    scoresRecomputed: 0,
    errors: [],
  };

  // The run row is opened *before* any work, so a run that dies mid-way leaves
  // a `running` row with a start time rather than no evidence at all.
  const { data: run } = await db
    .from("ai_ingestion_runs")
    .insert({ trigger_source: trigger, status: "running", started_at: now.toISOString() })
    .select("id")
    .single();
  summary.runId = run?.id ?? null;

  try {
    const sources = await loadDueSources(db, options, now);
    const candidates = await loadRecentStories(db, now);

    for (const source of sources) {
      if (Date.now() - startedAt > RUN_BUDGET_MS) {
        summary.errors.push({
          source: "scheduler",
          message: `Run budget of ${RUN_BUDGET_MS}ms reached; ${
            sources.length - summary.sourcesAttempted
          } source(s) deferred to the next run`,
        });
        break;
      }

      summary.sourcesAttempted += 1;
      try {
        await processSource(db, source, candidates, summary, now);
        summary.sourcesSucceeded += 1;
      } catch (error) {
        summary.sourcesFailed += 1;
        const message = error instanceof Error ? error.message : String(error);
        summary.errors.push({ source: source.name, message });
        await recordSourceFailure(db, source, message, now);
      }
    }

    summary.scoresRecomputed = await recomputeTrendScores(db, now);
    await pruneSnapshots(db, now);

    summary.status = summary.sourcesFailed === 0 ? "ok" : summary.sourcesSucceeded > 0 ? "partial" : "failed";
  } catch (error) {
    // A failure out here is the run itself failing — the source loop already
    // absorbs per-source problems — so it is worth recording distinctly.
    summary.status = "failed";
    summary.errors.push({
      source: "run",
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    summary.durationMs = Date.now() - startedAt;

    if (summary.runId) {
      await db
        .from("ai_ingestion_runs")
        .update({
          status: summary.status,
          finished_at: new Date().toISOString(),
          duration_ms: summary.durationMs,
          sources_attempted: summary.sourcesAttempted,
          sources_succeeded: summary.sourcesSucceeded,
          sources_failed: summary.sourcesFailed,
          articles_fetched: summary.articlesFetched,
          articles_relevant: summary.articlesRelevant,
          articles_duplicate: summary.articlesDuplicate,
          articles_rejected: summary.articlesRejected,
          stories_created: summary.storiesCreated,
          stories_updated: summary.storiesUpdated,
          scores_recomputed: summary.scoresRecomputed,
          errors: summary.errors,
        })
        .eq("id", summary.runId);
    }
  }

  return summary;
}

/** Enabled sources, best priority first, filtered to the ones actually due. */
async function loadDueSources(
  db: ServiceClient,
  options: RunOptions,
  now: Date,
): Promise<SourceRow[]> {
  let query = db
    .from("ai_news_sources")
    .select(
      "id, name, source_type, feed_url, api_endpoint, publisher, source_category, reliability_score, region, enabled, auto_publish, priority, poll_interval_minutes, consecutive_failures, last_attempt_at, total_articles_seen",
    )
    .eq("enabled", true)
    .neq("source_type", "manual")
    .order("priority", { ascending: true })
    .order("last_attempt_at", { ascending: true, nullsFirst: true });

  if (options.sourceIds?.length) query = query.in("id", options.sourceIds);

  const { data, error } = await query.limit(60);
  if (error) throw new Error(`Failed to load sources: ${error.message}`);

  const rows = (data ?? []) as SourceRow[];
  const due = options.force ? rows : rows.filter((source) => isSourceDue(source, now));
  return due.slice(0, options.maxSources ?? MAX_SOURCES_PER_RUN);
}

/**
 * The stories an incoming article could plausibly join.
 *
 * Loaded once per run rather than queried per article: grouping compares an
 * article against every recent story, and doing that as a round trip each would
 * make a 200-article run a 200-query run. The window is
 * `STORY_WINDOW_HOURS`, which is the same bound `findStoryForArticle` applies,
 * so nothing reachable is missed.
 *
 * Pending stories are included deliberately. A story waiting for review is
 * still a story, and a second source covering it must attach to it — not create
 * a duplicate that goes live while the original sits in the queue.
 */
async function loadRecentStories(db: ServiceClient, now: Date): Promise<StoryCandidate[]> {
  const since = new Date(now.getTime() - STORY_WINDOW_HOURS * 60 * 60 * 1000).toISOString();

  const { data, error } = await db
    .from("ai_stories")
    .select("id, story_key, title, primary_entity, last_seen_at, first_seen_at, category, region")
    .neq("status", "rejected")
    .gte("last_seen_at", since)
    .order("last_seen_at", { ascending: false })
    .limit(600);

  if (error) throw new Error(`Failed to load recent stories: ${error.message}`);
  return (data ?? []) as StoryCandidate[];
}

/** One source: fetch, classify, deduplicate, group, write. */
async function processSource(
  db: ServiceClient,
  source: SourceRow,
  candidates: StoryCandidate[],
  summary: IngestionSummary,
  now: Date,
): Promise<void> {
  await db
    .from("ai_news_sources")
    .update({ last_attempt_at: now.toISOString() })
    .eq("id", source.id);

  const fetched = (await fetchSourceArticles(source)).slice(0, MAX_ARTICLES_PER_SOURCE);
  summary.articlesFetched += fetched.length;

  // ── Normalise and de-duplicate within the batch ───────────────────────
  const byUrl = new Map<string, FetchedArticle>();
  for (const article of fetched) {
    const normalized = normalizeUrl(article.url);
    // An article we cannot key is an article we cannot promise not to
    // duplicate, so it is dropped rather than stored.
    if (!normalized) continue;
    if (!byUrl.has(normalized)) byUrl.set(normalized, article);
  }

  if (byUrl.size === 0) {
    await recordSourceSuccess(db, source, 0, now);
    return;
  }

  // ── Primary duplicate check: have we seen this URL? ───────────────────
  const urls = [...byUrl.keys()];
  const { data: known } = await db
    .from("ai_news_articles")
    .select("normalized_url")
    .in("normalized_url", urls);

  const seenUrls = new Set((known ?? []).map((row) => row.normalized_url));
  const fresh = urls.filter((url) => !seenUrls.has(url));
  summary.articlesDuplicate += urls.length - fresh.length;

  if (fresh.length === 0) {
    await recordSourceSuccess(db, source, fetched.length, now);
    return;
  }

  // ── Classify what is left ─────────────────────────────────────────────
  const prior = sourcePriorFor(source.source_category);
  const prepared: PreparedArticle[] = [];
  const rejected: PreparedArticle[] = [];

  for (const url of fresh) {
    const article = byUrl.get(url)!;
    const { headline } = splitPublisherSuffix(article.title);
    const classification = classifyArticle({
      title: headline,
      excerpt: article.excerpt,
      sourcePrior: prior,
      sourceRegion: source.region,
    });

    const entry: PreparedArticle = {
      fetched: article,
      normalizedUrl: url,
      hash: await contentHash(headline, article.excerpt),
      headline,
      classification,
      sourceName: attributionFor(source, article.url),
      storyKey: buildStoryKey({
        primaryEntity: classification.primaryEntity?.name ?? null,
        title: headline,
        at: article.publishedAt ?? now,
      }),
    };

    if (classification.isAiRelated) prepared.push(entry);
    else rejected.push(entry);
  }

  summary.articlesRelevant += prepared.length;
  summary.articlesRejected += rejected.length;

  // Rejections are stored, not discarded. That is what makes the next run over
  // this feed cheap: the URL check above recognises them and nothing is
  // classified twice.
  if (rejected.length > 0) {
    await db.from("ai_news_articles").insert(
      rejected.map((entry) => ({
        source_id: source.id,
        source_name: entry.sourceName,
        source_url: entry.fetched.url,
        normalized_url: entry.normalizedUrl,
        content_hash: entry.hash,
        title: entry.headline,
        normalized_title: normalizeTitle(entry.headline),
        excerpt: entry.fetched.excerpt,
        author: entry.fetched.author,
        image_url: entry.fetched.imageUrl,
        published_at: entry.fetched.publishedAt?.toISOString() ?? null,
        is_ai_related: false,
        relevance_score: entry.classification.relevanceScore,
        status: "rejected" as const,
        rejected_reason: entry.classification.rejectedReason,
      })),
    );
  }

  if (prepared.length === 0) {
    await recordSourceSuccess(db, source, fetched.length, now);
    return;
  }

  // ── Secondary duplicate check: the same content at a second URL ───────
  const { data: hashMatches } = await db
    .from("ai_news_articles")
    .select("content_hash, source_name, story_id")
    .in("content_hash", [...new Set(prepared.map((entry) => entry.hash))]);

  const byHash = new Map<string, { source_name: string; story_id: string | null }[]>();
  for (const row of hashMatches ?? []) {
    const list = byHash.get(row.content_hash) ?? [];
    list.push({ source_name: row.source_name, story_id: row.story_id });
    byHash.set(row.content_hash, list);
  }

  // ── Group, then write ─────────────────────────────────────────────────
  const rows: TablesInsert<"ai_news_articles">[] = [];
  const entityLinks: { storyId: string; entities: ExtractedEntity[] }[] = [];
  const touchedStories = new Set<string>();

  for (const entry of prepared) {
    const matches = byHash.get(entry.hash) ?? [];

    // The identical text from the *same* publication at a second URL is a
    // republication, not new coverage. Skipped entirely.
    if (matches.some((match) => match.source_name === entry.sourceName)) {
      summary.articlesDuplicate += 1;
      continue;
    }

    // The identical text from a *different* publication is a syndication: real
    // additional coverage from a distinct source, attached to the story the
    // first copy already belongs to.
    const syndicatedInto = matches.find((match) => match.story_id)?.story_id ?? null;

    const grouped =
      syndicatedInto ??
      findStoryForArticle(
        candidates,
        {
          title: entry.headline,
          storyKey: entry.storyKey,
          primaryEntity: entry.classification.primaryEntity?.name ?? null,
          publishedAt: entry.fetched.publishedAt,
        },
        now,
      )?.id ??
      null;

    let storyId = grouped;

    if (storyId) {
      const updated = await updateStoryFromArticle(db, storyId, entry, source);
      if (updated) summary.storiesUpdated += 1;
      touchedStories.add(storyId);
    } else {
      const created = await createStory(db, entry, source, candidates, now);
      if (!created) {
        // The story could not be created and could not be resolved to an
        // existing one. Storing the article unattached keeps the record and
        // lets an admin place it by hand rather than losing it.
        storyId = null;
      } else {
        storyId = created.id;
        if (created.wasCreated) summary.storiesCreated += 1;
        else summary.storiesUpdated += 1;
        touchedStories.add(storyId);
      }
    }

    if (storyId) {
      entityLinks.push({ storyId, entities: entry.classification.entities });
    }

    rows.push({
      story_id: storyId,
      source_id: source.id,
      source_name: entry.sourceName,
      source_url: entry.fetched.url,
      normalized_url: entry.normalizedUrl,
      content_hash: entry.hash,
      title: entry.headline,
      normalized_title: normalizeTitle(entry.headline),
      excerpt: entry.fetched.excerpt,
      summary: composeSummary({
        headline: entry.headline,
        category: entry.classification.category,
        subCategory: entry.classification.subCategory,
        region: entry.classification.region,
        entities: entry.classification.entities.map((entity) => entity.name),
        sources: [entry.sourceName],
      }),
      author: entry.fetched.author,
      image_url: entry.fetched.imageUrl,
      published_at: entry.fetched.publishedAt?.toISOString() ?? null,
      external_engagement: entry.fetched.externalEngagement,
      external_engagement_source: entry.fetched.externalEngagement === null ? null : source.name,
      is_ai_related: true,
      relevance_score: entry.classification.relevanceScore,
      category: entry.classification.category,
      sub_category: entry.classification.subCategory,
      region: entry.classification.region,
      company: entry.classification.entities.find((entity) => entity.type === "company")?.name ?? null,
      people: entry.classification.entities.filter((e) => e.type === "person").map((e) => e.name),
      products: entry.classification.entities.filter((e) => e.type === "tool").map((e) => e.name),
      models: entry.classification.entities.filter((e) => e.type === "model").map((e) => e.name),
      entities: entry.classification.entities.map((entity) => entity.name),
      keywords: entry.classification.keywords,
      status: "processed" as const,
    });
  }

  if (rows.length > 0) {
    // `upsert` on the unique URL rather than `insert`: two runs overlapping on
    // the same feed would otherwise fail the whole batch on one collision, and
    // losing thirty-nine good articles to one duplicate is the wrong trade.
    const { error } = await db
      .from("ai_news_articles")
      .upsert(rows, { onConflict: "normalized_url", ignoreDuplicates: true });
    if (error) throw new Error(`Failed to store articles: ${error.message}`);
  }

  await linkEntities(db, entityLinks);
  await recordSourceSuccess(db, source, fetched.length, now);
}

/**
 * Create the story an article starts, or attach to the one that beat us to it.
 *
 * The `story_key` unique index is what makes concurrent runs safe: if another
 * worker created this story between our grouping pass and this insert, the
 * insert fails with 23505 and we resolve the existing row instead of failing
 * the article.
 */
async function createStory(
  db: ServiceClient,
  entry: PreparedArticle,
  source: SourceRow,
  candidates: StoryCandidate[],
  now: Date,
): Promise<{ id: string; wasCreated: boolean } | null> {
  const classification = entry.classification;

  /*
   * The auto-publish decision (section 23 vs section 37). Two conditions, both
   * required: the source is trusted to publish without review, and the
   * classifier was confident. Everything else lands in the admin queue, which
   * is what keeps the review step meaningful rather than decorative.
   */
  const autoPublish =
    source.auto_publish && classification.relevanceScore >= AUTO_PUBLISH_RELEVANCE;

  const baseSlug = storySlug(entry.headline);
  if (!baseSlug) return null;

  const slug = await uniqueSlug(db, baseSlug, entry.hash);

  const insert = {
    title: entry.headline,
    slug,
    summary: composeSummary({
      headline: entry.headline,
      category: classification.category,
      subCategory: classification.subCategory,
      region: classification.region,
      entities: classification.entities.map((entity) => entity.name),
      sources: [entry.sourceName],
    }),
    category: classification.category ?? "AI Models",
    sub_category: classification.subCategory,
    region: classification.region,
    primary_entity: normalizeEntityName(classification.primaryEntity?.name ?? "") || null,
    entity_text: classification.entities.map((entity) => entity.name).join(" | "),
    keywords: classification.keywords,
    story_key: entry.storyKey,
    top_source_name: entry.sourceName,
    top_source_url: entry.fetched.url,
    image_url: entry.fetched.imageUrl,
    status: autoPublish ? ("published" as const) : ("pending" as const),
    // Seeded so the story is orderable before the aggregate trigger fires on
    // its first article; the trigger overwrites both a moment later.
    first_seen_at: (entry.fetched.publishedAt ?? now).toISOString(),
    last_seen_at: (entry.fetched.publishedAt ?? now).toISOString(),
  };

  const { data, error } = await db.from("ai_stories").insert(insert).select("id").single();

  if (!error && data) {
    candidates.push({
      id: data.id,
      story_key: insert.story_key,
      title: insert.title,
      primary_entity: insert.primary_entity,
      last_seen_at: insert.last_seen_at,
      first_seen_at: insert.first_seen_at,
      category: insert.category,
      region: insert.region,
    });
    return { id: data.id, wasCreated: true };
  }

  // 23505: somebody else has this story_key (or this slug). Resolve rather
  // than fail — the article still belongs somewhere.
  if (error?.code === "23505") {
    const { data: existing } = await db
      .from("ai_stories")
      .select("id, story_key, title, primary_entity, last_seen_at, first_seen_at, category, region")
      .eq("story_key", entry.storyKey)
      .maybeSingle();

    if (existing) {
      candidates.push(existing as StoryCandidate);
      return { id: existing.id, wasCreated: false };
    }
  }

  throw new Error(`Failed to create story: ${error?.message ?? "unknown error"}`);
}

/**
 * A slug nobody is using.
 *
 * Two headlines about the same subject on the same day slug identically often
 * enough to matter ("openai-launches-new-model"), and a unique-violation retry
 * loop on insert would be a round trip per attempt. One lookup, one deterministic
 * suffix from the content hash — which is stable, so the same story re-created
 * after a delete gets the same URL back.
 */
async function uniqueSlug(db: ServiceClient, base: string, hash: string): Promise<string> {
  const { data } = await db.from("ai_stories").select("id").eq("slug", base).maybeSingle();
  if (!data) return base;
  return `${base}-${hash.slice(0, 6)}`;
}

/**
 * Fold a newly-arrived article into the story it joins.
 *
 * Conservative on purpose. The headline, category and region are set when the
 * story is created and are not rewritten by later coverage: the first article
 * is usually the primary source, and letting the fourth aggregator's headline
 * overwrite a lab's own announcement would degrade the story every time it grew.
 *
 * What does change: attribution moves to a more reliable source when one shows
 * up, an image is filled in if the story had none, and the summary is recomposed
 * because its coverage sentence — "Covered by 4 sources" — is now out of date.
 * `source_count` itself is never written here; the trigger owns it.
 */
async function updateStoryFromArticle(
  db: ServiceClient,
  storyId: string,
  entry: PreparedArticle,
  source: SourceRow,
): Promise<boolean> {
  const { data: story } = await db
    .from("ai_stories")
    .select(
      "id, title, summary, category, sub_category, region, image_url, top_source_name, top_source_url, entity_text, keywords, source_count",
    )
    .eq("id", storyId)
    .maybeSingle();

  if (!story) return false;

  // Which source currently owns the attribution, so we only take it over with
  // something better.
  const { data: currentTop } = await db
    .from("ai_news_sources")
    .select("reliability_score")
    .eq("name", story.top_source_name ?? "")
    .maybeSingle();

  const update: TablesUpdate<"ai_stories"> = {};

  if (!story.image_url && entry.fetched.imageUrl) update.image_url = entry.fetched.imageUrl;

  if (source.reliability_score > (currentTop?.reliability_score ?? 0)) {
    update.top_source_name = entry.sourceName;
    update.top_source_url = entry.fetched.url;
  }

  /*
   * `entity_text` is a denormalised bag of names that exists only to be read
   * by the generated `search_text` column, which lower-cases the lot. Stored
   * pipe-separated so it can be split back apart exactly — joining on a space
   * would make "Sam Altman" and "Altman Sam" indistinguishable on the next
   * merge.
   */
  const entityNames = entry.classification.entities.map((entity) => entity.name);
  const existingNames = (story.entity_text ?? "").split(" | ").filter(Boolean);
  const mergedNames = [...new Set([...existingNames, ...entityNames])];
  if (mergedNames.length !== existingNames.length) {
    update.entity_text = mergedNames.join(" | ").slice(0, 2000);
  }

  const mergedKeywords = [...new Set([...(story.keywords ?? []), ...entry.classification.keywords])].slice(
    0,
    24,
  );
  if (mergedKeywords.length !== (story.keywords ?? []).length) update.keywords = mergedKeywords;

  // Recomposed with the source list as it now stands. `source_count` is
  // read from the row, which the trigger has already updated for every article
  // written before this one.
  const { data: sourceNames } = await db
    .from("ai_news_articles")
    .select("source_name")
    .eq("story_id", storyId)
    .neq("status", "rejected")
    .limit(20);

  const sources = [
    ...new Set([...(sourceNames ?? []).map((row) => row.source_name), entry.sourceName]),
  ];

  const summary = composeSummary({
    headline: story.title,
    category: story.category,
    subCategory: story.sub_category,
    region: story.region as "india" | "global",
    entities: entityNames,
    sources,
  });
  if (summary && summary !== story.summary) update.summary = summary;

  if (Object.keys(update).length === 0) return false;

  await db.from("ai_stories").update(update).eq("id", storyId);
  return true;
}

/**
 * Upsert the entities a batch of stories named, then the links between them.
 *
 * Two bulk statements rather than two per story. `ai_entities` is keyed on
 * (entity_type, normalized_name) so the same company arriving from six articles
 * is one row, and `ai_story_entities` is keyed on the pair so re-running is a
 * no-op.
 */
async function linkEntities(
  db: ServiceClient,
  links: { storyId: string; entities: ExtractedEntity[] }[],
): Promise<void> {
  if (links.length === 0) return;

  const uniqueEntities = new Map<string, ExtractedEntity>();
  for (const link of links) {
    for (const entity of link.entities) {
      if (!entity.slug || !entity.normalizedName) continue;
      uniqueEntities.set(`${entity.type}:${entity.normalizedName}`, entity);
    }
  }
  if (uniqueEntities.size === 0) return;

  const nowIso = new Date().toISOString();
  const { data: stored, error } = await db
    .from("ai_entities")
    .upsert(
      [...uniqueEntities.values()].map((entity) => ({
        name: entity.name,
        slug: entity.slug,
        normalized_name: entity.normalizedName,
        entity_type: entity.type,
        website: entity.website,
        is_curated: entity.curated,
        last_seen_at: nowIso,
      })),
      { onConflict: "entity_type,normalized_name" },
    )
    .select("id, entity_type, normalized_name");

  if (error || !stored) return;

  const idByKey = new Map(stored.map((row) => [`${row.entity_type}:${row.normalized_name}`, row.id]));

  const rows: { story_id: string; entity_id: string; mentions: number; is_primary: boolean }[] = [];
  for (const link of links) {
    link.entities.forEach((entity, index) => {
      const id = idByKey.get(`${entity.type}:${entity.normalizedName}`);
      if (!id) return;
      rows.push({
        story_id: link.storyId,
        entity_id: id,
        mentions: entity.mentions,
        // The extraction returns entities in headline order and puts the
        // primary first, so index 0 is the subject of the story.
        is_primary: index === 0,
      });
    });
  }

  if (rows.length > 0) {
    await db.from("ai_story_entities").upsert(rows, { onConflict: "story_id,entity_id" });
  }
}

// ── Source health ────────────────────────────────────────────────────────

async function recordSourceSuccess(
  db: ServiceClient,
  source: SourceRow,
  articleCount: number,
  now: Date,
): Promise<void> {
  await db
    .from("ai_news_sources")
    .update({
      last_success_at: now.toISOString(),
      consecutive_failures: 0,
      is_healthy: true,
      last_error: null,
      // Read-modify-write, which is acceptable for this one column: it is a
      // diagnostic ("is this feed still producing anything?") shown in
      // /admin/ai-news, the scheduler hands one source to one run at a time,
      // and the cost of a lost increment under overlapping runs is a slightly
      // low number on an admin screen.
      total_articles_seen: (source.total_articles_seen ?? 0) + articleCount,
    })
    .eq("id", source.id);
}

async function recordSourceFailure(
  db: ServiceClient,
  source: SourceRow,
  message: string,
  now: Date,
): Promise<void> {
  const failures = (source.consecutive_failures ?? 0) + 1;
  await db
    .from("ai_news_sources")
    .update({
      last_error_at: now.toISOString(),
      // Truncated: a source returning an HTML error page can otherwise write a
      // whole document into this column.
      last_error: message.slice(0, 500),
      consecutive_failures: failures,
      // Two strikes, not one. Feeds blip; a badge that flickers on every
      // transient 503 is a badge an operator stops reading.
      is_healthy: failures < 2,
    })
    .eq("id", source.id);

  console.error(
    JSON.stringify({
      event: "ai_news_source_failed",
      source: source.name,
      failures,
      message: message.slice(0, 300),
      at: now.toISOString(),
    }),
  );
}

// ── Scoring ──────────────────────────────────────────────────────────────

/**
 * One row of the batch `ai_apply_trend_scores` consumes. The column names are
 * the ones its `jsonb_to_recordset` signature declares, so a rename in the
 * migration has to be a rename here too.
 */
type TrendScoreUpdate = {
  id: string;
  trend_score: number | null;
  recency_score: number | null;
  velocity_score: number | null;
  engagement_score: number | null;
  authority_score: number | null;
};

/**
 * Recompute the BharatHunt Trend Score for every recently-active story, and
 * write one snapshot per story per hour.
 *
 * Runs at the end of every ingestion, including runs that ingested nothing —
 * which is the point. The score is dominated by recency, so it decays with the
 * clock rather than with new articles, and a story that stopped being covered
 * must fall down the page on its own.
 */
async function recomputeTrendScores(db: ServiceClient, now: Date): Promise<number> {
  const since = new Date(now.getTime() - RESCORE_WINDOW_HOURS * 60 * 60 * 1000).toISOString();

  const { data: stories, error } = await db
    .from("ai_stories")
    .select("id, source_count, view_count")
    .neq("status", "rejected")
    .gte("last_seen_at", since)
    .order("last_seen_at", { ascending: false })
    .limit(MAX_RESCORED_STORIES);

  if (error || !stories?.length) return 0;

  const storyIds = stories.map((story) => story.id);

  // One query for every contributing article, then grouped in memory. The
  // alternative — a query per story — is the same data in 400 round trips.
  const { data: articles } = await db
    .from("ai_news_articles")
    .select("story_id, published_at, fetched_at, source_id, external_engagement")
    .in("story_id", storyIds)
    .neq("status", "rejected")
    .limit(4000);

  const { data: sourceRows } = await db
    .from("ai_news_sources")
    .select("id, reliability_score");
  const reliabilityById = new Map(
    (sourceRows ?? []).map((row) => [row.id, Number(row.reliability_score)]),
  );

  type Aggregate = { times: Date[]; reliabilities: number[]; external: number };
  const byStory = new Map<string, Aggregate>();

  for (const article of articles ?? []) {
    if (!article.story_id) continue;
    const aggregate = byStory.get(article.story_id) ?? { times: [], reliabilities: [], external: 0 };
    const stamp = article.published_at ?? article.fetched_at;
    if (stamp) {
      const date = new Date(stamp);
      if (!Number.isNaN(date.getTime())) aggregate.times.push(date);
    }
    const reliability = article.source_id ? reliabilityById.get(article.source_id) : undefined;
    if (typeof reliability === "number") aggregate.reliabilities.push(reliability);
    aggregate.external += article.external_engagement ?? 0;
    byStory.set(article.story_id, aggregate);
  }

  const bucket = hourBucket(now);
  const scores: TrendScoreUpdate[] = [];
  const snapshots: TablesInsert<"ai_trend_snapshots">[] = [];

  for (const story of stories) {
    const aggregate = byStory.get(story.id) ?? { times: [], reliabilities: [], external: 0 };
    const breakdown = computeTrendScore({
      articleTimes: aggregate.times,
      sourceCount: story.source_count ?? 0,
      sourceReliabilities: aggregate.reliabilities,
      viewCount: story.view_count ?? 0,
      externalEngagement: aggregate.external,
      now,
    });

    scores.push({
      id: story.id,
      trend_score: breakdown.trendScore,
      recency_score: breakdown.recency,
      velocity_score: breakdown.velocity,
      engagement_score: breakdown.engagement,
      authority_score: breakdown.authority,
    });

    // A null score is not snapshotted. A history of "we could not rank this"
    // is not a trend line, and storing it would put nulls into the series the
    // story page draws its direction from.
    if (breakdown.trendScore !== null) {
      snapshots.push({
        story_id: story.id,
        trend_score: breakdown.trendScore,
        source_count: story.source_count ?? 0,
        recency_score: breakdown.recency,
        velocity_score: breakdown.velocity,
        engagement_score: breakdown.engagement,
        authority_score: breakdown.authority,
        calculated_at: now.toISOString(),
        bucket_hour: bucket,
      });
    }
  }

  const { data: applied } = await db.rpc("ai_apply_trend_scores", {
    // The function reads this with `jsonb_to_recordset`, so the wire shape is
    // the contract; `TrendScoreUpdate` is what keeps the two in step.
    payload: scores as unknown as Json,
  });

  if (snapshots.length > 0) {
    await db
      .from("ai_trend_snapshots")
      .upsert(snapshots, { onConflict: "story_id,bucket_hour" });
  }

  return typeof applied === "number" ? applied : scores.length;
}

/** Drop snapshot history past the retention window. */
async function pruneSnapshots(db: ServiceClient, now: Date): Promise<void> {
  const cutoff = new Date(now.getTime() - SNAPSHOT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  await db.from("ai_trend_snapshots").delete().lt("calculated_at", cutoff.toISOString());
}
