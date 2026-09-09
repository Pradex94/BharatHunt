/**
 * Run the AI Trending pipeline against the real, configured sources and print
 * what it *would* write. Touches no database and needs no credentials.
 *
 *   node scripts/ai-news-dry-run.mjs                 # every seeded source
 *   node scripts/ai-news-dry-run.mjs --only=OpenAI   # one, by name substring
 *   node scripts/ai-news-dry-run.mjs --limit=4       # first N sources
 *   node scripts/ai-news-dry-run.mjs --verbose       # per-article verdicts
 *
 * Why this exists
 * ---------------
 * Everything between a feed and a story is decided by code in `lib/ai-news/`,
 * and all of it is unit-tested — but unit tests use headlines somebody typed.
 * The questions this script answers are the ones tests cannot: are these feed
 * URLs still live, does each publisher's XML still parse, and does the
 * classifier do something sensible with *today's* headlines rather than with the
 * examples it was tuned on.
 *
 * It reads its source list out of the seed migration, so it is always testing
 * the configuration that will actually be deployed rather than a copy that can
 * drift.
 *
 * Exit code is 1 if any source failed to fetch or parse, so it is usable as a
 * check rather than only as a report.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { classifyArticle } from "../lib/ai-news/classify.ts";
import { AI_RELEVANCE_MIN, AUTO_PUBLISH_RELEVANCE } from "../lib/ai-news/constants.ts";
import { findStoryForArticle, sourcePriorFor } from "../lib/ai-news/grouping.ts";
import { normalizeUrl, splitPublisherSuffix, storyKey } from "../lib/ai-news/normalize.ts";
import { attributionFor, fetchSourceArticles } from "../lib/ai-news/sources.ts";
import { composeSummary, summaryWordCount } from "../lib/ai-news/summarize.ts";
import { computeTrendScore } from "../lib/ai-news/trend.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SEED = join(ROOT, "supabase/migrations/20260910020000_ai_news_sources_seed.sql");

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const only = flag("only");
const limit = Number(flag("limit") ?? 0);
const verbose = args.includes("--verbose");

/**
 * The seeded source rows, parsed out of the migration's VALUES list.
 *
 * A deliberately small parser for a format this repo controls: one tuple per
 * line, values that are either a single-quoted string, a number, a boolean or
 * `null`. It is not a SQL parser and does not need to be — if the seed file's
 * shape changes, this throws loudly rather than silently testing nothing.
 */
function readSeededSources() {
  const sql = readFileSync(SEED, "utf8");
  // Anchored to the start of a line, because the file's header comment
  // discusses `on conflict` in prose and an unanchored search finds that first.
  const start = sql.search(/^values$/m);
  const end = sql.search(/^on conflict/m);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`Could not locate the VALUES block in ${SEED}`);
  }
  const body = sql.slice(start, end);

  const rows = [];
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("(")) continue;

    const values = [];
    let i = 1;
    while (i < trimmed.length) {
      const char = trimmed[i];
      if (char === ")") break;
      if (char === "," || char === " ") { i += 1; continue; }
      if (char === "'") {
        let value = "";
        i += 1;
        while (i < trimmed.length) {
          if (trimmed[i] === "'" && trimmed[i + 1] === "'") { value += "'"; i += 2; continue; }
          if (trimmed[i] === "'") { i += 1; break; }
          value += trimmed[i];
          i += 1;
        }
        values.push(value);
        continue;
      }
      let token = "";
      while (i < trimmed.length && !",) ".includes(trimmed[i])) { token += trimmed[i]; i += 1; }
      values.push(token === "null" ? null : token === "true" ? true : token === "false" ? false : Number(token));
    }

    const [
      name, source_type, feed_url, api_endpoint, publisher, homepage_url,
      source_category, reliability_score, region, auto_publish, priority, poll_interval_minutes,
      enabled,
    ] = values;

    if (!name || !source_type) continue;
    rows.push({
      name, source_type, feed_url, api_endpoint, publisher, homepage_url,
      source_category, reliability_score: Number(reliability_score), region,
      auto_publish, priority, poll_interval_minutes, enabled,
    });
  }

  if (rows.length === 0) throw new Error(`No source rows parsed from ${SEED}`);
  return rows;
}

const pad = (text, width) => String(text).padEnd(width).slice(0, width);

async function main() {
  let sources = readSeededSources().filter(
    (source) => source.source_type !== "manual" && source.enabled !== false,
  );
  if (only) sources = sources.filter((s) => s.name.toLowerCase().includes(only.toLowerCase()));
  if (limit > 0) sources = sources.slice(0, limit);

  console.log(`AI Trending dry run — ${sources.length} source(s), no database writes\n`);

  const now = new Date();
  const stories = [];
  const articlesByStory = new Map();
  const seenUrls = new Set();
  let failures = 0;
  let totalFetched = 0;
  let totalRelevant = 0;
  let totalRejected = 0;
  let totalDuplicate = 0;

  for (const source of sources) {
    const started = Date.now();
    let fetched;
    try {
      fetched = await fetchSourceArticles(source);
    } catch (error) {
      failures += 1;
      console.log(`${pad(source.name, 26)} FAILED  ${error.message}`);
      continue;
    }

    const elapsed = Date.now() - started;
    totalFetched += fetched.length;

    const prior = sourcePriorFor(source.source_category);
    let relevant = 0;
    let rejected = 0;
    const samples = [];

    for (const article of fetched.slice(0, 40)) {
      const normalized = normalizeUrl(article.url);
      if (!normalized) continue;
      if (seenUrls.has(normalized)) { totalDuplicate += 1; continue; }
      seenUrls.add(normalized);

      const { headline } = splitPublisherSuffix(article.title);
      const classification = classifyArticle({
        title: headline,
        excerpt: article.excerpt,
        sourcePrior: prior,
        sourceRegion: source.region,
      });

      if (!classification.isAiRelated) {
        rejected += 1;
        if (verbose) samples.push(`    reject ${classification.relevanceScore.toFixed(2)}  ${headline}`);
        continue;
      }
      relevant += 1;

      const key = storyKey({
        primaryEntity: classification.primaryEntity?.name ?? null,
        title: headline,
        at: article.publishedAt ?? now,
      });

      const grouped = findStoryForArticle(stories, {
        title: headline,
        storyKey: key,
        primaryEntity: classification.primaryEntity?.name ?? null,
        publishedAt: article.publishedAt,
      }, now);

      const sourceName = attributionFor(source, article.url);
      const stamp = article.publishedAt ?? now;

      if (grouped) {
        const bucket = articlesByStory.get(grouped.id);
        bucket.times.push(stamp);
        bucket.sources.add(sourceName);
        bucket.reliabilities.push(source.reliability_score);
        bucket.external += article.externalEngagement ?? 0;
        grouped.last_seen_at = new Date(
          Math.max(new Date(grouped.last_seen_at).getTime(), stamp.getTime()),
        ).toISOString();
      } else {
        const story = {
          id: `dry-${stories.length}`,
          story_key: key,
          title: headline,
          primary_entity: classification.primaryEntity?.name ?? null,
          first_seen_at: stamp.toISOString(),
          last_seen_at: stamp.toISOString(),
          category: classification.category,
          sub_category: classification.subCategory,
          region: classification.region,
          entities: classification.entities.map((e) => e.name),
          relevance: classification.relevanceScore,
          autoPublish: source.auto_publish && classification.relevanceScore >= AUTO_PUBLISH_RELEVANCE,
        };
        stories.push(story);
        articlesByStory.set(story.id, {
          times: [stamp],
          sources: new Set([sourceName]),
          reliabilities: [source.reliability_score],
          external: article.externalEngagement ?? 0,
        });
      }

      if (verbose) {
        samples.push(
          `    keep   ${classification.relevanceScore.toFixed(2)}  [${classification.category}] ${headline}`,
        );
      }
    }

    totalRelevant += relevant;
    totalRejected += rejected;

    console.log(
      `${pad(source.name, 26)} ok  ${pad(`${fetched.length} items`, 10)} ` +
        `${pad(`${relevant} AI`, 8)} ${pad(`${rejected} rejected`, 14)} ${elapsed}ms`,
    );
    if (verbose) samples.slice(0, 8).forEach((line) => console.log(line));
  }

  // ── Score and rank exactly as an ingestion run would ────────────────────
  const ranked = stories
    .map((story) => {
      const bucket = articlesByStory.get(story.id);
      const breakdown = computeTrendScore({
        articleTimes: bucket.times,
        sourceCount: bucket.sources.size,
        sourceReliabilities: bucket.reliabilities,
        viewCount: 0,
        externalEngagement: bucket.external,
        now,
      });
      return { story, bucket, breakdown };
    })
    .sort((a, b) => (b.breakdown.trendScore ?? -1) - (a.breakdown.trendScore ?? -1));

  console.log(
    `\n${totalFetched} fetched · ${totalRelevant} AI-relevant · ${totalRejected} rejected · ` +
      `${totalDuplicate} duplicate URLs · ${stories.length} stories · ${failures} source failures`,
  );
  console.log(
    `thresholds: relevance ≥ ${AI_RELEVANCE_MIN} to keep, ≥ ${AUTO_PUBLISH_RELEVANCE} to auto-publish\n`,
  );

  const multiSource = ranked.filter((entry) => entry.bucket.sources.size > 1);
  console.log(`Grouped across sources: ${multiSource.length} story/stories with 2+ publications`);
  for (const entry of multiSource.slice(0, 5)) {
    console.log(`  · ${entry.story.title}`);
    console.log(`    covered by ${[...entry.bucket.sources].join(", ")}`);
  }

  console.log("\nTop 10 by BharatHunt Trend Score");
  for (const { story, bucket, breakdown } of ranked.slice(0, 10)) {
    const score = breakdown.trendScore === null ? " —" : String(Math.round(breakdown.trendScore));
    console.log(
      `  ${pad(score, 4)} ${pad(story.category ?? "?", 16)} ${pad(`${bucket.sources.size} src`, 7)} ` +
        `${story.autoPublish ? "live " : "queue"} ${story.title.slice(0, 78)}`,
    );
  }

  const sample = ranked[0];
  if (sample) {
    const summary = composeSummary({
      headline: sample.story.title,
      category: sample.story.category,
      subCategory: sample.story.sub_category,
      region: sample.story.region,
      entities: sample.story.entities,
      sources: [...sample.bucket.sources],
    });
    console.log(`\nComposed summary for the top story (${summaryWordCount(summary)} words):`);
    console.log(`  ${summary}`);
  }

  const unrankable = ranked.filter((entry) => entry.breakdown.trendScore === null).length;
  if (unrankable > 0) {
    console.log(`\n${unrankable} story/stories have no score (no usable publication time). That is`);
    console.log("the intended behaviour — they render without a trend badge rather than with a 0.");
  }

  process.exit(failures > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
