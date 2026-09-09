/**
 * The BharatHunt Trend Score.
 *
 * **This is Bharat Hunt's own ranking. It is not Google Trends, it is not a
 * publisher's metric, and it is not any third party's "trending" number.** It
 * exists to answer one question — *what is happening in AI right now* — and it
 * is computed here, from signals this pipeline observed, so that every number
 * printed on /ai can be explained.
 *
 * The five terms, and why each is in the formula
 * ----------------------------------------------
 *  - **Recency** (32%): when the story was last covered. Decayed on a half-life
 *    rather than a cliff, so a story fades instead of disappearing at an
 *    arbitrary age.
 *  - **Sources** (28%): how many *independent publications* covered it. The
 *    single hardest signal to manufacture and the one that separates a real
 *    event from one outlet's post — which is precisely why the story/article
 *    split exists in the schema.
 *  - **Velocity** (20%): how fast that coverage is arriving *now*, not how much
 *    of it there has ever been. Section 16 is explicit: eight articles in two
 *    hours must beat ten articles spread over a month. Velocity is the term
 *    that makes "trending" different from "popular".
 *  - **Authority** (12%): the reliability of the sources covering it. A lab's
 *    own announcement and an aggregator's link are not equal evidence
 *    (section 22).
 *  - **Engagement** (8%): opens of the story page on Bharat Hunt, plus whatever
 *    public interaction count a covering source's own API reports (Hacker News
 *    points and comments, today). Log-scaled and weighted lowest because it is
 *    the softest signal and the most gameable, and because most stories have no
 *    external figure at all.
 *
 * What is deliberately *not* in it
 * --------------------------------
 * Social share counts and "mentions" scraped from platforms that do not offer
 * them for this purpose. No term exists for those, rather than a term that
 * quietly evaluates to a constant and makes the formula look richer than it is.
 * When a supported API does publish a count, it arrives through
 * `externalEngagement` and nowhere else.
 *
 * When the score is null
 * ----------------------
 * `computeTrendScore` returns null when there is no usable publication time or
 * no source at all. Two of the five terms are time-derived, so a story without
 * a clock is a story we cannot rank; re-weighting the remaining terms to fill
 * the gap would be inventing a number, which section 4 forbids. A null score
 * sorts last and renders as no badge.
 *
 * Pure and dependency-free — `tests/ai-news-trend.test.ts` runs the real
 * function, including the section 16 comparison above.
 */

// ── Tuning ───────────────────────────────────────────────────────────────

/** The five weights. They sum to 1, so the result is already 0..100. */
export const TREND_WEIGHTS = {
  recency: 0.32,
  sources: 0.28,
  velocity: 0.2,
  authority: 0.12,
  engagement: 0.08,
} as const;

/**
 * Hours for the recency term to halve.
 *
 * Eighteen, which puts a morning story at roughly two-thirds of its opening
 * recency by that evening and a third of it the next morning. Shorter and the
 * page would churn through stories faster than anyone reads them; longer and
 * yesterday would keep outranking today.
 */
export const RECENCY_HALF_LIFE_HOURS = 18;

/**
 * The source count at which the sources term is effectively maxed.
 *
 * Six. The distance between one source and three is the whole signal — it is
 * the difference between a post and an event — while the distance between eight
 * and twelve says more about how many outlets rewrite wire copy than about the
 * story.
 */
const SOURCE_SATURATION = 6;

/** The window "right now" means for the velocity term. */
export const VELOCITY_WINDOW_HOURS = 6;

/** Articles per hour inside that window at which velocity is maxed. */
const VELOCITY_SATURATION = 3;

/** Story-page opens at which the engagement term is maxed. */
const ENGAGEMENT_SATURATION = 500;

export type TrendInput = {
  /**
   * One timestamp per article covering the story — its publication time, or the
   * time it was fetched when the feed gave no usable date.
   */
  articleTimes: Date[];
  /** Distinct publications covering it. From `ai_stories.source_count`. */
  sourceCount: number;
  /** `reliability_score` of each covering source, 0..1. */
  sourceReliabilities: number[];
  /** Story-page opens on Bharat Hunt. */
  viewCount: number;
  /**
   * Public interaction counts the covering sources' own APIs report, summed —
   * Hacker News points plus comments, today. Zero when no covering source
   * publishes one, which is the common case and is why it cannot be the whole
   * engagement term.
   */
  externalEngagement?: number;
  now?: Date;
};

export type TrendBreakdown = {
  /** 0..100, or null when the story cannot honestly be ranked. */
  trendScore: number | null;
  recency: number | null;
  sources: number;
  velocity: number | null;
  authority: number;
  engagement: number;
  /** Everything the score was derived from, for /admin/ai-news. */
  inputs: {
    hoursSinceLastArticle: number | null;
    articlesInVelocityWindow: number;
    articlesPerHour: number | null;
    sourceCount: number;
    viewCount: number;
    externalEngagement: number;
  };
};

const HOUR_MS = 60 * 60 * 1000;

function clamp100(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Log-shaped 0..100 ramp that reaches ~100 at `saturation`. */
function logRamp(value: number, saturation: number): number {
  if (value <= 0) return 0;
  return clamp100((Math.log1p(value) / Math.log1p(saturation)) * 100);
}

/**
 * The score, and every part of it.
 *
 * Returns the breakdown even when `trendScore` is null, because /admin/ai-news
 * shows an unrankable story alongside the reason it is unrankable, and "no
 * usable timestamps" is more useful to an operator than a blank cell.
 */
export function computeTrendScore(input: TrendInput): TrendBreakdown {
  const now = input.now ?? new Date();
  const times = (input.articleTimes ?? [])
    .filter((date): date is Date => date instanceof Date && !Number.isNaN(date.getTime()))
    // Ignore anything stamped in the future. `parsePublishedAt` already drops
    // these on the way in; this is the second line of defence, because a future
    // timestamp would otherwise pin recency at 100 forever.
    .filter((date) => date.getTime() <= now.getTime() + 5 * 60 * 1000)
    .sort((a, b) => b.getTime() - a.getTime());

  const sourceCount = Math.max(0, Math.trunc(input.sourceCount ?? 0));
  const viewCount = Math.max(0, Math.trunc(input.viewCount ?? 0));
  const externalEngagement = Math.max(0, Math.trunc(input.externalEngagement ?? 0));
  // One "engagement unit" is one person doing something with this story: an
  // open here, an upvote or a comment there. Summing them is a simplification
  // and an honest one — both are counts of human actions on the same story, and
  // weighting them against each other would need a conversion rate nobody has.
  const engagementUnits = viewCount + externalEngagement;

  // ── Authority ────────────────────────────────────────────────────────
  // Half the best source, half the average. The best source alone would let one
  // official announcement carry an otherwise thin story; the average alone
  // would let three aggregators drag down a lab's own post.
  const reliabilities = (input.sourceReliabilities ?? []).filter(
    (value) => typeof value === "number" && value >= 0 && value <= 1,
  );
  const bestReliability = reliabilities.length ? Math.max(...reliabilities) : 0;
  const meanReliability = reliabilities.length
    ? reliabilities.reduce((sum, value) => sum + value, 0) / reliabilities.length
    : 0;
  const authority = clamp100((bestReliability * 0.5 + meanReliability * 0.5) * 100);

  const sources = logRamp(sourceCount, SOURCE_SATURATION);
  const engagement = logRamp(engagementUnits, ENGAGEMENT_SATURATION);

  if (times.length === 0 || sourceCount === 0) {
    return {
      trendScore: null,
      recency: null,
      sources: round2(sources),
      velocity: null,
      authority: round2(authority),
      engagement: round2(engagement),
      inputs: {
        hoursSinceLastArticle: null,
        articlesInVelocityWindow: 0,
        articlesPerHour: null,
        sourceCount,
        viewCount,
        externalEngagement,
      },
    };
  }

  // ── Recency ──────────────────────────────────────────────────────────
  const hoursSinceLastArticle = Math.max(0, (now.getTime() - times[0].getTime()) / HOUR_MS);
  const recency = clamp100(100 * Math.pow(0.5, hoursSinceLastArticle / RECENCY_HALF_LIFE_HOURS));

  // ── Velocity ─────────────────────────────────────────────────────────
  // Articles per hour inside the window, where the divisor is the *observed*
  // span, not the window length. A story two hours old that has eight articles
  // is moving at four an hour; dividing by six instead would make it look like
  // 1.3 and let a slow story with a longer history overtake it — the exact
  // inversion section 16 warns about.
  const windowStart = now.getTime() - VELOCITY_WINDOW_HOURS * HOUR_MS;
  const inWindow = times.filter((date) => date.getTime() >= windowStart);
  const oldestInWindow = inWindow.length ? inWindow[inWindow.length - 1].getTime() : now.getTime();
  const observedSpanHours = Math.max(
    // Never divide by less than a quarter hour: three articles inside one minute
    // is a syndication burst, not a rate of 180 an hour.
    0.25,
    Math.min(VELOCITY_WINDOW_HOURS, (now.getTime() - oldestInWindow) / HOUR_MS),
  );
  const articlesPerHour = inWindow.length / observedSpanHours;
  const velocity = logRamp(articlesPerHour, VELOCITY_SATURATION);

  const trendScore = clamp100(
    TREND_WEIGHTS.recency * recency +
      TREND_WEIGHTS.sources * sources +
      TREND_WEIGHTS.velocity * velocity +
      TREND_WEIGHTS.authority * authority +
      TREND_WEIGHTS.engagement * engagement,
  );

  return {
    trendScore: round2(trendScore),
    recency: round2(recency),
    sources: round2(sources),
    velocity: round2(velocity),
    authority: round2(authority),
    engagement: round2(engagement),
    inputs: {
      hoursSinceLastArticle: round2(hoursSinceLastArticle),
      articlesInVelocityWindow: inWindow.length,
      articlesPerHour: round2(articlesPerHour),
      sourceCount,
      viewCount,
      externalEngagement,
    },
  };
}

// ── History ──────────────────────────────────────────────────────────────

/**
 * The UTC hour a snapshot belongs to, as `YYYY-MM-DDTHH`.
 *
 * Matches the CHECK on `ai_trend_snapshots.bucket_hour`. Computed in the
 * application rather than by `date_trunc` because that function is STABLE for a
 * timestamptz — it reads the session time zone — and a unique index may only
 * contain immutable expressions. Doing it here also makes a second run inside
 * the same hour an upsert instead of a duplicate row.
 */
export function hourBucket(at: Date = new Date()): string {
  return at.toISOString().slice(0, 13);
}

export type TrendDirection = "up" | "down" | "flat";

/**
 * Which way the score has moved, or null when there is nothing to compare with.
 *
 * Null is the common case for a story we have only just seen, and it must stay
 * distinguishable from "flat": section 15 exists so the page can say *rising*
 * rather than merely *popular*, and a story with one data point has not been
 * observed rising. The UI prints a plain score in that case, no arrow.
 *
 * `MIN_DELTA` keeps a two-point wobble from being reported as a trend.
 */
export function trendDirection(
  current: number | null | undefined,
  previous: number | null | undefined,
  minDelta = 3,
): { direction: TrendDirection; delta: number } | null {
  if (current === null || current === undefined) return null;
  if (previous === null || previous === undefined) return null;

  const delta = round2(current - previous);
  if (Math.abs(delta) < minDelta) return { direction: "flat", delta };
  return { direction: delta > 0 ? "up" : "down", delta };
}
