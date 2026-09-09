/* Design system: design.md (Bharat Hunt — orange). The hero uses the existing
 * near-black `surface-dark` band, the same surface the landing page's
 * collections and community sections already sit on; everything below it is the
 * standard white canvas with 24px cards. No new brand colour, no gradient
 * beyond the one the button variants already own.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Flame, Sparkles } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Numeric } from "@/components/ui/typography";
import { JsonLd } from "@/components/seo/json-ld";
import { absoluteUrl, breadcrumbSchema } from "@/lib/seo";
import {
  AiSearchInput,
  CategoryRail,
  RegionToggle,
  SortControl,
} from "@/components/ai/feed-controls";
import { FeaturedStory, TrendingStoryRow } from "@/components/ai/story-card";
import { StoryFeed } from "@/components/ai/story-feed";
import { NewStoriesBanner } from "@/components/ai/new-stories-banner";
import { UpdatedAgo } from "@/components/ai/updated-ago";
import {
  AiEmptyState,
  AiFundingPanel,
  CompaniesMakingNoise,
  IndiaPanel,
  TrendingTopics,
  TrendScoreExplainer,
} from "@/components/ai/panels";
import {
  AI_SORTS,
  AI_TRENDING_LIMIT,
  categoryFromSlug,
  regionFromParam,
  type AiSort,
} from "@/lib/ai-news/constants";
import { freshness } from "@/lib/ai-news/format";
import {
  getAiCategoryCounts,
  getAiFreshness,
  getFeaturedAiStory,
  getRecentAiFundingRounds,
  getTrendingAiEntities,
  getTrendingAiStories,
  getTrendingAiTopics,
  searchAiStories,
} from "@/services/ai-news";

type AiSearchParams = Promise<{
  q?: string;
  category?: string;
  region?: string;
  sort?: string;
  page?: string;
}>;

/** `?page=` as a positive integer; anything else is page 1. */
function pageFrom(raw: string | undefined): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 1 ? parsed : 1;
}

/**
 * The canonical is page-aware for the same reason the marketplace's is: a static
 * `/ai` on every page tells Google that page 2 duplicates page 1, so page 2 is
 * dropped and the twelve stories only it links to are never crawled. That
 * lesson is already recorded in this repo — see the note in
 * app/marketplace/page.tsx — and this page would have repeated it.
 *
 * Filtered views still collapse to `/ai`: a category or region filter is a
 * re-slice of the same stories rather than new content. Search results are
 * `noindex, follow` — `?q=` generates unbounded URLs whose content is a
 * re-slice, and a canonical is a hint where `noindex` is a directive.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: AiSearchParams;
}): Promise<Metadata> {
  const params = await searchParams;
  const page = pageFrom(params.page);
  const filtered = Boolean(params.category || params.region || params.q);

  const title =
    page > 1
      ? `AI Trending — page ${page} | Bharat Hunt`
      : "AI Trending — Latest AI News & Trends | Bharat Hunt";

  const description =
    "The latest AI news, launches, models, companies and research — collected from official sources, research feeds and reporting, grouped into stories and ranked by the BharatHunt Trend Score.";

  return {
    // Absolute, so the root layout's "%s · Bharat Hunt" template does not append
    // a second site name to a title that already carries one.
    title: { absolute: title },
    description,
    alternates: { canonical: page > 1 && !filtered ? `/ai?page=${page}` : "/ai" },
    openGraph: {
      type: "website",
      url: absoluteUrl("/ai"),
      title,
      description,
    },
    twitter: { card: "summary_large_image", title, description },
    ...(params.q ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function AiTrendingPage({ searchParams }: { searchParams: AiSearchParams }) {
  const params = await searchParams;

  const q = params.q?.trim() || undefined;
  const category = categoryFromSlug(params.category);
  const region = regionFromParam(params.region);
  const page = pageFrom(params.page);
  // Ranking a search by trend score buries the thing somebody just typed, so a
  // query flips the default to relevance. An explicit `?sort=` still wins.
  const sort: AiSort = (AI_SORTS as readonly string[]).includes(params.sort ?? "")
    ? (params.sort as AiSort)
    : q
      ? "relevance"
      : "trending";

  const filters = { q, categories: category ? [category] : undefined, region, sort };

  /*
   * One await for the whole page. Every one of these is either a single RPC or
   * a Redis hit, and they are independent, so running them in sequence would
   * add nine round trips to the critical path for no reason. The two that can
   * be empty (`topics`, `companies`) render nothing rather than an empty box.
   */
  const [featured, trending, feed, categoryCounts, topics, companies, indiaStories, funding, fresh] =
    await Promise.all([
      getFeaturedAiStory(region),
      getTrendingAiStories(AI_TRENDING_LIMIT, region),
      searchAiStories({ ...filters, page }),
      getAiCategoryCounts(),
      getTrendingAiTopics(24),
      getTrendingAiEntities("company", 72, 6),
      getTrendingAiStories(4, "india"),
      getRecentAiFundingRounds(5),
      getAiFreshness(),
    ]);

  // One clock for the whole render, so every relative timestamp on the page
  // agrees with every other one.
  const now = new Date();
  const stamp = freshness(fresh.last_success_at, now);
  const totalStories = Object.values(categoryCounts).reduce((sum, count) => sum + count, 0);

  const nothingIngestedYet = fresh.published_total === 0;
  const isFiltered = Boolean(q || category || region);
  // The featured card and the trending rail are the *unfiltered* view of the
  // moment, so they are hidden once someone has narrowed the page — showing a
  // "Top AI story" that does not match the active filter reads as a bug.
  const showHeadlineSections = !isFiltered && page === 1;

  const crumbs = [
    { name: "Home", path: "/" },
    { name: "AI Trending", path: "/ai" },
  ];

  return (
    <main className="min-h-dvh bg-background">
      <JsonLd data={breadcrumbSchema(crumbs)} />

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="bg-surface-dark">
        <Container className="flex flex-col gap-6 py-12 md:py-16">
          <div className="flex flex-col gap-4">
            <span className="inline-flex w-max items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-bold tracking-[0.14em] text-primary uppercase">
              <Sparkles aria-hidden="true" className="size-3.5" />
              AI Trending
            </span>

            <h1 className="max-w-3xl text-3xl leading-[1.1] font-bold text-white sm:text-4xl lg:text-5xl">
              What&rsquo;s Trending in AI Right Now?
            </h1>

            <p className="max-w-2xl text-base leading-relaxed text-white/70 sm:text-lg">
              The latest AI news, launches, models, companies and research — collected
              from official sources, research feeds and reporting, grouped into stories
              and ranked by the BharatHunt Trend Score.
            </p>
          </div>

          <div className="max-w-2xl">
            <AiSearchInput />
          </div>

          <UpdatedAgo
            lastSuccessAt={fresh.last_success_at}
            initialLabel={stamp.label}
            initialStale={stamp.stale}
            storiesToday={fresh.stories_24h}
          />
        </Container>
      </section>

      {/*
       * Sticky just under the sticky navbar (h-16 = 64px, z-40), like the
       * marketplace toolbar. Opaque so cards scroll cleanly underneath, and the
       * category row scrolls horizontally rather than wrapping — sixteen chips
       * wrap to four lines on a phone and push the news below the fold.
       */}
      <div className="sticky top-16 z-30 border-b border-border bg-background/95 backdrop-blur-sm">
        <Container className="flex flex-col gap-3 py-3">
          <CategoryRail counts={categoryCounts} totalCount={totalStories} />
          <div className="flex min-w-0 items-center justify-between gap-2 overflow-x-auto">
            <RegionToggle />
            <SortControl />
          </div>
        </Container>
      </div>

      <Container className="flex flex-col gap-10 py-8 md:py-10">
        {/* Never claims to be current while the pipeline is behind. */}
        {stamp.stale && !nothingIngestedYet ? <AiEmptyState reason="unavailable" /> : null}

        {nothingIngestedYet ? (
          <AiEmptyState reason="not-set-up" />
        ) : (
          <>
            {/* Offers a refresh; never rearranges the page under a reader. */}
            <NewStoriesBanner since={now.toISOString()} />

            {/* ── Top AI story ─────────────────────────────────────── */}
            {showHeadlineSections && featured ? (
              <section aria-labelledby="top-story" className="flex flex-col gap-4">
                <h2 id="top-story" className="sr-only">
                  Top AI story
                </h2>
                <FeaturedStory story={featured} now={now} />
              </section>
            ) : null}

            {/* ── Trending now ─────────────────────────────────────── */}
            {showHeadlineSections && trending.length > 0 ? (
              <section aria-labelledby="trending-now" className="flex flex-col gap-3">
                <div className="flex items-baseline justify-between gap-4">
                  <h2
                    id="trending-now"
                    className="flex items-center gap-2 text-lg font-bold text-ink sm:text-xl"
                  >
                    <Flame aria-hidden="true" className="size-5 text-primary" />
                    Trending Now
                  </h2>
                  <span className="text-xs text-muted">
                    Ranked by the BharatHunt Trend Score
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-1 rounded-2xl border border-border bg-card p-2 sm:p-3 lg:grid-cols-2">
                  {/* The featured story is already the largest thing on the
                      page; repeating it as row one of the rail wastes the slot. */}
                  {trending
                    .filter((story) => story.id !== featured?.id)
                    .map((story, index) => (
                      <TrendingStoryRow
                        key={story.id}
                        story={story}
                        rank={index + 1}
                        now={now}
                      />
                    ))}
                </div>
              </section>
            ) : null}

            {/* ── Feed + rails ─────────────────────────────────────── */}
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px] lg:items-start">
              <section aria-labelledby="latest-news" className="flex min-w-0 flex-col gap-4">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <h2 id="latest-news" className="text-lg font-bold text-ink sm:text-xl">
                    {q
                      ? `Results for “${q}”`
                      : category
                        ? category
                        : region === "india"
                          ? "AI in India"
                          : "Latest AI News"}
                  </h2>
                  <p className="text-sm text-muted">
                    <Numeric>{feed.totalCount}</Numeric>{" "}
                    {feed.totalCount === 1 ? "story" : "stories"}
                  </p>
                </div>

                {feed.stories.length === 0 ? (
                  <AiEmptyState reason="no-results" query={q} />
                ) : (
                  <StoryFeed
                    // Remounts on a filter change, so the accumulated pages from
                    // the previous query are dropped rather than appended to.
                    key={`${q ?? ""}:${category ?? ""}:${region ?? ""}:${sort}:${page}`}
                    initialStories={feed.stories}
                    initialPage={feed.page}
                    initialHasMore={feed.hasMore}
                    filters={filters}
                    now={now}
                  />
                )}

                {/*
                 * A real, crawlable link to the next page. `StoryFeed` appends
                 * with JavaScript, which no crawler runs — without this, every
                 * story past the first twelve would sit in the sitemap with
                 * nothing linking to it, which is exactly what Search Console
                 * reported about /marketplace before it was fixed.
                 */}
                {feed.hasMore ? (
                  <Link
                    href={{
                      pathname: "/ai",
                      query: {
                        ...(q ? { q } : {}),
                        ...(params.category ? { category: params.category } : {}),
                        ...(region ? { region } : {}),
                        ...(params.sort ? { sort: params.sort } : {}),
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

              <aside className="flex flex-col gap-4 lg:sticky lg:top-40">
                <TrendingTopics topics={topics} />
                <CompaniesMakingNoise companies={companies} />
                {/* Redundant inside the India view, where the whole feed is this. */}
                {region === "india" ? null : <IndiaPanel stories={indiaStories} now={now} />}
                <AiFundingPanel rounds={funding} />
                <TrendScoreExplainer />
              </aside>
            </div>
          </>
        )}

        <p className="text-xs leading-relaxed text-muted-soft">
          Bharat Hunt links to original reporting and does not republish it. Headlines
          and links belong to their publishers; summaries and the trend ranking are
          ours.{" "}
          <Link href="/ai" className="inline-flex items-center gap-1 text-primary hover:underline">
            All AI stories
            <ArrowUpRight aria-hidden="true" className="size-3" />
          </Link>
        </p>
      </Container>
    </main>
  );
}
