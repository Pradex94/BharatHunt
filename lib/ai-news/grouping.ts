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

import {
  CONTENT_MATCH_MIN_OVERLAP,
  CONTENT_MATCH_MIN_SHARED,
  CONTENT_MATCH_WINDOW_HOURS,
  DUPLICATE_TITLE_THRESHOLD,
  STORY_WINDOW_HOURS,
} from "./constants.ts";
import { CURATED_ENTITIES } from "./entities.ts";
import { normalizeEntityName, normalizeTitle, significantWords, titleSimilarity } from "./normalize.ts";
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
  /** The article's classified category, when known; research is never content-matched. */
  category?: string | null;
};

/**
 * Word spread per candidate pool, reused across the articles of one run. The
 * run appends each new story to the pool, so the cache is keyed on its length
 * too and recomputed when the pool grows.
 */
const spreadCache = new WeakMap<StoryCandidate[], { size: number; spread: Map<string, number> }>();
function poolSpread(candidates: StoryCandidate[]): Map<string, number> {
  const cached = spreadCache.get(candidates);
  if (cached && cached.size === candidates.length) return cached.spread;
  const spread = wordSpread(candidates.map((candidate) => ({ title: candidate.title, entity: candidate.primary_entity })));
  spreadCache.set(candidates, { size: candidates.length, spread });
  return spread;
}

/**
 * The story an article belongs to, or null if it is a new one.
 *
 * Four tests, in order of confidence:
 *
 *  1. **Same story key.** Two runs, or two feeds, reaching the same conclusion.
 *     Exact and cheap.
 *  2. **Same primary entity, similar headline, inside the time window.** This
 *     is the real one, and it is what section 12 describes: "OpenAI releases new
 *     model" and "OpenAI launches latest AI model" share their subject and
 *     enough of their headline, days apart at most.
 *  3. **Same event in other words** (`sameEventByContent`): the words that
 *     name the event, with entities and generic AI vocabulary removed, agree
 *     inside a tighter window. Added 2026-10-04 after production showed
 *     "Full Disk Access" three times and "Gemini 4 Argon" five times.
 *  4. Nothing — so it is a new story.
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

  if (best) return best.candidate;

  // Test 3: the same event in different words (see `sameEventByContent`),
  // in its strict mode — this merge happens without a person looking.
  const spread = poolSpread(candidates);
  let byContent: { candidate: StoryCandidate; overlap: number } | null = null;
  for (const candidate of candidates) {
    const at = candidate.last_seen_at ?? candidate.first_seen_at;
    const overlap = sameEventByContent(
      { title: article.title, entity: article.primaryEntity, at: article.publishedAt ?? now, category: article.category },
      { title: candidate.title, entity: candidate.primary_entity, at: at ? new Date(at) : null, category: candidate.category },
      { spread, mode: "ingest" },
    );
    if (overlap !== null && (!byContent || overlap > byContent.overlap)) byContent = { candidate, overlap };
  }
  return byContent?.candidate ?? null;
}

export type MergeableStory = {
  id: string;
  title: string;
  primary_entity: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  source_count: number;
  category?: string | null;
};

export type MergeSuggestion<T extends MergeableStory = MergeableStory> = { keep: T; duplicates: T[] };

/**
 * Stories already published separately that `sameEventByContent` reads as
 * one event — for an admin to merge, never merged automatically. Clusters
 * join transitively (A~B, B~C), and each keeps its best-covered story (most
 * sources, then the earliest), which is what the others are merged into.
 */
export function suggestStoryMerges<T extends MergeableStory>(stories: T[]): MergeSuggestion<T>[] {
  const parent = stories.map((_, index) => index);
  const root = (index: number): number => (parent[index] === index ? index : (parent[index] = root(parent[index])));
  const at = (story: T) => {
    const value = story.last_seen_at ?? story.first_seen_at;
    return value ? new Date(value) : null;
  };
  const spread = wordSpread(stories.map((story) => ({ title: story.title, entity: story.primary_entity })));

  for (let i = 0; i < stories.length; i++) {
    for (let j = i + 1; j < stories.length; j++) {
      const a = stories[i];
      const b = stories[j];
      const same =
        sameEventByContent(
          { title: a.title, entity: a.primary_entity, at: at(a), category: a.category },
          { title: b.title, entity: b.primary_entity, at: at(b), category: b.category },
          { spread, mode: "suggest" },
        ) !== null ||
        (normalizeEntityName(a.primary_entity ?? "") !== "" &&
          normalizeEntityName(a.primary_entity ?? "") === normalizeEntityName(b.primary_entity ?? "") &&
          titleSimilarity(a.title, b.title) >= DUPLICATE_TITLE_THRESHOLD);
      if (same) parent[root(j)] = root(i);
    }
  }

  const clusters = new Map<number, T[]>();
  stories.forEach((story, index) => {
    const key = root(index);
    clusters.set(key, [...(clusters.get(key) ?? []), story]);
  });

  return [...clusters.values()]
    .filter((cluster) => cluster.length > 1)
    .map((cluster) => {
      const ranked = [...cluster].sort(
        (a, b) =>
          b.source_count - a.source_count ||
          (a.first_seen_at ?? "").localeCompare(b.first_seen_at ?? "") ||
          a.id.localeCompare(b.id),
      );
      return { keep: ranked[0], duplicates: ranked.slice(1) };
    })
    .sort((a, b) => b.duplicates.length - a.duplicates.length);
}

/**
 * Vocabulary every AI headline shares, which therefore says nothing about
 * *which* event a headline is about.
 */
const GENERIC_AI_WORDS = new Set([
  "ai", "agent", "agents", "model", "models", "tool", "tools", "app", "apps", "news", "latest", "new", "update",
  "updates", "release", "launch", "says", "say", "will", "its", "it", "what", "how", "why",
]);

/** Plural folding for comparison: "risks" → "risk", "strangers" → "stranger"; not "access". */
const singular = (word: string) => (word.length > 4 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word);

/**
 * The words of a headline that name its event: significant words (the
 * pipeline's own stopwords and verb folding), single digits kept ("Gemini 4"),
 * minus the entities involved and generic AI vocabulary.
 */
export function eventWords(title: string, entities: (string | null | undefined)[]): Set<string> {
  const entityWords = new Set(entities.flatMap((entity) => normalizeEntityName(entity ?? "").split(" ")).filter(Boolean));
  const digits = normalizeTitle(title).split(" ").filter((word) => /^\d$/.test(word));
  return new Set(
    [...significantWords(title), ...digits]
      .map(singular)
      .filter((word) => !GENERIC_AI_WORDS.has(word) && !entityWords.has(word)),
  );
}


/**
 * How sure the content test must be. Ingestion merges automatically, and a
 * wrong merge hides a story nobody knows is missing, so it needs two rare
 * words in common. Admin suggestions are reviewed by a person, so one rare
 * word (with a second shared word) is enough to put a pair in front of them.
 */
export type ContentMatchMode = "ingest" | "suggest";
const RARE_WORDS_REQUIRED: Record<ContentMatchMode, number> = { ingest: 2, suggest: 1 };

/** A word used by headlines about at most this many different entities is "rare". */
const RARE_WORD_MAX_ENTITIES = 2;

/** Topic entities ("AI Safety", "Benchmarks") are subjects, not actors; they cannot anchor an event. */
const TOPIC_ENTITIES = new Set(
  CURATED_ENTITIES.filter((entity) => entity.type === "topic").flatMap((entity) =>
    [entity.name, ...(entity.aliases ?? [])].map((name) => normalizeEntityName(name)),
  ),
);

/** Research papers share topic vocabulary by nature; two papers are never one event. */
const NO_CONTENT_MATCH_CATEGORIES = new Set(["AI Research"]);

export type ContentStory = {
  title: string;
  entity: string | null | undefined;
  at: Date | null;
  category?: string | null;
};

/**
 * For each event word in a pool of headlines, how many *different* entities'
 * headlines use it. "safety", "seed round" and "reasoning" are spread across
 * many companies, so sharing them says nothing; "argon" or "disk access" in
 * one week's headlines belong to one subject.
 */
export function wordSpread(pool: { title: string; entity: string | null | undefined }[]): Map<string, number> {
  const entitiesByWord = new Map<string, Set<string>>();
  for (const story of pool) {
    const entity = normalizeEntityName(story.entity ?? "") || "(none)";
    for (const word of eventWords(story.title, [story.entity])) {
      const set = entitiesByWord.get(word) ?? new Set<string>();
      set.add(entity);
      entitiesByWord.set(word, set);
    }
  }
  return new Map([...entitiesByWord].map(([word, set]) => [word, set.size]));
}

/**
 * Whether two headlines report the same event although their wording differs
 * — returns the overlap (0..1) when they do, null when they do not.
 *
 * The headline test needs Jaccard ≥ 0.42 over all significant words, which
 * three outlets' takes on one announcement routinely miss ("Apple changes
 * full-disk access permissions…" / "Apple says it's tightening macOS 'Full Disk
 * Access' controls…"). This test compares only the words that name the event,
 * and makes up for that with stricter conditions:
 *
 *  - neither story is research, and neither entity is a topic;
 *  - both headlines name the entity — the same one, or each the other's
 *    ("Google releases Gemini 4 Argon" / "What is Gemini 4 Argon, Google's…"
 *    were filed under Google and Gemini respectively);
 *  - published within `CONTENT_MATCH_WINDOW_HOURS`;
 *  - at least `CONTENT_MATCH_MIN_SHARED` event words in common with a Jaccard
 *    of at least `CONTENT_MATCH_MIN_OVERLAP`, of which enough are *rare* in the
 *    pool (`wordSpread`) for the mode. Without a pool every word counts as rare.
 *
 * Tuned on a week of production headlines (720 stories, 2026-09-27 → 10-04):
 * see the fixtures in tests/ai-news-grouping.test.ts.
 */
export function sameEventByContent(
  a: ContentStory,
  b: ContentStory,
  options: { spread?: Map<string, number>; mode?: ContentMatchMode } = {},
): number | null {
  const mode = options.mode ?? "ingest";
  if (NO_CONTENT_MATCH_CATEGORIES.has(a.category ?? "") || NO_CONTENT_MATCH_CATEGORIES.has(b.category ?? "")) return null;

  const entityA = normalizeEntityName(a.entity ?? "");
  const entityB = normalizeEntityName(b.entity ?? "");
  if (!entityA || !entityB || TOPIC_ENTITIES.has(entityA) || TOPIC_ENTITIES.has(entityB)) return null;
  if (!a.at || !b.at || Math.abs(a.at.getTime() - b.at.getTime()) > CONTENT_MATCH_WINDOW_HOURS * 3_600_000) return null;

  const titleA = ` ${normalizeTitle(a.title)} `;
  const titleB = ` ${normalizeTitle(b.title)} `;
  // The entity has to be *in the headlines*, not just on the stories: an
  // entity inferred from body text is where mis-filing happens (two unrelated
  // seed rounds both filed under Google; SageMaker parts 1 and 2 under Amazon).
  const names = (title: string, entity: string) => title.includes(` ${entity} `);
  const related =
    (entityA === entityB && names(titleA, entityA) && names(titleB, entityB)) ||
    (names(titleA, entityB) && names(titleB, entityA));
  if (!related) return null;

  const wordsA = eventWords(a.title, [a.entity, b.entity]);
  const wordsB = eventWords(b.title, [a.entity, b.entity]);
  const shared = [...wordsA].filter((word) => wordsB.has(word));
  const union = wordsA.size + wordsB.size - shared.length;
  const overlap = union > 0 ? shared.length / union : 0;
  const rare = shared.filter((word) => (options.spread?.get(word) ?? 1) <= RARE_WORD_MAX_ENTITIES).length;

  return shared.length >= CONTENT_MATCH_MIN_SHARED &&
    overlap >= CONTENT_MATCH_MIN_OVERLAP &&
    rare >= RARE_WORDS_REQUIRED[mode]
    ? overlap
    : null;
}
