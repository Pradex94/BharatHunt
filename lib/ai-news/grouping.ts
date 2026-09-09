/**
 * The decisions the pipeline makes before it touches the database: whether a
 * source is due, how much a source's own authority is worth, and which existing
 * story an incoming article belongs to.
 *
 * Split out of ingest.ts so it can be tested. ingest.ts imports `server-only`
 * and the service-role client, which makes it unimportable from Node's test
 * runner — and grouping is the single most consequential piece of logic in this
 * feature, because a wrong answer here silently merges two stories or splits
 * one. It is the last thing that should be verified by reading it.
 *
 * Pure and dependency-free, in the style of lib/funding/normalize.ts.
 */

import { DUPLICATE_TITLE_THRESHOLD, STORY_WINDOW_HOURS } from "./constants.ts";
import { normalizeEntityName, titleSimilarity } from "./normalize.ts";
import type { SourceConfig } from "./sources.ts";

/**
 * The 0..1 prior a source lends its articles' AI relevance.
 *
 * An article on OpenAI's own blog is about AI whatever its headline says, and a
 * paper in arXiv cs.AI is about AI by definition — neither should have to argue
 * for it in keywords. A general news feed gets almost nothing, because the
 * whole reason it is polled is that only some of it is relevant. An aggregator
 * gets zero: its entries are other people's articles and carry no endorsement.
 */
export function sourcePriorFor(sourceCategory: string | null | undefined): number {
  switch (sourceCategory) {
    // Below AI_RELEVANCE_MIN on purpose. A lab's blog is overwhelmingly AI but
    // not exclusively — Google Research posts about quantum computing and
    // biology, Meta Engineering about datacentre networking — and a prior that
    // cleared the bar by itself would switch the relevance filter off for every
    // official source. This sets the bar very low for them instead of removing
    // it: a single mention of "model" carries such an article through.
    case "official":
      return 0.3;
    // The one prior that does clear the bar alone, because the sources it
    // applies to are category-filtered at the source: arXiv cs.AI, cs.CL and
    // cs.LG are AI by definition, and a paper titled "Sparse Attention with
    // Linear Complexity" contains no lexicon term at all.
    case "research":
      return 0.4;
    case "blog":
      return 0.15;
    case "news":
      return 0.1;
    // Zero. An aggregator's entries are other people's articles and carry no
    // endorsement from the aggregator at all.
    default:
      return 0;
  }
}

export type SourceRow = SourceConfig & {
  id: string;
  source_category: string;
  reliability_score: number;
  region: "india" | "global";
  enabled: boolean;
  auto_publish: boolean;
  priority: number;
  poll_interval_minutes: number;
  consecutive_failures: number;
  last_attempt_at: string | null;
  total_articles_seen: number;
};

/**
 * Whether a source is due to be fetched.
 *
 * The interval is the publisher's politeness contract; the exponential term is
 * ours. A source that has failed four times in a row is either misconfigured or
 * down, and continuing to poll it at its normal cadence is both useless and
 * rude — so each consecutive failure doubles the wait, up to sixteen times the
 * configured interval. One success resets `consecutive_failures` and with it
 * the backoff.
 */
export function isSourceDue(source: SourceRow, now: Date = new Date()): boolean {
  if (!source.enabled) return false;
  if (source.source_type === "manual") return false;
  if (!source.last_attempt_at) return true;

  const last = new Date(source.last_attempt_at).getTime();
  if (Number.isNaN(last)) return true;

  const backoff = Math.pow(2, Math.min(source.consecutive_failures ?? 0, 4));
  const waitMs = source.poll_interval_minutes * 60_000 * backoff;
  return now.getTime() - last >= waitMs;
}

/** A story already in the database, in the shape grouping needs. */
export type StoryCandidate = {
  id: string;
  story_key: string;
  title: string;
  primary_entity: string | null;
  last_seen_at: string | null;
  first_seen_at: string | null;
  category: string;
  region: string;
};

export type GroupingArticle = {
  title: string;
  storyKey: string;
  primaryEntity: string | null;
  publishedAt: Date | null;
};

/**
 * The story an article belongs to, or null if it is a new one.
 *
 * Three tests, in order of confidence:
 *
 *  1. **Same story key.** Two runs, or two feeds, reaching the same conclusion.
 *     Exact and cheap.
 *  2. **Same primary entity, similar headline, inside the time window.** This
 *     is the real one, and it is what section 12 describes: "OpenAI releases new
 *     model" and "OpenAI launches latest AI model" share their subject and
 *     enough of their headline, days apart at most.
 *  3. Nothing — so it is a new story.
 *
 * All three conditions in (2) are required together, and that is the whole
 * design. Headline similarity alone merges two unrelated funding rounds
 * announced the same week. Entity alone merges every story OpenAI has ever been
 * in. The time window alone merges everything published on a Tuesday. A false
 * merge is worse than a missed one — a missed duplicate shows a story twice,
 * while a false merge silently deletes one — so the bar is the conjunction.
 *
 * What this cannot do, and what covers it
 * ---------------------------------------
 * There is no semantic similarity here, because there is no embedding provider
 * configured for this project and a similarity function that pretended to be
 * semantic would be worse than none. The consequence is real and observable:
 * running `scripts/ai-news-dry-run.mjs` against live feeds finds pairs like
 * "Muse: Meta's personal AI agent, features and capabilities" and "Meta debuts
 * its Muse AI agent. Will consumers trust it?" — plainly one event to a reader,
 * two stories to a word-overlap test, because they share only {muse, agent}
 * once stopwords are removed.
 *
 * That gap is covered by the admin merge action in lib/actions/ai-news.ts
 * rather than by loosening the threshold, and the choice is deliberate: the
 * threshold that would catch that pair also merges unrelated stories about the
 * same company in the same week, and an operator can undo a missed merge in one
 * click while a wrong merge destroys a story nobody knows is missing.
 *
 * Pure, so `tests/ai-news-grouping.test.ts` exercises the real decision.
 */
export function findStoryForArticle(
  candidates: StoryCandidate[],
  article: GroupingArticle,
  now: Date = new Date(),
): StoryCandidate | null {
  const exact = candidates.find((candidate) => candidate.story_key === article.storyKey);
  if (exact) return exact;

  const entity = normalizeEntityName(article.primaryEntity ?? "");
  if (!entity) return null;

  const articleAt = article.publishedAt?.getTime() ?? now.getTime();
  const windowMs = STORY_WINDOW_HOURS * 60 * 60 * 1000;

  let best: { candidate: StoryCandidate; similarity: number } | null = null;

  for (const candidate of candidates) {
    if (normalizeEntityName(candidate.primary_entity ?? "") !== entity) continue;

    // The story's span, not a single instant: an article may arrive before the
    // earliest one we hold (a slow feed catching up) as readily as after the
    // latest, and both are inside the same event.
    const first = candidate.first_seen_at ? new Date(candidate.first_seen_at).getTime() : null;
    const last = candidate.last_seen_at ? new Date(candidate.last_seen_at).getTime() : null;
    const distance =
      first !== null && last !== null
        ? articleAt < first
          ? first - articleAt
          : articleAt > last
            ? articleAt - last
            : 0
        : Number.POSITIVE_INFINITY;
    if (distance > windowMs) continue;

    const similarity = titleSimilarity(article.title, candidate.title);
    if (similarity < DUPLICATE_TITLE_THRESHOLD) continue;

    if (!best || similarity > best.similarity) best = { candidate, similarity };
  }

  return best?.candidate ?? null;
}
