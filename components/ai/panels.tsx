import Link from "next/link";
import { ArrowUpRight, Building2, Hash, IndianRupee, Info } from "lucide-react";

import { cn } from "@/lib/utils";
import { Numeric } from "@/components/ui/typography";
import { changeLabel, relativeTime } from "@/lib/ai-news/format";
import { slugFromCategory } from "@/lib/ai-news/constants";
import { TREND_WEIGHTS } from "@/lib/ai-news/trend";
import type {
  AiFundingRound,
  AiStoryCard,
  AiTrendingEntity,
  AiTrendingTopic,
} from "@/services/ai-news";

/**
 * The right-hand rails on /ai, and the empty states.
 *
 * All server components. None of them holds state, and every number in them
 * comes from a database rollup — `ai_trending_topics` and
 * `ai_trending_entities` both compare a window against the window before it, and
 * both return NULL for a change they cannot compute. **Every panel here treats
 * a null change as "print the count and no percentage."** That is the whole of
 * section 19's warning about fabricated percentages, and it is enforced in two
 * places (the SQL and `changeLabel`) rather than one.
 *
 * A panel with nothing in it renders nothing at all, rather than an empty box
 * with a heading — a rail full of "No data yet" boxes makes a young page look
 * broken, when the honest reading is simply that this section has not earned
 * its space yet.
 */

// ── Shell ────────────────────────────────────────────────────────────────

function Panel({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
          {icon}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** "↑ 32%" in orange, "↓ 12%" in neutral, or nothing at all. */
function ChangePill({ changePct }: { changePct: number | null }) {
  const label = changeLabel(changePct);
  if (!label || label === "No change") return null;

  const rising = (changePct ?? 0) > 0;
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums",
        rising ? "bg-primary/10 text-primary" : "bg-secondary-bg text-muted",
      )}
    >
      {label}
    </span>
  );
}

// ── Trending topics (section 19) ─────────────────────────────────────────

export function TrendingTopics({ topics }: { topics: AiTrendingTopic[] }) {
  if (topics.length === 0) return null;

  return (
    <Panel title="Trending AI topics" icon={<Hash aria-hidden="true" className="size-4 text-primary" />}>
      <ul className="flex flex-col">
        {topics.map((topic) => {
          const slug = slugFromCategory(topic.category);
          return (
            <li key={topic.category}>
              <Link
                href={slug ? `/ai?category=${slug}` : "/ai"}
                className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-secondary-bg"
              >
                <span className="min-w-0 truncate text-sm font-medium text-ink">
                  {topic.category}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-muted">
                    <Numeric>{topic.current_count}</Numeric>
                  </span>
                  <ChangePill changePct={topic.change_pct} />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {/*
       * Said once, quietly, rather than repeated on every row: the counts are
       * always real, and the percentages appear only where there was enough of a
       * previous window to divide by.
       */}
      <p className="mt-2 px-2 text-xs text-muted-soft">
        Stories in the last 24 hours, against the 24 before it. A change is shown
        only where the earlier window had enough coverage to compare against.
      </p>
    </Panel>
  );
}

// ── Companies making noise (section 18) ──────────────────────────────────

export function CompaniesMakingNoise({ companies }: { companies: AiTrendingEntity[] }) {
  if (companies.length === 0) return null;

  return (
    <Panel
      title="AI companies making noise"
      icon={<Building2 aria-hidden="true" className="size-4 text-primary" />}
    >
      <ul className="flex flex-col gap-1">
        {companies.map((company) => (
          <li key={company.id} className="rounded-lg px-2 py-2 transition-colors hover:bg-secondary-bg">
            <div className="flex items-center justify-between gap-2">
              <Link
                href={`/ai?q=${encodeURIComponent(company.name)}`}
                className="min-w-0 truncate text-sm font-semibold text-ink hover:text-primary"
              >
                {company.name}
              </Link>
              <ChangePill changePct={company.change_pct} />
            </div>

            <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
              <span>
                <Numeric>{company.current_count}</Numeric>{" "}
                {company.current_count === 1 ? "story" : "stories"}
              </span>
            </div>

            {company.latest_story_slug && company.latest_story_title ? (
              <Link
                href={`/ai/${company.latest_story_slug}`}
                className="mt-1 line-clamp-1 block text-xs text-body hover:text-primary"
              >
                {company.latest_story_title}
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

// ── AI in India (section 20) ─────────────────────────────────────────────

export function IndiaPanel({ stories, now }: { stories: AiStoryCard[]; now: Date }) {
  if (stories.length === 0) return null;

  return (
    <Panel
      title="🇮🇳 AI in India"
      action={
        <Link href="/ai?region=india" className="text-xs font-semibold text-primary hover:underline">
          See all
        </Link>
      }
    >
      <ul className="flex flex-col gap-1">
        {stories.map((story) => {
          const when = relativeTime(story.last_seen_at, now);
          return (
            <li key={story.id}>
              <Link
                href={`/ai/${story.slug}`}
                className="block rounded-lg px-2 py-2 transition-colors hover:bg-secondary-bg"
              >
                <span className="line-clamp-2 text-sm leading-snug font-medium text-ink">
                  {story.title}
                </span>
                <span className="mt-1 flex items-center gap-2 text-xs text-muted">
                  <span className="font-medium text-primary">{story.category}</span>
                  {when ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <time dateTime={story.last_seen_at ?? undefined}>{when}</time>
                    </>
                  ) : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

// ── AI funding (section 21) ──────────────────────────────────────────────

/**
 * Recent AI rounds, read from the Funding Intelligence dataset.
 *
 * Not a second funding system — five rows off `funding_rounds`, which that
 * feature already owns, publishes and moderates (section 21: reuse it, do not
 * duplicate it).
 *
 * The links are chosen to be unbreakable rather than maximally specific.
 * `/funding?industry=ai` and `/funding?q=<name>` are query strings on a page
 * that always exists; `/funding/<startup_slug>` would be the more direct link
 * and is not safe to construct here, because that route resolves against
 * `funding_startups.slug`, which is de-duplicated with a suffix when two
 * companies slugify alike — so the round's denormalised `startup_slug` is not
 * guaranteed to be the profile's. A wrong link on this panel would be a 404 on
 * somebody else's feature.
 */
export function AiFundingPanel({ rounds }: { rounds: AiFundingRound[] }) {
  if (rounds.length === 0) return null;

  return (
    <Panel
      title="AI funding"
      icon={<IndianRupee aria-hidden="true" className="size-4 text-primary" />}
      action={
        <Link
          href="/funding?industry=ai"
          className="text-xs font-semibold text-primary hover:underline"
        >
          See all
        </Link>
      }
    >
      <ul className="flex flex-col gap-2">
        {rounds.map((round) => (
          <li key={round.id} className="rounded-lg px-2 py-2 transition-colors hover:bg-secondary-bg">
            <div className="flex items-baseline justify-between gap-2">
              <Link
                href={`/funding?q=${encodeURIComponent(round.startup_name)}`}
                className="min-w-0 truncate text-sm font-semibold text-ink hover:text-primary"
              >
                {round.startup_name}
              </Link>
              {round.amount ? (
                <span className="shrink-0 text-sm font-semibold text-primary">
                  <Numeric>{round.amount}</Numeric>
                </span>
              ) : null}
            </div>

            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
              <span>{round.funding_stage}</span>
              {round.lead_investor ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="min-w-0 truncate">Led by {round.lead_investor}</span>
                </>
              ) : null}
            </div>

            <a
              href={round.source_url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-body hover:text-primary"
            >
              {round.source_name}
              <ArrowUpRight aria-hidden="true" className="size-3" />
            </a>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

// ── Methodology ──────────────────────────────────────────────────────────

/**
 * What the number on every card actually is.
 *
 * A ranking that will not explain itself is a ranking nobody should trust, and
 * this one is ours rather than an industry figure — so it says so, in the
 * reader's words, on the page where it is used. The weights are read from
 * `TREND_WEIGHTS` rather than typed here, so this cannot drift away from the
 * formula it describes.
 */
export function TrendScoreExplainer() {
  const percent = (weight: number) => `${Math.round(weight * 100)}%`;

  return (
    <section className="rounded-2xl border border-border bg-secondary-bg/60 p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
        <Info aria-hidden="true" className="size-4 text-primary" />
        How the BharatHunt Trend Score works
      </h2>
      <p className="mt-2 text-xs leading-relaxed text-body">
        Our own 0-100 ranking, not an industry metric and not anyone else&rsquo;s
        &ldquo;trending&rdquo; number. It combines how recently a story was covered (
        {percent(TREND_WEIGHTS.recency)}), how many independent publications covered it (
        {percent(TREND_WEIGHTS.sources)}), how fast that coverage is arriving right now (
        {percent(TREND_WEIGHTS.velocity)}), how reliable those sources are (
        {percent(TREND_WEIGHTS.authority)}) and how many people opened the story (
        {percent(TREND_WEIGHTS.engagement)}).
      </p>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        A story we cannot date carries no score at all rather than a made-up one, so
        some cards show no badge. Summaries are written by Bharat Hunt from the
        headline and the coverage — the original article is always the source of
        truth, and every link goes to the publisher.
      </p>
    </section>
  );
}

// ── Empty states (section 31) ────────────────────────────────────────────

/**
 * The empty states, in one component with an explicit `reason`.
 *
 * Written as separate sentences per reason rather than one generic "Nothing
 * found", because they are not the same situation: a filter that matched
 * nothing is the reader's to fix, and a pipeline that has not run is ours. What
 * none of them does is show news to look populated.
 */
export function AiEmptyState({
  reason,
  query,
}: {
  reason: "no-results" | "no-trending" | "unavailable" | "not-set-up";
  query?: string;
}) {
  const copy: Record<typeof reason, { title: string; body: React.ReactNode }> = {
    "no-results": {
      title: query ? `No AI stories match “${query}”.` : "No AI stories match your filters.",
      body: (
        <>
          Try a broader search, or{" "}
          <Link href="/ai" className="font-semibold text-primary hover:underline">
            clear the filters
          </Link>{" "}
          to see everything.
        </>
      ),
    },
    "no-trending": {
      title: "No trending AI stories right now.",
      body: "Nothing has been covered widely enough in the last day to rank. Check back after the next ingestion run.",
    },
    unavailable: {
      title: "News ingestion is temporarily unavailable.",
      body: "The pipeline has not completed a run recently, so what is below may be behind. Nothing here is ever filled in with placeholder news.",
    },
    "not-set-up": {
      title: "No AI stories yet.",
      body: "Ingestion has not run against the configured sources. An admin can start the first run from the AI news dashboard.",
    },
  };

  const { title, body } = copy[reason];

  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
      <p className="text-sm font-semibold text-ink">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">{body}</p>
    </div>
  );
}
