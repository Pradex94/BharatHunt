import Link from "next/link";
import { ArrowUpRight, Flame, Info, TrendingUp } from "lucide-react";

import { cn } from "@/lib/utils";
import { cardInteractiveClassName } from "@/components/ui/card";
import { Numeric } from "@/components/ui/typography";
import { SpikeMark } from "@/components/ui/spike-mark";
import { IndiaFlag } from "@/components/ui/india-flag";
import { StoryImage } from "@/components/ai/story-image";
import { relativeTime, shortRelativeTime, trendBadge } from "@/lib/ai-news/format";
import { slugFromCategory } from "@/lib/ai-news/constants";
import { cardSummary, type WhyItMatters } from "@/lib/ai-news/signals";
import type { AiStoryCard as AiStory } from "@/services/ai-news";

/**
 * Every shape a story is rendered in on /ai, plus the badge, the source line
 * and the "Why it matters" note.
 *
 * Server components throughout — a card has no state, and keeping them off the
 * client is most of why this page can be fast with a lot on it. The only client
 * component the cards pull in is `StoryImage`, which needs an `onError`.
 *
 * Two rules every card here keeps:
 *
 *  - **A null trend score renders no badge**, never a zero. A story with no
 *    usable publication time is unrankable by design (see `computeTrendScore`).
 *  - **The publisher is always visible and one tap away.** The card itself
 *    links to our story page (where every covering source is listed), and the
 *    "Read original" link beside the source name goes straight to the lead
 *    publisher. It sits above the card's stretched link (`relative z-10`) so
 *    the two never compete for a tap.
 */

// ── The badge ────────────────────────────────────────────────────────────

/**
 * "Trending ↑ 94", or nothing.
 *
 * The arrow only appears when a *previous* score exists to compare against: a
 * story we have observed once is popular, and a story we have watched climb is
 * trending, and the page may not claim the second when it only knows the first.
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

export function CategoryChip({ category, className }: { category: string; className?: string }) {
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

  // Above the stretched card link, so the chip filters instead of opening the story.
  return slug ? (
    <Link
      href={`/ai?category=${slug}`}
      className="relative z-10 transition-opacity hover:opacity-80"
    >
      {chip}
    </Link>
  ) : (
    chip
  );
}

/**
 * The branded stand-in for a missing or broken image — used only where a
 * layout has already reserved an image slot, so the slot is never blank.
 */
export function ImageFallback({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex size-full items-center justify-center bg-secondary-bg text-primary/35",
        className,
      )}
    >
      <SpikeMark className="size-1/3 max-h-12 max-w-12" />
    </div>
  );
}

/** Region tag for India coverage — the one tag besides the category every card can honestly carry. */
function RegionTag({ region }: { region: string }) {
  if (region !== "india") return null;
  return (
    <Link
      href="/ai?region=india"
      className="relative z-10 inline-flex items-center gap-1 rounded-full bg-secondary-bg px-2 py-0.5 text-xs font-medium text-body hover:text-ink"
    >
      <IndiaFlag className="h-2.5 w-[15px] rounded-[1px]" />
      India
    </Link>
  );
}

/**
 * "Source: TechCrunch · 3h ago · 5 sources · Read original ↗"
 *
 * The lead publisher by name, when the story was last covered, how many
 * publications covered it, and a direct link out.
 */
export function SourceLine({
  story,
  now,
  compact = false,
  className,
}: {
  story: AiStory;
  now: Date;
  compact?: boolean;
  className?: string;
}) {
  const when = compact
    ? shortRelativeTime(story.last_seen_at, now)
    : relativeTime(story.last_seen_at, now);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted",
        className,
      )}
    >
      {story.top_source_name ? (
        <span>
          {compact ? null : <span className="text-muted-soft">Source: </span>}
          <span className="font-semibold text-body">{story.top_source_name}</span>
        </span>
      ) : null}
      {when ? (
        <>
          <span aria-hidden="true">·</span>
          <time dateTime={story.last_seen_at ?? undefined}>{when}</time>
        </>
      ) : null}
      {story.source_count > 1 ? (
        <>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1 font-medium text-body">
            <Numeric>{story.source_count}</Numeric> sources
          </span>
        </>
      ) : null}
      {!compact && story.top_source_url ? (
        <>
          <span aria-hidden="true">·</span>
          <a
            href={story.top_source_url}
            target="_blank"
            // `nofollow`: aggregated outbound linking at volume, not an
            // editorial endorsement of each destination.
            rel="noopener noreferrer nofollow"
            className="relative z-10 inline-flex items-center gap-0.5 font-semibold text-primary hover:underline"
          >
            Read original
            <ArrowUpRight aria-hidden="true" className="size-3" />
            <span className="sr-only">(opens {story.top_source_name ?? "the publisher"})</span>
          </a>
        </>
      ) : null}
    </div>
  );
}

/**
 * The "Why it matters" note.
 *
 * Labelled as automated every time it appears. It is built from coverage counts
 * and ranking (`whyItMatters` in lib/ai-news/signals.ts), not from reading the
 * article, and a reader must not mistake it for editorial analysis.
 */
export function WhyItMattersNote({
  why,
  className,
}: {
  why: WhyItMatters;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-primary/15 bg-primary/[0.04] px-3.5 py-3 text-sm",
        className,
      )}
    >
      <p className="text-xs font-bold tracking-wide text-primary uppercase">Why it matters</p>
      <p className="mt-1 leading-relaxed text-body">{why.signal}</p>
      {why.audience ? (
        <p className="mt-1 leading-relaxed text-body">
          <span className="font-semibold text-ink">Most relevant to:</span> {why.audience}.
        </p>
      ) : null}
      <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-soft">
        <Info aria-hidden="true" className="size-3" />
        Automated context from coverage data — not editorial analysis.
      </p>
    </div>
  );
}

// ── The feed card ────────────────────────────────────────────────────────

/**
 * One story in a feed: a dense row that scans in a glance.
 *
 * Title first, then the one or two sentences of the summary that do not repeat
 * it, then the source line. The thumbnail slot is only reserved when the story
 * has an image; if that image then fails, the slot shows the branded fallback
 * rather than collapsing and shifting the row.
 */
export function StoryCard({
  story,
  now,
  headingLevel: Heading = "h3",
  className,
}: {
  story: AiStory;
  now: Date;
  headingLevel?: "h2" | "h3";
  className?: string;
}) {
  const summary = cardSummary(story.summary, story.title);

  return (
    <article
      className={cn(
        "group relative flex gap-4 rounded-2xl border border-border bg-card p-4 sm:p-5",
        cardInteractiveClassName,
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <CategoryChip category={story.category} />
          <RegionTag region={story.region} />
          <TrendScoreBadge score={story.trend_score} className="ml-auto" />
        </div>

        <Heading className="text-base leading-snug font-bold text-ink group-hover:text-primary sm:text-[17px]">
          {/* The stretched pseudo-element makes the whole card open the story. */}
          <Link href={`/ai/${story.slug}`} className="after:absolute after:inset-0">
            {story.title}
          </Link>
        </Heading>

        {summary ? (
          <p className="line-clamp-2 text-sm leading-relaxed text-body">{summary}</p>
        ) : null}

        <SourceLine story={story} now={now} className="mt-auto pt-1" />
      </div>

      {story.image_url ? (
        <div className="relative size-20 shrink-0 self-start overflow-hidden rounded-xl bg-secondary-bg sm:size-28">
          <StoryImage src={story.image_url} alt="" fallback={<ImageFallback />} />
        </div>
      ) : null}
    </article>
  );
}

// ── The compact card (Trending Now's secondary column) ───────────────────

export function SideStory({ story, now, rank }: { story: AiStory; now: Date; rank?: number }) {
  return (
    <article className="group relative flex gap-3 rounded-2xl border border-border bg-card p-3.5 transition-colors hover:border-primary/30">
      {story.image_url ? (
        <div className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-secondary-bg sm:size-[72px]">
          <StoryImage src={story.image_url} alt="" fallback={<ImageFallback />} />
        </div>
      ) : rank !== undefined ? (
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary-bg text-sm font-bold text-primary tabular-nums"
        >
          {rank}
        </span>
      ) : null}

      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-xs font-semibold text-primary">{story.category}</span>
        <h3 className="line-clamp-3 text-sm leading-snug font-bold text-ink group-hover:text-primary">
          <Link href={`/ai/${story.slug}`} className="after:absolute after:inset-0">
            {story.title}
          </Link>
        </h3>
        <SourceLine story={story} now={now} compact />
      </div>
    </article>
  );
}

// ── The featured card ────────────────────────────────────────────────────

/**
 * The lead story of Trending Now.
 *
 * Which story this is comes from `getFeaturedAiStory`: an admin's pin if one is
 * set, otherwise the highest-ranked live story. Deterministic — the same story
 * for every visitor between ingestion runs, never a random pick.
 */
export function FeaturedStory({
  story,
  now,
  why,
}: {
  story: AiStory;
  now: Date;
  why?: WhyItMatters | null;
}) {
  const summary = cardSummary(story.summary, story.title);

  return (
    <article
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-3xl border border-border bg-card",
        cardInteractiveClassName,
      )}
    >
      {story.image_url ? (
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-secondary-bg sm:aspect-[2/1]">
          <StoryImage src={story.image_url} alt="" eager fallback={<ImageFallback />} />
        </div>
      ) : null}

      <div className="flex flex-1 flex-col gap-3 p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-dark px-2.5 py-1 text-xs font-bold tracking-wide text-white uppercase">
            <Flame aria-hidden="true" className="size-3.5 text-primary" />
            Top story
          </span>
          <CategoryChip category={story.category} />
          <RegionTag region={story.region} />
          <TrendScoreBadge score={story.trend_score} className="ml-auto" />
        </div>

        <h3 className="text-xl leading-tight font-bold text-ink group-hover:text-primary sm:text-2xl lg:text-[28px]">
          <Link href={`/ai/${story.slug}`} className="after:absolute after:inset-0">
            {story.title}
          </Link>
        </h3>

        {summary ? (
          <p className="line-clamp-3 text-sm leading-relaxed text-body sm:text-base">{summary}</p>
        ) : null}

        {why ? <WhyItMattersNote why={why} className="relative z-10" /> : null}

        <SourceLine story={story} now={now} className="mt-auto pt-1 text-sm" />
      </div>
    </article>
  );
}
