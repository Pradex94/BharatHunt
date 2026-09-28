import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Boxes,
  Building2,
  Cpu,
  Flame,
  IndianRupee,
  Info,
  Minus,
  Newspaper,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wrench,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Numeric } from "@/components/ui/typography";
import { IndiaFlag } from "@/components/ui/india-flag";
import { SourceLine } from "@/components/ai/story-card";
import { changeLabel, relativeTime } from "@/lib/ai-news/format";
import { slugFromCategory } from "@/lib/ai-news/constants";
import { TREND_WEIGHTS } from "@/lib/ai-news/trend";
import {
  cardSummary,
  momentum,
  whyItMatters,
  type Brief,
  type Highlight,
  type Momentum,
} from "@/lib/ai-news/signals";
import type {
  AiFundingRound,
  AiPulse as AiPulseData,
  AiStoryCard,
  AiTrendingEntity,
  AiTrendingTopic,
} from "@/services/ai-news";

/**
 * The hub sections on /ai, and the empty states.
 *
 * All server components, and every number in them comes from a database rollup
 * over a stated window. Two rules hold everywhere:
 *
 *  - **A null change renders no direction.** `ai_trending_topics` and
 *    `ai_trending_entities` return a null `change_pct` when the earlier window
 *    was too small to compare against; the UI then prints the count alone, with
 *    no arrow and no "rising".
 *  - **A section with nothing in it renders nothing**, rather than a heading
 *    over "No data yet". A young dataset should look small, not broken.
 */

// ── Shells ───────────────────────────────────────────────────────────────

export function HubSection({
  id,
  icon,
  title,
  subtitle,
  action,
  children,
  className,
}: {
  id: string;
  icon?: React.ReactNode;
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      // Off-screen sections skip layout and paint until they are scrolled near.
      // The intrinsic size is a placeholder height so the scrollbar does not
      // jump as they render; `auto` then remembers the real one.
      className={cn(
        "flex scroll-mt-40 flex-col gap-4 [contain-intrinsic-size:auto_640px] [content-visibility:auto]",
        className,
      )}
    >
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div className="flex min-w-0 flex-col gap-1">
          <h2
            id={`${id}-title`}
            className="flex items-center gap-2 text-xl font-bold text-ink sm:text-2xl"
          >
            {icon}
            {title}
          </h2>
          {subtitle ? <p className="text-sm text-muted">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Panel({
  title,
  icon,
  action,
  children,
  className,
}: {
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-2xl border border-border bg-card p-4 sm:p-5", className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-ink">
          {icon}
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function SeeAll({ href, children = "See all" }: { href: string; children?: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-primary hover:underline"
    >
      {children}
      <ArrowRight aria-hidden="true" className="size-3.5" />
    </Link>
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
        "shrink-0 rounded-full px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap tabular-nums",
        rising ? "bg-primary/10 text-primary" : "bg-secondary-bg text-muted",
      )}
    >
      {label}
    </span>
  );
}

const MOMENTUM_COPY: Record<Momentum, { label: string; icon: typeof TrendingUp; tone: string }> = {
  rising: { label: "Rising", icon: TrendingUp, tone: "bg-primary/10 text-primary" },
  steady: { label: "Steady", icon: Minus, tone: "bg-secondary-bg text-body" },
  cooling: { label: "Cooling", icon: TrendingDown, tone: "bg-secondary-bg text-muted" },
};

function MomentumTag({ changePct }: { changePct: number | null }) {
  const state = momentum(changePct);
  if (!state) return null;
  const { label, icon: Icon, tone } = MOMENTUM_COPY[state];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
        tone,
      )}
      title={changeLabel(changePct) ?? undefined}
    >
      <Icon aria-hidden="true" className="size-3" />
      {label}
    </span>
  );
}

/** A two-letter monogram tile — no third-party logo fetches. */
function Monogram({ name, className }: { name: string; className?: string }) {
  const letters = name
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-dark text-sm font-bold text-white",
        className,
      )}
    >
      {letters || "AI"}
    </span>
  );
}

// ── AI Pulse ─────────────────────────────────────────────────────────────

type PulseTile = { label: string; window: string; value: number | null; always?: boolean };

/**
 * The headline counts, each printed with its window.
 *
 * Before the pulse migration is applied only the two counts `ai_news_freshness`
 * already provides are shown. A tile with a null or zero count is dropped
 * (except the story count itself), so the strip never pads itself with zeros.
 */
export function AiPulse({
  pulse,
  storiesToday,
  totalStories,
}: {
  pulse: AiPulseData | null;
  storiesToday: number;
  totalStories: number;
}) {
  const tiles: PulseTile[] = pulse
    ? [
        { label: "AI stories", window: "last 24 hours", value: pulse.stories_24h, always: true },
        { label: "Covered by 2+ sources", window: "last 24 hours", value: pulse.multi_source_24h },
        { label: "Publications reporting", window: "last 24 hours", value: pulse.sources_24h },
        { label: "Companies in the news", window: "last 7 days", value: pulse.companies_7d },
        { label: "Models mentioned", window: "last 7 days", value: pulse.models_7d },
        { label: "AI tools mentioned", window: "last 7 days", value: pulse.tools_7d },
      ]
    : [
        { label: "AI stories", window: "last 24 hours", value: storiesToday, always: true },
        { label: "Stories tracked", window: "all time", value: totalStories },
      ];

  const visible = tiles.filter((tile) => tile.always || (tile.value ?? 0) > 0);

  return (
    <section aria-labelledby="ai-pulse-title" className="flex flex-col gap-3">
      <h2
        id="ai-pulse-title"
        className="flex items-center gap-2 text-xs font-bold tracking-[0.14em] text-muted uppercase"
      >
        <span aria-hidden="true" className="size-1.5 rounded-full bg-primary" />
        AI Pulse
      </h2>
      <dl
        className={cn(
          "grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border",
          // Columns follow the tile count, so a short strip never leaves an
          // empty cell showing the grid's hairline background.
          visible.length >= 3 && "sm:grid-cols-3",
          visible.length === 4 && "lg:grid-cols-4",
          visible.length === 5 && "lg:grid-cols-5",
          visible.length >= 6 && "lg:grid-cols-6",
        )}
      >
        {visible.map((tile) => (
          <div key={tile.label} className="flex flex-col gap-1 bg-card px-4 py-3.5 sm:px-5 sm:py-4">
            <dd className="order-1 text-2xl font-bold text-ink sm:text-[28px]">
              <Numeric>{(tile.value ?? 0).toLocaleString("en-IN")}</Numeric>
            </dd>
            <dt className="order-2 text-sm leading-tight font-medium text-body">
              {tile.label}
              <span className="block text-xs font-normal text-muted-soft">{tile.window}</span>
            </dt>
          </div>
        ))}
      </dl>
    </section>
  );
}

// ── Today's AI Brief ─────────────────────────────────────────────────────

/**
 * The daily-visit view: the top stories of the last day, each with its source
 * and — where the coverage supports one — a one-line "why it matters".
 */
export function DailyBrief({
  brief,
  now,
  rankOf,
}: {
  brief: Brief<AiStoryCard>;
  now: Date;
  /**
   * A story's position in the trend-ordered pool. Not its position in the
   * brief: the brief skips the lead story, so its first item is not #1.
   */
  rankOf: (id: string) => number | undefined;
}) {
  if (brief.stories.length === 0) return null;

  return (
    <div className="flex flex-col rounded-3xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4 sm:px-6">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-bold text-ink">
            <Newspaper aria-hidden="true" className="size-5 text-primary" />
            {brief.windowHours <= 24 ? "Today’s AI Brief" : "The latest AI Brief"}
          </h3>
          <p className="mt-0.5 text-xs text-muted">
            {brief.windowHours <= 24
              ? "The top stories of the last 24 hours, by Trend Score."
              : "A quiet day so far — the top stories of the last 3 days, by Trend Score."}
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-secondary-bg px-2.5 py-1 text-[11px] font-semibold text-body">
          <Sparkles aria-hidden="true" className="size-3 text-primary" />
          BharatHunt AI Brief · automated
        </span>
      </div>

      <ol className="flex flex-col divide-y divide-border">
        {brief.stories.map((story, index) => {
          const summary = cardSummary(story.summary, story.title);
          const why = whyItMatters(story, rankOf(story.id));
          return (
            <li key={story.id} className="group relative flex gap-4 px-5 py-4 sm:px-6">
              <span
                aria-hidden="true"
                className="mt-0.5 w-5 shrink-0 text-lg font-bold text-primary tabular-nums"
              >
                {index + 1}
              </span>
              <div className="flex min-w-0 flex-col gap-1.5">
                <h4 className="text-[15px] leading-snug font-bold text-ink group-hover:text-primary">
                  <Link href={`/ai/${story.slug}`} className="after:absolute after:inset-0">
                    {story.title}
                  </Link>
                </h4>
                {summary ? (
                  <p className="line-clamp-2 text-sm leading-relaxed text-body">{summary}</p>
                ) : null}
                {why ? (
                  <p className="text-sm leading-relaxed text-body">
                    <span className="font-semibold text-primary">Why it matters: </span>
                    {why.signal}
                  </p>
                ) : null}
                <SourceLine story={story} now={now} />
              </div>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3.5 sm:px-6">
        <p className="flex items-center gap-1 text-[11px] text-muted-soft">
          <Info aria-hidden="true" className="size-3" />
          Assembled automatically from coverage data. Each original report is the source of truth.
        </p>
        <SeeAll href="/ai?date=24h#latest-news">View all AI news</SeeAll>
      </div>
    </div>
  );
}

// ── What's Hot ───────────────────────────────────────────────────────────

/**
 * Topics by story count this week, with a direction only where the previous
 * week had enough coverage to compare against (`min_prior` in SQL).
 */
export function WhatsHot({ topics }: { topics: AiTrendingTopic[] }) {
  if (topics.length === 0) return null;
  const max = Math.max(...topics.map((topic) => Number(topic.current_count)), 1);
  const anyDirection = topics.some((topic) => topic.change_pct !== null);

  return (
    <div className="flex h-full flex-col rounded-3xl border border-border bg-card p-5 sm:p-6">
      <h3 className="flex items-center gap-2 text-lg font-bold text-ink">
        <Flame aria-hidden="true" className="size-5 text-primary" />
        What’s Hot
      </h3>
      <p className="mt-0.5 text-xs text-muted">
        Topics by stories this week{anyDirection ? ", compared with last week" : ""}.
      </p>

      <ul className="mt-4 flex flex-col gap-1">
        {topics.map((topic) => {
          const slug = slugFromCategory(topic.category);
          const count = Number(topic.current_count);
          return (
            <li key={topic.category}>
              <Link
                href={slug ? `/ai?category=${slug}#latest-news` : "/ai"}
                className="group flex flex-col gap-1.5 rounded-xl px-2 py-2 transition-colors hover:bg-secondary-bg"
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-sm font-semibold text-ink group-hover:text-primary">
                    {topic.category}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-xs text-muted">
                      <Numeric>{count}</Numeric> {count === 1 ? "story" : "stories"}
                    </span>
                    <MomentumTag changePct={topic.change_pct} />
                  </span>
                </span>
                {/* A proportional bar: a relative count, drawn with no chart library. */}
                <span aria-hidden="true" className="h-1 overflow-hidden rounded-full bg-secondary-bg">
                  <span
                    className="block h-full rounded-full bg-primary/70"
                    style={{ width: `${Math.max(6, (count / max) * 100)}%` }}
                  />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      {anyDirection ? (
        <p className="mt-auto pt-3 text-[11px] leading-relaxed text-muted-soft">
          Rising or cooling means a change of 15% or more against the previous 7 days. Topics
          without enough earlier coverage show no direction.
        </p>
      ) : null}
    </div>
  );
}

// ── AI Tools & Model Watch ───────────────────────────────────────────────

/**
 * Tools named in this week's coverage. The pipeline knows a tool's name, its
 * website when the gazetteer has one, and the stories that mention it — so
 * that, and nothing invented, is what each card shows.
 */
export function ToolsTrending({ tools, now }: { tools: AiTrendingEntity[]; now: Date }) {
  if (tools.length === 0) return null;

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {tools.map((tool) => {
        const when = relativeTime(tool.latest_seen_at, now);
        return (
          <li
            key={tool.id}
            className="group relative flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/30"
          >
            <div className="flex items-center gap-3">
              <Monogram name={tool.name} />
              <div className="min-w-0 flex-1">
                <h3 className="line-clamp-2 text-base leading-snug font-bold break-words text-ink group-hover:text-primary">
                  <Link
                    href={`/ai?q=${encodeURIComponent(tool.name)}#latest-news`}
                    className="after:absolute after:inset-0"
                  >
                    {tool.name}
                  </Link>
                </h3>
                <p className="text-xs text-muted">
                  <Numeric>{Number(tool.current_count)}</Numeric>{" "}
                  {Number(tool.current_count) === 1 ? "story" : "stories"} this week
                </p>
              </div>
              <span className="self-start">
                <ChangePill changePct={tool.change_pct} />
              </span>
            </div>

            {tool.latest_story_title ? (
              <p className="line-clamp-2 text-sm leading-snug text-body">
                <span className="text-muted-soft">Latest: </span>
                {tool.latest_story_title}
                {when ? <span className="text-muted-soft"> · {when.toLowerCase()}</span> : null}
              </p>
            ) : null}

            <div className="mt-auto flex items-center justify-between gap-2 pt-1 text-sm">
              <span className="inline-flex items-center gap-1 font-semibold text-primary">
                Explore
                <ArrowRight aria-hidden="true" className="size-3.5" />
              </span>
              {tool.website ? (
                <a
                  href={tool.website}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="relative z-10 inline-flex items-center gap-0.5 text-xs font-medium text-muted hover:text-primary"
                >
                  Website
                  <ArrowUpRight aria-hidden="true" className="size-3" />
                </a>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Models in the news. No context windows, prices or benchmarks: none of those
 * can be sourced reliably from headlines, so the table shows what can — the
 * model, how much coverage it has, its direction, and the latest story, which
 * links through to the original reporting.
 */
export function ModelWatch({ models, now }: { models: AiTrendingEntity[]; now: Date }) {
  if (models.length === 0) return null;

  return (
    <Panel
      title="Model Watch"
      icon={<Cpu aria-hidden="true" className="size-4 text-primary" />}
      action={<SeeAll href="/ai?type=models#latest-news">All</SeeAll>}
    >
      <ul className="flex flex-col divide-y divide-border">
        {models.map((model) => {
          const when = relativeTime(model.latest_seen_at, now);
          return (
            <li key={model.id} className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0">
              <div className="flex items-center justify-between gap-2">
                <Link
                  href={`/ai?q=${encodeURIComponent(model.name)}#latest-news`}
                  className="min-w-0 truncate text-sm font-bold text-ink hover:text-primary"
                >
                  {model.name}
                </Link>
                <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
                  <Numeric>{Number(model.current_count)}</Numeric>
                  {Number(model.current_count) === 1 ? "story" : "stories"}
                  <ChangePill changePct={model.change_pct} />
                </span>
              </div>
              {model.latest_story_slug && model.latest_story_title ? (
                <Link
                  href={`/ai/${model.latest_story_slug}`}
                  className="line-clamp-1 text-xs text-body hover:text-primary"
                >
                  {model.latest_story_title}
                  {when ? <span className="text-muted-soft"> · {when.toLowerCase()}</span> : null}
                </Link>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[11px] text-muted-soft">Stories naming each model in the last 7 days.</p>
    </Panel>
  );
}

// ── Companies & Funding ──────────────────────────────────────────────────

function nameKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * Companies by coverage this week, joined in memory to the Funding
 * Intelligence rounds already fetched — one data set, not a copy of it.
 *
 * Funding links go to `/funding?q=<name>`: a query on a page that always
 * exists. `/funding/<startup_slug>` would be more direct but is not safe to
 * build from a round's denormalised slug (profiles are de-duplicated with a
 * suffix), and a wrong link here would be a 404 on another feature.
 */
export function CompaniesMakingMoves({
  companies,
  rounds,
}: {
  companies: AiTrendingEntity[];
  rounds: AiFundingRound[];
}) {
  if (companies.length === 0 && rounds.length === 0) return null;

  // Newest first already; keep one round per company, since the funding
  // dataset can hold the same round reported by two publications.
  const latestRounds = rounds.filter(
    (round, index) =>
      rounds.findIndex((other) => nameKey(other.startup_name) === nameKey(round.startup_name)) === index,
  );
  const roundsByName = new Map(latestRounds.map((round) => [nameKey(round.startup_name), round]));

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
      {companies.length > 0 ? (
        <Panel
          title="In the news this week"
          icon={<Building2 aria-hidden="true" className="size-4 text-primary" />}
        >
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {companies.map((company) => {
              const round = roundsByName.get(nameKey(company.name));
              const count = Number(company.current_count);
              return (
                <li
                  key={company.id}
                  className="flex flex-col gap-1.5 rounded-xl border border-border p-3 transition-colors hover:border-primary/30"
                >
                  <div className="flex items-center gap-2.5">
                    <Monogram name={company.name} className="size-8 rounded-lg text-xs" />
                    <Link
                      href={`/ai?q=${encodeURIComponent(company.name)}#latest-news`}
                      className="min-w-0 truncate text-sm font-bold text-ink hover:text-primary"
                    >
                      {company.name}
                    </Link>
                    <span className="ml-auto">
                      <ChangePill changePct={company.change_pct} />
                    </span>
                  </div>
                  <p className="text-xs text-muted">
                    <Numeric>{count}</Numeric> {count === 1 ? "story" : "stories"} this week
                    {round?.amount ? (
                      <>
                        {" · "}
                        <Link
                          href={`/funding?q=${encodeURIComponent(round.startup_name)}`}
                          className="font-semibold text-primary hover:underline"
                        >
                          Raised {round.amount}
                        </Link>
                      </>
                    ) : null}
                  </p>
                  {company.latest_story_slug && company.latest_story_title ? (
                    <Link
                      href={`/ai/${company.latest_story_slug}`}
                      className="line-clamp-2 text-xs leading-snug text-body hover:text-primary"
                    >
                      <span className="text-muted-soft">Latest: </span>
                      {company.latest_story_title}
                    </Link>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Panel>
      ) : null}

      {latestRounds.length > 0 ? (
        <Panel
          title="Latest AI funding"
          icon={<IndianRupee aria-hidden="true" className="size-4 text-primary" />}
          action={<SeeAll href="/funding?industry=ai">Funding Intelligence</SeeAll>}
        >
          <ul className="flex flex-col divide-y divide-border">
            {latestRounds.map((round) => (
              <li key={round.id} className="flex flex-col gap-0.5 py-2.5 first:pt-0 last:pb-0">
                <div className="flex items-baseline justify-between gap-2">
                  <Link
                    href={`/funding?q=${encodeURIComponent(round.startup_name)}`}
                    className="min-w-0 truncate text-sm font-bold text-ink hover:text-primary"
                  >
                    {round.startup_name}
                  </Link>
                  {round.amount ? (
                    <span className="shrink-0 text-sm font-bold text-primary">
                      <Numeric>{round.amount}</Numeric>
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                  <span>{round.funding_stage}</span>
                  {round.lead_investor ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="min-w-0 truncate">Led by {round.lead_investor}</span>
                    </>
                  ) : round.investors.length > 0 ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="min-w-0 truncate">{round.investors.slice(0, 2).join(", ")}</span>
                    </>
                  ) : null}
                  <span aria-hidden="true">·</span>
                  <a
                    href={round.source_url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="inline-flex items-center gap-0.5 font-medium text-body hover:text-primary"
                  >
                    {round.source_name}
                    <ArrowUpRight aria-hidden="true" className="size-3" />
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}

// ── AI in India ──────────────────────────────────────────────────────────

export function IndiaPanel({ stories, now }: { stories: AiStoryCard[]; now: Date }) {
  if (stories.length === 0) return null;

  return (
    <Panel
      title="AI in India"
      icon={<IndiaFlag className="h-3 w-[18px] rounded-[2px]" />}
      action={<SeeAll href="/ai?region=india#latest-news">All</SeeAll>}
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
                <span className="line-clamp-2 text-sm leading-snug font-semibold text-ink">
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

// ── Highlights ───────────────────────────────────────────────────────────

export function AiHighlights({
  highlights,
  now,
}: {
  highlights: Highlight<AiStoryCard>[];
  now: Date;
}) {
  if (highlights.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {highlights.map((group) => (
        <article key={group.key} className="flex flex-col rounded-3xl border border-border bg-card p-5">
          <span className="inline-flex w-max items-center gap-1 rounded-full bg-secondary-bg px-2.5 py-0.5 text-[11px] font-semibold text-body">
            <Sparkles aria-hidden="true" className="size-3 text-primary" />
            BharatHunt AI Brief
          </span>
          <h3 className="mt-3 text-base leading-snug font-bold text-ink">{group.title}</h3>
          <p className="mt-0.5 text-xs text-muted">{group.description}</p>

          <ol className="mt-3 flex flex-col gap-2.5">
            {group.stories.map((story, index) => (
              <li key={story.id} className="flex gap-2.5">
                <span aria-hidden="true" className="w-4 shrink-0 text-sm font-bold text-primary tabular-nums">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <Link
                    href={`/ai/${story.slug}`}
                    className="line-clamp-2 text-sm leading-snug font-semibold text-ink hover:text-primary"
                  >
                    {story.title}
                  </Link>
                  <SourceLine story={story} now={now} compact className="mt-0.5" />
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-auto pt-4">
            <SeeAll href={`${group.href}#latest-news`}>More like this</SeeAll>
          </div>
        </article>
      ))}
    </div>
  );
}

// ── Resources ────────────────────────────────────────────────────────────

const RESOURCES = [
  {
    href: "/funding",
    icon: IndianRupee,
    title: "Funding Intelligence",
    body: "Indian startup rounds, investors and funding trends.",
  },
  {
    href: "/investors",
    icon: Building2,
    title: "Investor directory",
    body: "Who is backing startups, and what they invest in.",
  },
  {
    href: "/launch-agent",
    icon: Boxes,
    title: "Launch Agent",
    body: "Plan where and how to launch your AI product.",
  },
  {
    href: "/marketplace",
    icon: Wrench,
    title: "Product marketplace",
    body: "Discover and upvote products launched by Indian makers.",
  },
];

export function AiResources({ sourceCount }: { sourceCount: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.1fr]">
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {RESOURCES.map(({ href, icon: Icon, title, body }) => (
          <li key={href}>
            <Link
              href={href}
              className="group flex h-full flex-col gap-2 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/30"
            >
              <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon aria-hidden="true" className="size-4" />
              </span>
              <span className="text-sm font-bold text-ink group-hover:text-primary">{title}</span>
              <span className="text-xs leading-relaxed text-muted">{body}</span>
            </Link>
          </li>
        ))}
      </ul>
      <TrendScoreExplainer sourceCount={sourceCount} />
    </div>
  );
}

/**
 * What the number on every card is, and where the stories come from.
 *
 * The weights are read from `TREND_WEIGHTS` rather than typed here, so this
 * cannot drift away from the formula it describes.
 */
export function TrendScoreExplainer({ sourceCount }: { sourceCount?: number }) {
  const percent = (weight: number) => `${Math.round(weight * 100)}%`;

  return (
    <section className="rounded-2xl border border-border bg-secondary-bg/60 p-5">
      <h3 className="flex items-center gap-2 text-sm font-bold text-ink">
        <Info aria-hidden="true" className="size-4 text-primary" />
        How this page works
      </h3>
      <ul className="mt-3 flex flex-col gap-2.5 text-xs leading-relaxed text-body">
        <li>
          <span className="font-semibold text-ink">Stories, not links.</span> Articles about the
          same event are grouped into one story, so five outlets covering one launch appear once
          — as &ldquo;5 sources&rdquo; — with every publisher listed on the story page.
        </li>
        <li>
          <span className="font-semibold text-ink">The BharatHunt Trend Score</span> is our own
          0–100 ranking: how recently a story was covered ({percent(TREND_WEIGHTS.recency)}), how
          many independent publications covered it ({percent(TREND_WEIGHTS.sources)}), how fast
          coverage is arriving ({percent(TREND_WEIGHTS.velocity)}), source reliability (
          {percent(TREND_WEIGHTS.authority)}) and how many readers opened it (
          {percent(TREND_WEIGHTS.engagement)}). A story we cannot date has no score rather than a
          made-up one.
        </li>
        <li>
          <span className="font-semibold text-ink">Summaries and &ldquo;why it matters&rdquo;</span>{" "}
          are assembled automatically from headlines and coverage data — not written by AI, and
          not editorial analysis. The original article is always the source of truth.
        </li>
        <li>
          <span className="font-semibold text-ink">Updated daily.</span> New coverage is collected
          once a day
          {sourceCount && sourceCount > 0 ? ` from ${sourceCount} publications and feeds` : ""}. This
          page is not real-time, and says when it last updated.
        </li>
      </ul>
    </section>
  );
}

// ── Final CTA ────────────────────────────────────────────────────────────

export function BuildingWithAiCta() {
  return (
    <section
      aria-labelledby="ai-cta-title"
      className="flex flex-col items-start gap-5 rounded-3xl border border-border bg-secondary-bg px-6 py-8 sm:px-10 sm:py-10 md:flex-row md:items-center md:justify-between"
    >
      <div className="max-w-xl">
        <h2 id="ai-cta-title" className="text-2xl font-bold text-ink sm:text-3xl">
          Building with AI?
        </h2>
        <p className="mt-2 text-base leading-relaxed text-body">
          Discover startups, launch your product and connect with the BharatHunt ecosystem.
        </p>
      </div>
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
        <Link href="/submit" className={buttonVariants({ size: "lg" })}>
          Launch on BharatHunt
        </Link>
        <Link href="/funding?industry=ai" className={buttonVariants({ variant: "outline", size: "lg" })}>
          Explore AI Startups
        </Link>
      </div>
    </section>
  );
}

// ── Empty and error states ───────────────────────────────────────────────

/**
 * The empty states, with an explicit `reason`: a filter that matched nothing is
 * the reader's to fix, and a pipeline that has not run is ours. None of them
 * shows placeholder news to look populated.
 */
export function AiEmptyState({
  reason,
  query,
}: {
  reason: "no-results" | "unavailable" | "not-set-up" | "filters-unavailable";
  query?: string;
}) {
  const copy: Record<typeof reason, { title: string; body: React.ReactNode }> = {
    "no-results": {
      title: query ? `No AI stories found for “${query}”.` : "No AI stories found.",
      body: (
        <>
          Try a broader search or a longer date range, or{" "}
          <Link href="/ai#latest-news" className="font-semibold text-primary hover:underline">
            clear the filters
          </Link>
          .
        </>
      ),
    },
    "filters-unavailable": {
      title: "This filter isn’t available yet.",
      body: (
        <>
          Date, company and source filters are still being enabled.{" "}
          <Link href="/ai#latest-news" className="font-semibold text-primary hover:underline">
            See all AI stories
          </Link>{" "}
          or use search in the meantime.
        </>
      ),
    },
    unavailable: {
      title: "News collection is behind schedule.",
      body: "The last daily update did not complete, so the stories below may be older than usual. Nothing here is ever filled in with placeholder news.",
    },
    "not-set-up": {
      title: "No AI stories yet.",
      body: "Ingestion has not run against the configured sources. An admin can start the first run from the AI news dashboard.",
    },
  };

  const { title, body } = copy[reason];

  return (
    <div
      role={reason === "unavailable" ? "status" : undefined}
      className="rounded-2xl border border-dashed border-border bg-card p-8 text-center sm:p-10"
    >
      <p className="text-sm font-semibold text-ink">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">{body}</p>
    </div>
  );
}
