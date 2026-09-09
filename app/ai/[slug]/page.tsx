import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { ArrowUpRight, Clock, Layers, TrendingUp } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Numeric } from "@/components/ui/typography";
import { buttonVariants } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { JsonLd } from "@/components/seo/json-ld";
import { absoluteUrl } from "@/lib/seo";
import { StoryCard, TrendScoreBadge } from "@/components/ai/story-card";
import { StoryImage } from "@/components/ai/story-image";
import { coverageLabel, relativeTime } from "@/lib/ai-news/format";
import { slugFromCategory } from "@/lib/ai-news/constants";
import { trendDirection } from "@/lib/ai-news/trend";
import { recordAiStoryView } from "@/lib/actions/ai-news";
import {
  getAiStoryBySlug,
  getAiStoryCoverage,
  getAiStoryEntities,
  getAiStoryTrendHistory,
  getRelatedAiStories,
} from "@/services/ai-news";

/**
 * One AI story (section 29).
 *
 * The rule this page exists to honour: **Bharat Hunt does not reproduce the
 * article.** What is here is what Bharat Hunt actually knows — our own composed
 * summary, the entities the pipeline extracted, our trend score and its
 * direction, and the list of publications that covered the event. Every one of
 * those publications is a link out, and the original is always the source of
 * truth.
 *
 * One URL per *story*, never per source article, which is the second half of
 * section 28: six publications covering one release is one page here, not six
 * near-identical pages competing with each other and with the publishers.
 */

type StoryParams = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: StoryParams }): Promise<Metadata> {
  const { slug } = await params;
  const story = await getAiStoryBySlug(slug);

  if (!story) {
    // A rejected, hidden or never-published story must not advertise itself.
    return { title: "Story not found", robots: { index: false, follow: false } };
  }

  const description =
    story.summary ??
    `${story.title} — AI coverage tracked by Bharat Hunt across ${story.source_count} source${
      story.source_count === 1 ? "" : "s"
    }.`;

  return {
    title: story.title,
    description,
    alternates: { canonical: `/ai/${story.slug}` },
    openGraph: {
      type: "article",
      url: absoluteUrl(`/ai/${story.slug}`),
      title: story.title,
      description,
      // Only the publisher's own image, and only when there is one. Never a
      // generated placeholder pretending to illustrate the story.
      ...(story.image_url ? { images: [{ url: story.image_url }] } : {}),
    },
    twitter: {
      card: story.image_url ? "summary_large_image" : "summary",
      title: story.title,
      description,
    },
  };
}

export default async function AiStoryPage({ params }: { params: StoryParams }) {
  const { slug } = await params;
  const story = await getAiStoryBySlug(slug);
  if (!story) notFound();

  const [coverage, entities, history] = await Promise.all([
    getAiStoryCoverage(story.id),
    getAiStoryEntities(story.id),
    getAiStoryTrendHistory(story.id, 24),
  ]);

  const related = await getRelatedAiStories(
    story.id,
    entities.map((entity) => entity.slug),
    4,
  );

  /*
   * Counted after the response is flushed, so a reader never waits on it, and
   * a failure never affects the page. This is the only first-party engagement
   * signal the trend score has — see the note on `recordAiStoryView`, which is
   * rate-limited per IP precisely because it feeds a public ranking.
   */
  after(() => recordAiStoryView(slug));

  const now = new Date();
  // The *oldest* snapshot in the window, not the previous one: "up 9 points
  // today" is the useful claim, and comparing against an hour ago would report
  // noise as a trend.
  const oldest = history.at(-1)?.trend_score ?? null;
  const direction = trendDirection(story.trend_score, oldest);
  const when = relativeTime(story.last_seen_at, now);
  const firstSeen = relativeTime(story.first_seen_at, now);
  const categorySlug = slugFromCategory(story.category);

  const crumbs = [
    { name: "Home", path: "/" },
    { name: "AI Trending", path: "/ai" },
    ...(categorySlug ? [{ name: story.category, path: `/ai?category=${categorySlug}` }] : []),
    { name: story.title, path: `/ai/${story.slug}` },
  ];

  return (
    <main className="min-h-dvh bg-background py-8 md:py-10">
      {/*
       * An `ItemList` of the coverage, not a `NewsArticle`.
       *
       * `NewsArticle` would claim Bharat Hunt published this news. It did not —
       * it grouped other people's reporting and wrote a summary of the
       * grouping. `ItemList` describes exactly that, and each entry points at
       * the publisher's own URL rather than back here.
       */}
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: `Coverage of: ${story.title}`,
          url: absoluteUrl(`/ai/${story.slug}`),
          numberOfItems: coverage.length,
          itemListElement: coverage.map((article, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: article.title,
            url: article.source_url,
          })),
        }}
      />

      <Container className="flex max-w-4xl flex-col gap-8">
        <Breadcrumbs items={crumbs} />

        <article className="flex flex-col gap-6">
          <header className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              {categorySlug ? (
                <Link
                  href={`/ai?category=${categorySlug}`}
                  className="inline-flex items-center rounded-full bg-primary/8 px-3 py-1 text-xs font-semibold text-primary transition-opacity hover:opacity-80"
                >
                  {story.category}
                </Link>
              ) : (
                <span className="inline-flex items-center rounded-full bg-primary/8 px-3 py-1 text-xs font-semibold text-primary">
                  {story.category}
                </span>
              )}

              {story.sub_category ? (
                <span className="inline-flex items-center rounded-full bg-secondary-bg px-3 py-1 text-xs font-medium text-body">
                  {story.sub_category}
                </span>
              ) : null}

              {story.region === "india" ? (
                <Link
                  href="/ai?region=india"
                  className="inline-flex items-center rounded-full bg-secondary-bg px-3 py-1 text-xs font-medium text-body"
                >
                  🇮🇳 India
                </Link>
              ) : null}
            </div>

            <h1 className="text-2xl leading-tight font-bold text-ink sm:text-4xl">{story.title}</h1>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
              {when ? (
                <span className="inline-flex items-center gap-1.5">
                  <Clock aria-hidden="true" className="size-4" />
                  <time dateTime={story.last_seen_at ?? undefined}>{when}</time>
                </span>
              ) : null}

              {story.source_count > 0 ? (
                <span className="inline-flex items-center gap-1.5">
                  <Layers aria-hidden="true" className="size-4" />
                  {coverageLabel(story.source_count, story.top_source_name)}
                </span>
              ) : null}

              {story.trend_score !== null ? (
                <span className="inline-flex items-center gap-2">
                  <TrendScoreBadge score={story.trend_score} size="lg" />
                  {/*
                   * "Up 9 today" only when a snapshot from earlier exists to
                   * compare with. A story we have observed once is popular; a
                   * story we have watched climb is trending, and this page is
                   * not allowed to claim the second when it knows the first.
                   */}
                  {direction && direction.direction !== "flat" ? (
                    <span
                      className={
                        direction.direction === "up"
                          ? "inline-flex items-center gap-1 text-xs font-semibold text-primary"
                          : "inline-flex items-center gap-1 text-xs font-semibold text-muted"
                      }
                    >
                      <TrendingUp
                        aria-hidden="true"
                        className={direction.direction === "up" ? "size-3.5" : "size-3.5 rotate-180"}
                      />
                      <Numeric>
                        {direction.delta > 0 ? "+" : ""}
                        {Math.round(direction.delta)}
                      </Numeric>{" "}
                      today
                    </span>
                  ) : null}
                </span>
              ) : null}
            </div>
          </header>

          {story.image_url ? (
            <div className="relative aspect-[16/8] overflow-hidden rounded-2xl border border-border bg-secondary-bg">
              <StoryImage src={story.image_url} alt="" eager />
            </div>
          ) : null}

          {story.summary ? (
            <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
              <p className="text-base leading-relaxed text-body sm:text-lg">{story.summary}</p>
              <p className="mt-3 text-xs text-muted-soft">
                Written by Bharat Hunt from the headline and the coverage below. The
                original reporting is the source of truth.
              </p>
            </div>
          ) : null}

          {story.top_source_url ? (
            <div>
              <a
                href={story.top_source_url}
                target="_blank"
                // `nofollow` because this is aggregated outbound linking at
                // volume, not an editorial endorsement of each destination.
                rel="noopener noreferrer nofollow"
                className={buttonVariants({ className: "gap-2" })}
              >
                Read original coverage
                <ArrowUpRight aria-hidden="true" className="size-4" />
              </a>
            </div>
          ) : null}
        </article>

        {/* ── Entities ───────────────────────────────────────────────── */}
        {entities.length > 0 ? (
          <section aria-labelledby="entities" className="flex flex-col gap-3">
            <h2 id="entities" className="text-sm font-bold text-ink">
              Companies, models and people in this story
            </h2>
            <ul className="flex flex-wrap gap-2">
              {entities.map((entity) => (
                <li key={`${entity.entity_type}:${entity.slug}`}>
                  <Link
                    href={`/ai?q=${encodeURIComponent(entity.name)}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm text-body transition-colors hover:border-primary/40 hover:text-ink"
                  >
                    <span className="font-medium">{entity.name}</span>
                    <span className="text-xs text-muted-soft">{entity.entity_type}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* ── Coverage ───────────────────────────────────────────────── */}
        <section aria-labelledby="coverage" className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="coverage" className="text-lg font-bold text-ink">
              {coverageLabel(story.source_count, story.top_source_name) ?? "Coverage"}
            </h2>
            {firstSeen ? (
              <span className="text-xs text-muted">First seen {firstSeen.toLowerCase()}</span>
            ) : null}
          </div>

          {coverage.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted">
              The articles behind this story are no longer available.
            </p>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
              {coverage.map((article) => {
                const published = relativeTime(article.published_at, now);
                return (
                  <li key={article.id}>
                    <a
                      href={article.source_url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="flex items-start justify-between gap-4 p-4 transition-colors hover:bg-secondary-bg/60 sm:p-5"
                    >
                      <span className="flex min-w-0 flex-col gap-1">
                        <span className="text-sm font-semibold text-ink">{article.source_name}</span>
                        <span className="line-clamp-2 text-sm text-body">{article.title}</span>
                        <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                          {published ? (
                            <time dateTime={article.published_at ?? undefined}>{published}</time>
                          ) : null}
                          {article.author ? (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>{article.author}</span>
                            </>
                          ) : null}
                          {/*
                           * Only shown where the source's own API publishes one
                           * (Hacker News, today). Absent everywhere else,
                           * because an unknown count and a count of zero are
                           * different facts.
                           */}
                          {article.external_engagement !== null ? (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>
                                <Numeric>{article.external_engagement}</Numeric> points &amp;
                                comments
                              </span>
                            </>
                          ) : null}
                        </span>
                      </span>
                      <ArrowUpRight
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0 text-muted-soft"
                      />
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ── Related ────────────────────────────────────────────────── */}
        {related.length > 0 ? (
          <section aria-labelledby="related" className="flex flex-col gap-4">
            <h2 id="related" className="text-lg font-bold text-ink">
              Related AI coverage
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {related.map((item) => (
                <StoryCard key={item.id} story={item} now={now} />
              ))}
            </div>
          </section>
        ) : null}

        <Link href="/ai" className="text-sm font-semibold text-primary hover:underline">
          ← All AI stories
        </Link>
      </Container>
    </main>
  );
}
