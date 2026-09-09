import Link from "next/link";
import { ArrowUpRight, Flame, TrendingUp } from "lucide-react";

import { cn } from "@/lib/utils";
import { cardInteractiveClassName } from "@/components/ui/card";
import { Numeric } from "@/components/ui/typography";
import { StoryImage } from "@/components/ai/story-image";
import { coverageLabel, relativeTime, shortRelativeTime, trendBadge } from "@/lib/ai-news/format";
import { slugFromCategory } from "@/lib/ai-news/constants";
import type { AiStoryCard as AiStory } from "@/services/ai-news";

/**
 * The three shapes a story is rendered in, and one badge.
 *
 * Server components throughout — a card has no state, and keeping them off the
 * client is most of why this page can be fast with a lot on it. The only client
 * component the cards pull in is `StoryImage`, which needs an `onError`.
 *
 * Every one of them treats a **null trend score as "render no badge"** rather
 * than as zero. That rule is load-bearing: a story with no usable publication
 * time is genuinely unrankable (see `computeTrendScore`), and a placeholder
 * would be the exact fabricated number the brief forbids.
 */

// ── The badge ────────────────────────────────────────────────────────────

/**
 * "Trending ↑ 94", or nothing.
 *
 * The arrow only appears when a *previous* score exists to compare against.
 * That is the whole point of the snapshot history: a story we have observed
 * once is popular, and a story we have watched climb is trending, and the page
 * is not allowed to claim the second when it only knows the first.
 */
export function TrendScoreBadge({
  score,
  previousScore,
  size = "sm",
  className,
}: {
  score: number | null | undefined;
  previousScore?: number | null;
  size?: "sm" | "lg";
  className?: string;
}) {
  const badge = trendBadge(score, previousScore);
  if (!badge) return null;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full font-semibold whitespace-nowrap",
        badge.rising ? "bg-primary/12 text-primary" : "bg-secondary-bg text-body",
        size === "lg" ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-xs",
        className,
      )}
      // The number is ours and the label says so — "BharatHunt Trend Score", not
      // "trending on the internet".
      title={`BharatHunt Trend Score ${badge.score} of 100${
        badge.delta === null ? "" : ` · ${badge.delta > 0 ? "+" : ""}${badge.delta} in the last day`
      }`}
    >
      {badge.rising ? (
        <TrendingUp aria-hidden="true" className={size === "lg" ? "size-4" : "size-3"} />
      ) : null}
      <span className="sr-only">BharatHunt Trend Score</span>
      <Numeric>{badge.score}</Numeric>
    </span>
  );
}

// ── Shared bits ──────────────────────────────────────────────────────────

function CategoryChip({ category, className }: { category: string; className?: string }) {
  const slug = slugFromCategory(category);
  const chip = (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-primary/8 px-2.5 py-0.5 text-xs font-semibold text-primary",
        className,
      )}
    >
      {category}
    </span>
  );

  // A category with no slug is one an admin typed that is no longer in the
  // taxonomy. It still renders; it just does not link anywhere.
  return slug ? (
    <Link href={`/ai?category=${slug}`} className="transition-opacity hover:opacity-80">
      {chip}
    </Link>
  ) : (
    chip
  );
}

/** "TechCrunch · 32 min ago · Covered by 4 sources" */
function MetaLine({
  story,
  now,
  className,
}: {
  story: AiStory;
  now: Date;
  className?: string;
}) {
  const when = relativeTime(story.last_seen_at, now);
  const coverage = story.source_count > 1 ? coverageLabel(story.source_count) : null;

  return (
    <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted", className)}>
      {story.top_source_name ? (
        <span className="font-medium text-body">{story.top_source_name}</span>
      ) : null}
      {when ? (
        <>
          <span aria-hidden="true">·</span>
          {/* `dateTime` carries the machine-readable instant so the relative
              string never has to be parsed back by anything. */}
          <time dateTime={story.last_seen_at ?? undefined}>{when}</time>
        </>
      ) : null}
      {coverage ? (
        <>
          <span aria-hidden="true">·</span>
          <span>{coverage}</span>
        </>
      ) : null}
    </div>
  );
}

// ── The feed card ────────────────────────────────────────────────────────

/**
 * The card in "Latest AI News" and in a filtered feed.
 *
 * The whole card is a link to the story page, not to the publisher. That is the
 * product: /ai/[slug] is where the sources are listed and where the outbound
 * links live, and sending a reader straight out would make this an RSS reader
 * with extra steps.
 */
export function StoryCard({
  story,
  now,
  headingLevel: Heading = "h3",
}: {
  story: AiStory;
  now: Date;
  headingLevel?: "h2" | "h3";
}) {
  return (
    <article
      className={cn(
        "group relative flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:p-5",
        cardInteractiveClassName,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <CategoryChip category={story.category} />
        <TrendScoreBadge score={story.trend_score} />
      </div>

      <Heading className="text-base leading-snug font-bold text-ink sm:text-lg">
        {/* The stretched pseudo-element makes the whole card clickable while
            leaving the category chip above it as a separate, real link. */}
        <Link href={`/ai/${story.slug}`} className="after:absolute after:inset-0">
          {story.title}
        </Link>
      </Heading>

      {story.summary ? (
        <p className="line-clamp-3 text-sm leading-relaxed text-body">{story.summary}</p>
      ) : null}

      <MetaLine story={story} now={now} className="mt-auto pt-1" />
    </article>
  );
}

// ── The trending rail card ───────────────────────────────────────────────

/**
 * The compact, ranked row in "🔥 Trending Now".
 *
 * Ranked visually by position rather than by printing the score large: the
 * ordering is the claim, and a column of two-digit numbers reads as precision
 * this ranking does not have.
 */
export function TrendingStoryRow({
  story,
  rank,
  now,
}: {
  story: AiStory;
  rank: number;
  now: Date;
}) {
  const when = shortRelativeTime(story.last_seen_at, now);

  return (
    <article className="group relative flex gap-3 rounded-xl border border-transparent p-3 transition-colors hover:border-border hover:bg-secondary-bg/60">
      <span
        aria-hidden="true"
        className="mt-0.5 w-6 shrink-0 text-right text-sm font-bold text-muted-soft tabular-nums"
      >
        {rank}
      </span>

      <div className="flex min-w-0 flex-col gap-1.5">
        <h3 className="text-sm leading-snug font-semibold text-ink">
          <Link href={`/ai/${story.slug}`} className="after:absolute after:inset-0">
            {story.title}
          </Link>
        </h3>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span className="font-medium text-primary">{story.category}</span>
          {when ? (
            <>
              <span aria-hidden="true">·</span>
              <time dateTime={story.last_seen_at ?? undefined}>{when}</time>
            </>
          ) : null}
          {story.source_count > 1 ? (
            <>
              <span aria-hidden="true">·</span>
              <span>
                <Numeric>{story.source_count}</Numeric> sources
              </span>
            </>
          ) : null}
          <TrendScoreBadge score={story.trend_score} className="ml-auto" />
        </div>
      </div>
    </article>
  );
}

// ── The featured card ────────────────────────────────────────────────────

/**
 * "Top AI Story" — the one large card (section 6).
 *
 * Which story this is comes from `getFeaturedAiStory`: an admin's pin if one is
 * set, otherwise the highest-ranked live story. Never hardcoded, and never a
 * placeholder — the page renders its empty state instead when nothing is live.
 */
export function FeaturedStory({ story, now }: { story: AiStory; now: Date }) {
  const when = relativeTime(story.last_seen_at, now);

  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-3xl border border-border bg-card",
        cardInteractiveClassName,
      )}
    >
      <div className="grid gap-0 md:grid-cols-[1.15fr_1fr]">
        <div className="flex flex-col gap-4 p-5 sm:p-7">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-dark px-3 py-1 text-xs font-bold tracking-wide text-white uppercase">
              <Flame aria-hidden="true" className="size-3.5 text-primary" />
              Top AI story
            </span>
            <CategoryChip category={story.category} />
            <TrendScoreBadge score={story.trend_score} size="lg" />
          </div>

          <h2 className="text-2xl leading-tight font-bold text-ink sm:text-3xl">
            <Link href={`/ai/${story.slug}`} className="after:absolute after:inset-0">
              {story.title}
            </Link>
          </h2>

          {story.summary ? (
            <p className="text-sm leading-relaxed text-body sm:text-base">{story.summary}</p>
          ) : null}

          <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted">
            {story.top_source_name ? (
              <span className="font-semibold text-body">{story.top_source_name}</span>
            ) : null}
            {when ? (
              <time dateTime={story.last_seen_at ?? undefined}>{when}</time>
            ) : null}
            {story.source_count > 1 ? <span>{coverageLabel(story.source_count)}</span> : null}
            <span className="inline-flex items-center gap-1 font-semibold text-primary">
              Read story
              <ArrowUpRight aria-hidden="true" className="size-4" />
            </span>
          </div>
        </div>

        {/* The image is decoration on this card, so it is last in the DOM and
            hidden below `md` — a phone gets the headline and the summary
            without paying for a third-party image request first. */}
        {story.image_url ? (
          <div className="relative hidden min-h-56 bg-secondary-bg md:block">
            <StoryImage src={story.image_url} alt="" eager />
          </div>
        ) : null}
      </div>
    </article>
  );
}
