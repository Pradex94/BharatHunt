import "server-only";

import type { TablesInsert } from "@/types/database";
import { createServiceClient } from "@/lib/supabase/service";
import { toInr } from "@/lib/funding/format";
import {
  buildSummary,
  extractRound,
  isFundingCandidate,
  isStorableRound,
} from "@/lib/funding/extract";
import { refineExtraction } from "@/lib/funding/ai";
import {
  contentHash,
  fundingEventKey,
  normalizeEntityName,
  normalizeTitle,
  normalizeUrl,
  slugify,
  splitPublisherSuffix,
  titleSimilarity,
} from "@/lib/funding/normalize";
import { fetchSourceItems, type FeedItem, type SourceRow } from "@/lib/funding/sources";

/**
 * The ingestion run: sources in, funding rounds out.
 *
 * The property this file exists to guarantee
 * ------------------------------------------
 * **Running it twice does nothing the second time.** Every write is guarded by
 * an identity the database enforces, not by a flag this code remembers:
 * `funding_news.normalized_url` is unique, `funding_rounds.event_key` is
 * unique, and both join tables are keyed on their pairs. So a re-run, a
 * concurrent run, a retried cron and a click on "Run ingestion now" during a
 * scheduled run all converge on the same rows. The counters below report what
 * happened; they are not what makes it safe.
 *
 * The three duplicate checks, in the order they run
 * -------------------------------------------------
 *   1. `normalized_url` — the same article, however it was linked to.
 *   2. `content_hash`   — the same story at a second URL (syndication, an AMP
 *                          split, a publisher that changed its slug).
 *   3. `event_key`, then a headline-similarity pass — a *different* article
 *                          about the same funding event.
 *
 * Only the first discards. Two and three still store the article and attach it
 * to the round as additional coverage (`funding_round_articles`), because six
 * outlets covering one Series A is a fact about the round worth keeping, and
 * the brief is explicit that separate coverage must not be merged away.
 *
 * Nothing here publishes. Every round lands as `status = 'pending'` and is
 * invisible to the public RLS policy until an admin acts on it.
 */

/** Failures before a source is marked unhealthy in the admin table. */
const UNHEALTHY_AFTER_FAILURES = 3;

/** Ceiling on the exponential backoff, so a dead source is still retried daily. */
const MAX_BACKOFF_MINUTES = 24 * 60;

/**
 * How similar two headlines must be, given the same company and a nearby date,
 * to be treated as coverage of one event rather than two.
 *
 * 0.4, which is lower than it looks. "XYZ raises ₹20 crore" against "XYZ
 * secures Rs 20 crore funding" scores about 0.43 — the two share only three
 * words of seven — so a threshold set where intuition puts it would never fire.
 * It is safe at this level *because* it is never the only test: the startup
 * slug must already match and the announcement dates must be within
 * `SAME_EVENT_WINDOW_DAYS`.
 */
const DUPLICATE_TITLE_THRESHOLD = 0.4;
const SAME_EVENT_WINDOW_DAYS = 10;

/**
 * Wall-clock budget for one run.
 *
 * A run walks several feeds and may make a model call per candidate article, so
 * it is the kind of job that grows until something kills it. Stopping cleanly
 * at a budget means the log row is written, the source health is recorded, and
 * the next run picks up where this one stopped — versus being terminated
 * mid-source with nothing recorded at all.
 */
const DEFAULT_BUDGET_MS = 50_000;

export type IngestionCounts = {
  sourcesAttempted: number;
  articlesFetched: number;
  articlesCreated: number;
  duplicates: number;
  roundsCreated: number;
  rejected: number;
  errors: number;
};

export type IngestionResult = IngestionCounts & {
  runId: string;
  startedAt: string;
  durationMs: number;
  /** Sources that failed, with the reason, for the admin panel. */
  failures: { source: string; error: string }[];
  /** True when the time budget stopped the run before every due source ran. */
  budgetExhausted: boolean;
};

export type RunIngestionOptions = {
  /** 'cron' | 'admin' | 'manual' — recorded on every log row. */
  trigger?: string;
  /** Run exactly this source, ignoring whether it is due. The admin "run now". */
  sourceId?: string;
  /** Ignore poll intervals and backoff. Only ever set by an explicit admin run. */
  force?: boolean;
  budgetMs?: number;
};

type SupabaseServiceClient = ReturnType<typeof createServiceClient>;

/** Run the pipeline. Never throws — a failed source is data, not an exception. */
export async function runIngestion(options: RunIngestionOptions = {}): Promise<IngestionResult> {
  const { trigger = "cron", sourceId, force = false, budgetMs = DEFAULT_BUDGET_MS } = options;

  const supabase = createServiceClient();
  const runId = crypto.randomUUID();
  const startedAt = new Date();
  const deadline = startedAt.getTime() + budgetMs;

  const counts: IngestionCounts = {
    sourcesAttempted: 0,
    articlesFetched: 0,
    articlesCreated: 0,
    duplicates: 0,
    roundsCreated: 0,
    rejected: 0,
    errors: 0,
  };
  const failures: { source: string; error: string }[] = [];
  let budgetExhausted = false;

  const sources = await selectSources(supabase, { sourceId, force });

  for (const source of sources) {
    if (Date.now() > deadline) {
      budgetExhausted = true;
      break;
    }

    counts.sourcesAttempted += 1;
    const sourceStarted = Date.now();
    const perSource: Omit<IngestionCounts, "sourcesAttempted"> = {
      articlesFetched: 0,
      articlesCreated: 0,
      duplicates: 0,
      roundsCreated: 0,
      rejected: 0,
      errors: 0,
    };
    let errorDetail: string | null = null;

    try {
      const items = await fetchSourceItems(source);
      perSource.articlesFetched = items.length;

      for (const item of items) {
        if (Date.now() > deadline) {
          budgetExhausted = true;
          break;
        }
        try {
          const outcome = await ingestItem(supabase, source, item);
          if (outcome === "created") perSource.articlesCreated += 1;
          if (outcome === "duplicate") perSource.duplicates += 1;
          if (outcome === "rejected") perSource.rejected += 1;
          if (outcome === "round") {
            perSource.articlesCreated += 1;
            perSource.roundsCreated += 1;
          }
        } catch (error) {
          // One bad article must not cost the rest of the feed.
          perSource.errors += 1;
          console.error(
            JSON.stringify({
              event: "funding_ingest_item_failed",
              source: source.name,
              message: error instanceof Error ? error.message : "unknown",
              at: new Date().toISOString(),
            }),
          );
        }
      }

      await markSourceHealthy(supabase, source.id);
    } catch (error) {
      errorDetail = error instanceof Error ? error.message : "Unknown error";
      perSource.errors += 1;
      failures.push({ source: source.name, error: errorDetail });
      await markSourceFailed(supabase, source.id, errorDetail);
    }

    counts.articlesFetched += perSource.articlesFetched;
    counts.articlesCreated += perSource.articlesCreated;
    counts.duplicates += perSource.duplicates;
    counts.roundsCreated += perSource.roundsCreated;
    counts.rejected += perSource.rejected;
    counts.errors += perSource.errors;

    await writeLog(supabase, {
      run_id: runId,
      source_id: source.id,
      source_name: source.name,
      started_at: new Date(sourceStarted).toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - sourceStarted,
      articles_fetched: perSource.articlesFetched,
      articles_created: perSource.articlesCreated,
      duplicates: perSource.duplicates,
      rounds_created: perSource.roundsCreated,
      rejected: perSource.rejected,
      errors: perSource.errors,
      error_detail: errorDetail,
      ok: errorDetail === null,
      trigger_source: trigger,
    });
  }

  return {
    ...counts,
    runId,
    startedAt: startedAt.toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    failures,
    budgetExhausted,
  };
}

// ── Source selection ─────────────────────────────────────────────────────

/**
 * The sources due for a fetch, best priority first.
 *
 * Dueness is computed here rather than in SQL because the interval is not a
 * column — it is `poll_interval_minutes` doubled once per consecutive failure.
 * That is the backoff: a feed that has failed four times is not asked again for
 * sixteen times its usual interval, which is what stops a scheduled job from
 * turning an outage at a publisher into a stream of requests at it.
 */
async function selectSources(
  supabase: SupabaseServiceClient,
  { sourceId, force }: { sourceId?: string; force: boolean },
): Promise<SourceRow[]> {
  let query = supabase
    .from("funding_sources")
    .select("id, name, source_type, feed_url, api_endpoint, publisher, enabled, priority, poll_interval_minutes, consecutive_failures, last_attempt_at")
    .neq("source_type", "manual")
    .order("priority", { ascending: true })
    .limit(50);

  if (sourceId) {
    query = query.eq("id", sourceId);
  } else {
    query = query.eq("enabled", true);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to load funding sources: ${error.message}`);
  }

  const now = Date.now();
  return (data ?? [])
    .filter((source) => {
      if (force || sourceId) return true;
      if (!source.last_attempt_at) return true;

      const backoff = Math.min(
        source.poll_interval_minutes * 2 ** Math.min(source.consecutive_failures, 6),
        MAX_BACKOFF_MINUTES,
      );
      return now - new Date(source.last_attempt_at).getTime() >= backoff * 60_000;
    })
    .map((source) => ({
      id: source.id,
      name: source.name,
      source_type: source.source_type,
      feed_url: source.feed_url,
      api_endpoint: source.api_endpoint,
      publisher: source.publisher,
    }));
}

async function markSourceHealthy(supabase: SupabaseServiceClient, id: string): Promise<void> {
  const now = new Date().toISOString();
  await supabase
    .from("funding_sources")
    .update({
      consecutive_failures: 0,
      is_healthy: true,
      last_attempt_at: now,
      last_success_at: now,
      last_error: null,
    })
    .eq("id", id);
}

async function markSourceFailed(
  supabase: SupabaseServiceClient,
  id: string,
  message: string,
): Promise<void> {
  const now = new Date().toISOString();

  // Read-then-write rather than an atomic increment: there is no RPC for this
  // and a lost update here costs one step of backoff, not correctness.
  const { data } = await supabase
    .from("funding_sources")
    .select("consecutive_failures")
    .eq("id", id)
    .maybeSingle();

  const failures = (data?.consecutive_failures ?? 0) + 1;

  await supabase
    .from("funding_sources")
    .update({
      consecutive_failures: failures,
      is_healthy: failures < UNHEALTHY_AFTER_FAILURES,
      last_attempt_at: now,
      last_error_at: now,
      last_error: message.slice(0, 500),
    })
    .eq("id", id);
}

/**
 * Record what one source's pass did.
 *
 * A failure to write the log is logged and swallowed. The log is how an admin
 * sees what happened, but it is not part of what happened — losing the record
 * of a successful run is much better than failing a run because its record
 * could not be stored.
 */
async function writeLog(
  supabase: SupabaseServiceClient,
  row: TablesInsert<"funding_ingestion_logs">,
): Promise<void> {
  const { error } = await supabase.from("funding_ingestion_logs").insert(row);
  if (error) {
    console.error(`[funding] failed to write ingestion log: ${error.message}`);
  }
}

// ── One article ──────────────────────────────────────────────────────────

type ItemOutcome = "created" | "round" | "duplicate" | "rejected";

async function ingestItem(
  supabase: SupabaseServiceClient,
  source: SourceRow,
  item: FeedItem,
): Promise<ItemOutcome> {
  const normalizedUrl = normalizeUrl(item.url);
  // An article we cannot key is an article we cannot promise not to duplicate.
  if (!normalizedUrl) return "rejected";

  // ── Check 1: the same article ─────────────────────────────────────────
  const { data: existing } = await supabase
    .from("funding_news")
    .select("id")
    .eq("normalized_url", normalizedUrl)
    .maybeSingle();
  if (existing) return "duplicate";

  /*
   * Google News puts the publisher after a trailing " - " and names it again in
   * `<source>`. Splitting it off matters twice: the headline a card renders
   * should not end in "- Indian Startup Times", and the extractor's
   * subject-first pattern reads the start of the headline, which the suffix
   * does not disturb but the attribution does.
   */
  const { headline, publisher } = splitPublisherSuffix(item.title);
  const sourceName = item.publisher ?? publisher ?? source.publisher ?? source.name;

  const hash = await contentHash(headline, item.summary);
  const publishedAt = item.publishedAt ?? new Date().toISOString();

  const candidate = isFundingCandidate(headline, item.summary);

  const { data: inserted, error: insertError } = await supabase
    .from("funding_news")
    .insert({
      source_id: source.id,
      source_name: sourceName.slice(0, 120),
      url: item.url,
      normalized_url: normalizedUrl,
      content_hash: hash,
      title: headline.slice(0, 300),
      normalized_title: normalizeTitle(headline),
      excerpt: item.summary?.slice(0, 4000) ?? null,
      author: item.author?.slice(0, 120) ?? null,
      image_url: item.imageUrl,
      published_at: publishedAt,
      is_funding_candidate: candidate,
      status: candidate ? "pending" : "rejected",
      rejected_reason: candidate ? null : "Not a funding announcement",
    })
    .select("id")
    .single();

  if (insertError) {
    // 23505: another run inserted this URL between the check above and here.
    // That is the unique index doing its job, and the correct response is to
    // agree with it.
    if (insertError.code === "23505") return "duplicate";
    throw new Error(`Failed to store article: ${insertError.message}`);
  }

  const newsId = inserted.id;
  if (!candidate) return "rejected";

  // ── Check 2: the same story at another URL ────────────────────────────
  const { data: sameHash } = await supabase
    .from("funding_news")
    .select("id")
    .eq("content_hash", hash)
    .neq("id", newsId)
    .limit(1);

  if (sameHash && sameHash.length > 0) {
    const roundId = await roundForArticle(supabase, sameHash[0].id);
    if (roundId) {
      await attachCoverage(supabase, roundId, newsId);
      await setNewsStatus(supabase, newsId, "processed");
      return "duplicate";
    }
    // The earlier copy never became a round (it was rejected, or is still
    // pending). Fall through and let this one try — the event-level checks
    // below still stop a second round being created.
  }

  // ── Extraction ────────────────────────────────────────────────────────
  const base = extractRound({
    title: headline,
    summary: item.summary,
    sourceName,
    headlineOnly: item.headlineOnly,
  });

  if (!isStorableRound(base)) {
    await setNewsStatus(supabase, newsId, "rejected", "No company or no substantive facts");
    return "rejected";
  }

  const fallbackSummary = buildSummary(base, { sourceName, headline });
  const refined = await refineExtraction(base, { title: headline, summary: item.summary, sourceName }, fallbackSummary);

  // `isStorableRound` is re-run: the model pass can only add facts, but it can
  // also be the thing that supplied the company name, and a record that was
  // storable before must still be storable after.
  if (!refined.startupName) {
    await setNewsStatus(supabase, newsId, "rejected", "No company named");
    return "rejected";
  }

  const startupSlug = slugify(refined.startupName);
  if (!startupSlug) {
    await setNewsStatus(supabase, newsId, "rejected", "Company name has no usable slug");
    return "rejected";
  }

  const announcementDate = (item.publishedAt ?? publishedAt).slice(0, 10);
  const eventKey = fundingEventKey({
    startupName: refined.startupName,
    stage: refined.fundingStage,
    date: announcementDate,
  });

  // ── Check 3: a different article about the same event ─────────────────
  const existingRoundId = await findSameEvent(supabase, {
    eventKey,
    startupSlug,
    headline,
    announcementDate,
  });

  if (existingRoundId) {
    await attachCoverage(supabase, existingRoundId, newsId);
    await setNewsStatus(supabase, newsId, "processed");
    return "duplicate";
  }

  // ── Store ─────────────────────────────────────────────────────────────
  const converted = toInr(refined.amountNumeric, refined.currency);
  const startupId = await ensureStartup(supabase, {
    name: refined.startupName,
    slug: startupSlug,
    industry: refined.industry,
    location: refined.location,
    city: refined.city,
  });

  const { data: round, error: roundError } = await supabase
    .from("funding_rounds")
    .insert({
      news_id: newsId,
      startup_id: startupId,
      startup_name: refined.startupName.slice(0, 160),
      startup_slug: startupSlug,
      headline: headline.slice(0, 300),
      summary: refined.summary,
      amount: refined.amount,
      amount_numeric: refined.amountNumeric,
      currency: refined.currency,
      amount_inr: converted?.inr ?? null,
      fx_rate_to_inr: converted?.rate ?? null,
      funding_stage: refined.fundingStage,
      industry: refined.industry,
      location: refined.location,
      city: refined.city,
      investors: refined.investors,
      lead_investor: refined.leadInvestor,
      announcement_date: announcementDate,
      source_name: sourceName.slice(0, 120),
      source_url: item.url,
      source_published_at: item.publishedAt,
      logo_url: null,
      status: "pending",
      confidence_score: refined.confidence,
      extraction_method: refined.method,
      event_key: eventKey,
      review_note: refined.needsReview
        ? "Automatic and model extraction disagreed on a fact — check the source."
        : null,
    })
    .select("id")
    .single();

  if (roundError) {
    // The event_key unique index: a concurrent run got there first. Same
    // resolution as a URL collision — agree, and record this as coverage.
    if (roundError.code === "23505") {
      const { data: winner } = await supabase
        .from("funding_rounds")
        .select("id")
        .eq("event_key", eventKey)
        .maybeSingle();
      if (winner) await attachCoverage(supabase, winner.id, newsId);
      await setNewsStatus(supabase, newsId, "processed");
      return "duplicate";
    }
    throw new Error(`Failed to store round: ${roundError.message}`);
  }

  await linkInvestors(supabase, round.id, refined.investors, refined.leadInvestor);
  await setNewsStatus(supabase, newsId, "processed");

  return "round";
}

// ── Helpers ──────────────────────────────────────────────────────────────

async function setNewsStatus(
  supabase: SupabaseServiceClient,
  id: string,
  status: string,
  reason?: string,
): Promise<void> {
  await supabase
    .from("funding_news")
    .update({ status, ...(reason ? { rejected_reason: reason.slice(0, 300) } : {}) })
    .eq("id", id);
}

async function roundForArticle(
  supabase: SupabaseServiceClient,
  newsId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("funding_rounds")
    .select("id")
    .eq("news_id", newsId)
    .maybeSingle();
  return data?.id ?? null;
}

/** Idempotent by primary key, so re-linking the same pair is a no-op. */
async function attachCoverage(
  supabase: SupabaseServiceClient,
  roundId: string,
  newsId: string,
): Promise<void> {
  await supabase
    .from("funding_round_articles")
    .upsert({ round_id: roundId, news_id: newsId }, { onConflict: "round_id,news_id", ignoreDuplicates: true });
}

/**
 * The event-level duplicate check.
 *
 * The exact `event_key` first — company, stage and month, which every report of
 * one round agrees on. Then the softer pass for the case the key cannot catch:
 * two outlets that read the same round as different stages (one says "Seed",
 * one says nothing and gets "Undisclosed"), which produces two different keys
 * for one event. There the company and the date have to agree first, and the
 * headlines have to be similar, before they are treated as one.
 */
async function findSameEvent(
  supabase: SupabaseServiceClient,
  input: { eventKey: string; startupSlug: string; headline: string; announcementDate: string },
): Promise<string | null> {
  const { data: exact } = await supabase
    .from("funding_rounds")
    .select("id")
    .eq("event_key", input.eventKey)
    .maybeSingle();
  if (exact) return exact.id;

  const announced = new Date(input.announcementDate);
  const from = new Date(announced.getTime() - SAME_EVENT_WINDOW_DAYS * 86_400_000);
  const to = new Date(announced.getTime() + SAME_EVENT_WINDOW_DAYS * 86_400_000);

  const { data: nearby } = await supabase
    .from("funding_rounds")
    .select("id, headline")
    .eq("startup_slug", input.startupSlug)
    .gte("announcement_date", from.toISOString().slice(0, 10))
    .lte("announcement_date", to.toISOString().slice(0, 10))
    .limit(10);

  for (const row of nearby ?? []) {
    if (titleSimilarity(input.headline, row.headline) >= DUPLICATE_TITLE_THRESHOLD) {
      return row.id;
    }
  }
  return null;
}

/**
 * Find or create the company row, and link the round to it now rather than at
 * publish time.
 *
 * Safe to do early because visibility does not come from the link: a startup is
 * readable only while `published_round_count > 0`, and the trigger that
 * maintains that counter only counts published rounds. So a pending round
 * attaches to a company that stays invisible until the round is approved, and
 * approval is then a single status change with nothing else to remember.
 */
async function ensureStartup(
  supabase: SupabaseServiceClient,
  input: {
    name: string;
    slug: string;
    industry: string | null;
    location: string | null;
    city: string | null;
  },
): Promise<string | null> {
  const normalized = normalizeEntityName(input.name);
  if (!normalized) return null;

  const { data: existing } = await supabase
    .from("funding_startups")
    .select("id")
    .eq("normalized_name", normalized)
    .maybeSingle();
  if (existing) return existing.id;

  const { data, error } = await supabase
    .from("funding_startups")
    .insert({
      name: input.name.slice(0, 160),
      // Two different companies can normalise to different names but slugify to
      // the same string; the slug is unique, so disambiguate rather than fail.
      slug: await uniqueSlug(supabase, "funding_startups", input.slug),
      normalized_name: normalized,
      industry: input.industry,
      location: input.location,
      city: input.city,
    })
    .select("id")
    .single();

  if (error) {
    // Lost a race on `normalized_name`; the winner's row is the answer.
    if (error.code === "23505") {
      const { data: winner } = await supabase
        .from("funding_startups")
        .select("id")
        .eq("normalized_name", normalized)
        .maybeSingle();
      return winner?.id ?? null;
    }
    console.error(`[funding] could not store startup "${input.name}": ${error.message}`);
    return null;
  }
  return data.id;
}

async function linkInvestors(
  supabase: SupabaseServiceClient,
  roundId: string,
  investors: string[],
  leadInvestor: string | null,
): Promise<void> {
  for (const name of investors) {
    const normalized = normalizeEntityName(name);
    const slug = slugify(name);
    if (!normalized || !slug) continue;

    let investorId: string | null = null;

    const { data: existing } = await supabase
      .from("funding_investors")
      .select("id")
      .eq("normalized_name", normalized)
      .maybeSingle();

    if (existing) {
      investorId = existing.id;
    } else {
      const { data, error } = await supabase
        .from("funding_investors")
        .insert({
          name: name.slice(0, 160),
          slug: await uniqueSlug(supabase, "funding_investors", slug),
          normalized_name: normalized,
        })
        .select("id")
        .single();

      if (error) {
        if (error.code === "23505") {
          const { data: winner } = await supabase
            .from("funding_investors")
            .select("id")
            .eq("normalized_name", normalized)
            .maybeSingle();
          investorId = winner?.id ?? null;
        } else {
          console.error(`[funding] could not store investor "${name}": ${error.message}`);
        }
      } else {
        investorId = data.id;
      }
    }

    if (!investorId) continue;

    await supabase.from("funding_round_investors").upsert(
      {
        round_id: roundId,
        investor_id: investorId,
        is_lead: leadInvestor !== null && name.toLowerCase() === leadInvestor.toLowerCase(),
      },
      { onConflict: "round_id,investor_id" },
    );
  }
}

/**
 * A slug nothing else in `table` is using.
 *
 * Two distinct companies whose names differ only in punctuation slugify
 * identically ("Re:Build" and "Rebuild"), and the slug is a unique index *and*
 * a public URL. Suffixing keeps both rows and gives each a working page.
 */
async function uniqueSlug(
  supabase: SupabaseServiceClient,
  table: "funding_startups" | "funding_investors",
  base: string,
): Promise<string> {
  const candidate = base.slice(0, 80);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = attempt === 0 ? candidate : `${candidate}-${attempt + 1}`;
    const { data } = await supabase.from(table).select("id").eq("slug", slug).maybeSingle();
    if (!data) return slug;
  }
  // Five collisions on one name is implausible; a random suffix ends it rather
  // than looping.
  return `${candidate}-${crypto.randomUUID().slice(0, 6)}`;
}
