/* Design system: design.md (Bharat Hunt — orange). The hero uses the existing
 * near-black `surface-dark` band; everything below it is the standard canvas
 * with white cards. Orange is the only accent; no new colours, no gradients
 * beyond the ones the button variants already own, no animation library.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Flame, Radar, Sparkles, Wrench, Building2, Library } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Numeric } from "@/components/ui/typography";
import { buttonVariants } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { JsonLd } from "@/components/seo/json-ld";
import { absoluteUrl } from "@/lib/seo";
import { SITE_NAME, SITE_URL, TOPIC_ICONS } from "@/lib/constants";
import {
  AiSearchInput,
  CategoryRail,
  FeedFilters,
  SortControl,
} from "@/components/ai/feed-controls";
import { FeaturedStory, SideStory } from "@/components/ai/story-card";
import { StoryFeed } from "@/components/ai/story-feed";
import { NewStoriesBanner } from "@/components/ai/new-stories-banner";
import { UpdatedAgo } from "@/components/ai/updated-ago";
import {
  AiEmptyState,
  AiHighlights,
  AiPulse,
  AiResources,
  BuildingWithAiCta,
  CompaniesMakingMoves,
  DailyBrief,
  HubSection,
  IndiaPanel,
  ModelWatch,
  ToolsTrending,
  WhatsHot,
} from "@/components/ai/panels";
import {
  AI_DATE_RANGE_LABELS,
  AI_SORTS,
  categoryFromSlug,
  companyFromParam,
  dateRangeFromParam,
  defaultAiSort,
  regionFromParam,
  resolveCategoryFilter,
  sourceFromParam,
  storyTypeFromSlug,
  type AiSort,
} from "@/lib/ai-news/constants";
import { freshness } from "@/lib/ai-news/format";
import { buildBrief, buildHighlights, whyItMatters } from "@/lib/ai-news/signals";
import {
  getAiActiveSources,
  getAiCategoryCounts,
  getAiFreshness,
  getAiPulse,
  getAiWeekPool,
  getFeaturedAiStory,
  getRecentAiFundingRounds,
  getTrendingAiEntities,
  getTrendingAiTopics,
  searchAiStories,
  type AiTrendingEntity,
} from "@/services/ai-news";

type AiSearchParams = Promise<{
  q?: string;
  category?: string;
  type?: string;
  date?: string;
  company?: string;
  source?: string;
  region?: string;
  sort?: string;
  page?: string;
}>;

const TITLE = "AI Trending — Latest AI News, Tools & Trends | BharatHunt";
const DESCRIPTION =
  "Stay updated with the latest AI news, tools, model launches, startups, funding and emerging AI trends.";

/** `?page=` as a positive integer; anything else is page 1. */
function pageFrom(raw: string | undefined): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 1 ? parsed : 1;
}

/**
 * The canonical is page-aware for the same reason the marketplace's is: a
 * static `/ai` on every page tells Google that page 2 duplicates page 1, so the
 * stories only page 2 links to are never crawled (see app/marketplace/page.tsx).
 *
 * Filtered views collapse to `/ai` — a filter is a re-slice of the same
 * stories, not new content, and thin filter pages are exactly what the brief
 * says not to create. Search results are `noindex, follow`.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: AiSearchParams;
}): Promise<Metadata> {
  const params = await searchParams;
  const page = pageFrom(params.page);
  const filtered = Boolean(
    params.category || params.type || params.date || params.company || params.source ||
      params.region || params.q,
  );

  const title = page > 1 ? `AI Trending — page ${page} | BharatHunt` : TITLE;

  return {
    // Absolute, so the root layout's "%s · Bharat Hunt" template does not append
    // a second site name to a title that already carries one.
    title: { absolute: title },
    description: DESCRIPTION,
    alternates: { canonical: page > 1 && !filtered ? `/ai?page=${page}` : "/ai" },
    openGraph: {
      type: "website",
      url: absoluteUrl("/ai"),
      title,
      description: DESCRIPTION,
    },
    twitter: { card: "summary_large_image", title, description: DESCRIPTION },
    ...(params.q ? { robots: { index: false, follow: true } } : {}),
  };
}

const AiIcon = TOPIC_ICONS.ai;

const none = <T,>(value: T) => Promise.resolve(value);

export default async function AiTrendingPage({ searchParams }: { searchParams: AiSearchParams }) {
  const params = await searchParams;

  const q = params.q?.trim().slice(0, 120) || undefined;
  const topic = categoryFromSlug(params.category);
  const storyType = storyTypeFromSlug(params.type);
  const categories = resolveCategoryFilter(topic, storyType);
  const since = dateRangeFromParam(params.date);
  const company = companyFromParam(params.company);
  const source = sourceFromParam(params.source);
  const region = regionFromParam(params.region);
  const page = pageFrom(params.page);
  const sort: AiSort = (AI_SORTS as readonly string[]).includes(params.sort ?? "")
    ? (params.sort as AiSort)
    : defaultAiSort(Boolean(q));

  const filters = { q, categories, region, sort, since, company, source };
  const isFiltered = Boolean(q || categories || region || since || company || source);
  // The hub is the unfiltered front page. Once somebody narrows the feed, the
  // page becomes a results view, and the hub-only queries are not made at all.
  const showHub = !isFiltered && page === 1;

  /*
   * One await for the whole page. Each call is a single RPC or a Redis hit and
   * they are independent. The hub's brief, side stories, highlights and India
   * rail are all cut from one query (`getAiWeekPool`) rather than one each.
   */
  const [
    feed,
    categoryCounts,
    fresh,
    companyOptions,
    sourceOptions,
    featured,
    pool,
    topics,
    companies,
    tools,
    models,
    funding,
    pulse,
  ] = await Promise.all([
    searchAiStories({ ...filters, page }),
    getAiCategoryCounts(),
    getAiFreshness(),
    getTrendingAiEntities("company", 720, 30),
    getAiActiveSources(),
    showHub ? getFeaturedAiStory() : none(null),
    showHub ? getAiWeekPool() : none([]),
    showHub ? getTrendingAiTopics(168) : none([]),
    showHub ? getTrendingAiEntities("company", 168, 6) : none<AiTrendingEntity[]>([]),
    showHub ? getTrendingAiEntities("tool", 168, 8) : none<AiTrendingEntity[]>([]),
    showHub ? getTrendingAiEntities("model", 168, 6) : none<AiTrendingEntity[]>([]),
    showHub ? getRecentAiFundingRounds(6) : none([]),
    showHub ? getAiPulse() : none(null),
  ]);

  // One clock for the whole render, so every relative timestamp agrees.
  const now = new Date();
  const stamp = freshness(fresh.last_success_at, now);
  const totalStories = Object.values(categoryCounts).reduce((sum, count) => sum + count, 0);
  const nothingIngestedYet = fresh.published_total === 0;

  // ── Hub selections, all from the one pool ─────────────────────────────
  const lead = featured ?? pool[0] ?? null;
  const rest = pool.filter((story) => story.id !== lead?.id);
  const brief = buildBrief(rest, now, { max: 4, min: 2 });
  const briefIds = new Set(brief.stories.map((story) => story.id));
  const moreTrending = rest.filter((story) => !briefIds.has(story.id)).slice(0, 4);
  const shownIds = [lead?.id, ...briefIds, ...moreTrending.map((story) => story.id)].filter(
    (id): id is string => Boolean(id),
  );
  const highlights = buildHighlights(pool, { exclude: shownIds, perGroup: 4 });
  const indiaStories = pool.filter((story) => story.region === "india").slice(0, 4);
  const rankById = new Map(pool.map((story, index) => [story.id, index + 1]));
  const rankOf = (id: string) => rankById.get(id);
  const leadRank = lead ? rankOf(lead.id) : undefined;

  const companyFilterOptions = companyOptions.map((entity) => ({
    value: entity.slug,
    label: entity.name,
  }));
  // A company chosen from a link may have dropped out of the 30-day list; keep
  // it selectable so the control still shows what is applied.
  if (company && !companyFilterOptions.some((option) => option.value === company)) {
    companyFilterOptions.unshift({ value: company, label: company });
  }
  const sourceFilterOptions = sourceOptions.map((row) => ({
    value: row.source_name,
    label: `${row.source_name} (${row.story_count})`,
  }));
  if (source && !sourceFilterOptions.some((option) => option.value === source)) {
    sourceFilterOptions.unshift({ value: source, label: source });
  }

  const feedTitle = q
    ? `Results for “${q}”`
    : topic
      ? topic
      : storyType
        ? storyType.label
        : company
          ? (companyOptions.find((entity) => entity.slug === company)?.name ?? "Company news")
          : source
            ? `From ${source}`
            : region === "india"
              ? "AI in India"
              : "Latest AI News";
  const feedContext = [since ? AI_DATE_RANGE_LABELS[since] : null, sort === "trending" ? "by Trend Score" : sort === "latest" ? "newest first" : "best match"]
    .filter(Boolean)
    .join(" · ");

  const crumbs = [
    { name: "Home", path: "/" },
    { name: "AI Trending", path: "/ai" },
  ];

  return (
    <main className="min-h-dvh bg-background">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "AI Trending — Latest AI News, Tools & Trends",
          description: DESCRIPTION,
          url: absoluteUrl("/ai"),
          isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
          publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
          ...(fresh.last_success_at ? { dateModified: fresh.last_success_at } : {}),
          // Only the stories this render actually shows, each at its own
          // story page — a list describing rows a visitor cannot see is the
          // mismatch search engines treat as cloaking.
          mainEntity: {
            "@type": "ItemList",
            numberOfItems: feed.stories.length,
            itemListElement: feed.stories.map((story, index) => ({
              "@type": "ListItem",
              position: index + 1,
              name: story.title,
              url: absoluteUrl(`/ai/${story.slug}`),
            })),
          },
        }}
      />

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="bg-surface-dark">
        <Container className="flex flex-col gap-5 py-8 md:py-12">
          <Breadcrumbs items={crumbs} tone="dark" />

          <div className="flex flex-col gap-3">
            <span className="inline-flex w-max items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-bold tracking-[0.14em] text-primary uppercase">
              <AiIcon aria-hidden="true" className="size-3.5" />
              AI Intelligence Hub
            </span>
            <h1 className="max-w-3xl text-3xl leading-[1.08] font-bold text-white sm:text-4xl lg:text-5xl">
              What&rsquo;s Trending in AI?
            </h1>
            <p className="max-w-2xl text-base leading-relaxed text-white/70 sm:text-lg">
              Discover the latest AI news, tools, models, launches and trends shaping the future.
            </p>
          </div>

          <div className="flex max-w-3xl flex-col gap-3">
            <AiSearchInput />
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              <div className="flex flex-wrap gap-2">
                <Link
                  href={showHub ? "#trending-now" : "/ai#trending-now"}
                  className={buttonVariants({ className: "gap-1.5" })}
                >
                  Explore AI Trends
                  <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
                <Link
                  href={showHub && tools.length > 0 ? "#ai-tools" : "/ai?type=launches#latest-news"}
                  className={buttonVariants({ variant: "on-dark" })}
                >
                  Explore AI Tools
                </Link>
              </div>
              <UpdatedAgo
                lastSuccessAt={fresh.last_success_at}
                initialLabel={stamp.label}
                initialStale={stamp.stale}
                storiesToday={fresh.stories_24h}
              />
            </div>
          </div>
        </Container>
      </section>

      {showHub && !nothingIngestedYet ? (
        <Container className="pt-6 md:pt-8">
          <AiPulse
            pulse={pulse}
            storiesToday={fresh.stories_24h}
            totalStories={fresh.published_total}
          />
        </Container>
      ) : null}

      {/*
       * Sticky just under the sticky navbar (h-16 = 64px, z-40). Opaque so cards
       * scroll cleanly underneath. Topics scroll horizontally rather than
       * wrapping; the other filters collapse into a drawer below `lg`.
       */}
      <div className="sticky top-16 z-30 mt-6 border-y border-border bg-background/95 backdrop-blur-sm">
        <Container className="flex flex-col gap-2.5 py-2.5">
          <CategoryRail counts={categoryCounts} totalCount={totalStories} />
          <div className="flex min-w-0 items-center justify-between gap-2">
            <FeedFilters companies={companyFilterOptions} sources={sourceFilterOptions} />
            <div className="hidden sm:block">
              <SortControl />
            </div>
          </div>
        </Container>
      </div>

      <Container className="flex flex-col gap-12 py-8 md:gap-16 md:py-10">
        {/* Never claims to be current while the pipeline is behind. */}
        {stamp.stale && !nothingIngestedYet ? <AiEmptyState reason="unavailable" /> : null}

        {nothingIngestedYet ? (
          <AiEmptyState reason="not-set-up" />
        ) : (
          <>
            {/* Offers a refresh; never rearranges the page under a reader. */}
            <NewStoriesBanner since={now.toISOString()} />

            {/* ── Trending Now ──────────────────────────────────────── */}
            {showHub && lead ? (
              <HubSection
                id="trending-now"
                icon={<Flame aria-hidden="true" className="size-6 text-primary" />}
                title="Trending Now"
                subtitle="The AI stories getting the most attention right now."
                action={
                  <Link
                    href="/ai?sort=trending#latest-news"
                    className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                  >
                    All trending
                    <ArrowRight aria-hidden="true" className="size-3.5" />
                  </Link>
                }
                // The first section is above the fold; content-visibility would
                // only delay it.
                className="[content-visibility:visible]"
              >
                {/*
                 * Desktop: the lead story with the next few under it on the
                 * left, the brief on the right, so neither column is left
                 * with a tall blank. Mobile: lead, then the rest, then the
                 * brief — the featured story always comes first.
                 */}
                <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
                  <div className="flex flex-col gap-3 lg:col-span-7">
                    <FeaturedStory story={lead} now={now} why={whyItMatters(lead, leadRank)} />
                    {moreTrending.length > 0 ? (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {moreTrending.map((story) => (
                          <SideStory key={story.id} story={story} now={now} />
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="lg:col-span-5">
                    <DailyBrief brief={brief} now={now} rankOf={rankOf} />
                  </div>
                </div>
              </HubSection>
            ) : null}

            {/* ── AI Signals ────────────────────────────────────────── */}
            {showHub && (topics.length > 0 || models.length > 0 || indiaStories.length > 0) ? (
              <HubSection
                id="ai-signals"
                icon={<Radar aria-hidden="true" className="size-6 text-primary" />}
                title="AI Signals"
                subtitle="What is gaining coverage this week, from story counts — not guesses."
              >
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <WhatsHot topics={topics} />
                  <ModelWatch models={models} now={now} />
                  <IndiaPanel stories={indiaStories} now={now} />
                </div>
              </HubSection>
            ) : null}

            {/* ── The feed ──────────────────────────────────────────── */}
            <section
              id="latest-news"
              aria-labelledby="latest-news-title"
              className="flex scroll-mt-44 flex-col gap-4"
            >
              <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
                <div className="flex min-w-0 flex-col gap-1">
                  <h2 id="latest-news-title" className="text-xl font-bold text-ink sm:text-2xl">
                    {feedTitle}
                  </h2>
                  <p className="text-sm text-muted">
                    <Numeric>{feed.totalCount.toLocaleString("en-IN")}</Numeric>{" "}
                    {feed.totalCount === 1 ? "story" : "stories"}
                    {feedContext ? ` · ${feedContext}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <UpdatedAgo
                    tone="light"
                    className="flex-nowrap text-xs whitespace-nowrap"
                    lastSuccessAt={fresh.last_success_at}
                    labelPrefix="Last updated"
                    initialLabel={stamp.label}
                    initialStale={stamp.stale}
                    storiesToday={0}
                  />
                  <div className="sm:hidden">
                    <SortControl />
                  </div>
                </div>
              </div>

              {feed.filtersUnavailable ? (
                <AiEmptyState reason="filters-unavailable" />
              ) : feed.stories.length === 0 ? (
                <AiEmptyState reason="no-results" query={q} />
              ) : (
                <StoryFeed
                  // Remounts on a filter change, so the accumulated pages from
                  // the previous query are dropped rather than appended to.
                  key={JSON.stringify({ ...filters, page })}
                  initialStories={feed.stories}
                  initialPage={feed.page}
                  initialHasMore={feed.hasMore}
                  filters={filters}
                  now={now}
                />
              )}

              {/*
               * A real, crawlable link to the next page. `StoryFeed` appends with
               * JavaScript, which no crawler runs — without this every story past
               * the first page would have nothing linking to it.
               */}
              {feed.hasMore ? (
                <Link
                  href={{
                    pathname: "/ai",
                    query: {
                      ...Object.fromEntries(
                        Object.entries(params).filter(([key, value]) => key !== "page" && value),
                      ),
                      page: page + 1,
                    },
                  }}
                  rel="next"
                  className="sr-only"
                >
                  Next page of AI stories
                </Link>
              ) : null}
            </section>

            {/* ── AI Tools ──────────────────────────────────────────── */}
            {showHub && tools.length > 0 ? (
              <HubSection
                id="ai-tools"
                icon={<Wrench aria-hidden="true" className="size-6 text-primary" />}
                title="AI Tools Trending Now"
                subtitle="Tools named most often in this week’s coverage."
                action={
                  <Link
                    href="/ai?type=launches#latest-news"
                    className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                  >
                    Tools &amp; launches news
                    <ArrowRight aria-hidden="true" className="size-3.5" />
                  </Link>
                }
              >
                <ToolsTrending tools={tools} now={now} />
              </HubSection>
            ) : null}

            {/* ── Companies & Funding ───────────────────────────────── */}
            {showHub && (companies.length > 0 || funding.length > 0) ? (
              <HubSection
                id="ai-companies"
                icon={<Building2 aria-hidden="true" className="size-6 text-primary" />}
                title="AI Companies Making Moves"
                subtitle="Coverage this week, alongside the latest AI rounds from Funding Intelligence."
              >
                <CompaniesMakingMoves companies={companies} rounds={funding} />
              </HubSection>
            ) : null}

            {/* ── Highlights ────────────────────────────────────────── */}
            {showHub && highlights.length > 0 ? (
              <HubSection
                id="ai-highlights"
                icon={<Sparkles aria-hidden="true" className="size-6 text-primary" />}
                title="BharatHunt AI Highlights"
                subtitle="This week in AI, grouped so you can catch up in a minute. Assembled automatically from coverage."
              >
                <AiHighlights highlights={highlights} now={now} />
              </HubSection>
            ) : null}
          </>
        )}

        {/* ── Resources ─────────────────────────────────────────────── */}
        <HubSection
          id="ai-resources"
          icon={<Library aria-hidden="true" className="size-6 text-primary" />}
          title="AI Resources"
          subtitle="More from BharatHunt, and how this page is put together."
        >
          <AiResources sourceCount={sourceOptions.length} />
        </HubSection>

        <BuildingWithAiCta />

        <p className="text-xs leading-relaxed text-muted-soft">
          BharatHunt links to original reporting and does not republish it. Headlines and links
          belong to their publishers; summaries, groupings and the trend ranking are ours.
        </p>
      </Container>
    </main>
  );
}
