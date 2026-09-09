"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Merge,
  Play,
  RefreshCw,
  Star,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Numeric } from "@/components/ui/typography";
import { AI_CATEGORIES, AI_REGIONS } from "@/lib/ai-news/constants";
import { relativeTime } from "@/lib/ai-news/format";
import {
  addManualAiArticle,
  mergeAiStories,
  publishAiStory,
  rejectAiStory,
  runAiNewsIngestion,
  setAiSourceAutoPublish,
  setAiSourceEnabled,
  setAiStoryFeatured,
  setAiStoryHidden,
  updateAiStoryMeta,
} from "@/lib/actions/ai-news";
import type { IngestionSummary } from "@/lib/ai-news/ingest";
import type {
  AdminAiArticle,
  AdminAiRun,
  AdminAiSource,
  AdminAiStats,
  AdminAiStory,
} from "@/services/ai-news-admin";

/**
 * The AI news control room (section 23).
 *
 * One client component rather than a dozen, because every control here shares
 * the same three needs: a pending state, a place to show the error a Server
 * Action returned, and a `router.refresh()` afterwards so the server-rendered
 * tables re-read the database. Splitting it would mean repeating that plumbing
 * per control.
 *
 * **Nothing here is a permission boundary.** Every action it calls re-checks
 * `getIsAdmin()` on the server, because a Server Action is a public endpoint
 * whatever renders the button. This component only decides what is worth
 * showing to somebody who has already been let through the page's own gate.
 */

type Props = {
  stats: AdminAiStats;
  sources: AdminAiSource[];
  pending: AdminAiStory[];
  stories: AdminAiStory[];
  articles: AdminAiArticle[];
  runs: AdminAiRun[];
};

const STATUS_BADGE: Record<string, string> = {
  published: "bg-success/10 text-success",
  pending: "bg-primary/10 text-primary",
  rejected: "bg-secondary-bg text-muted",
  ok: "bg-success/10 text-success",
  partial: "bg-amber-100 text-amber-700",
  failed: "bg-error/10 text-error",
  running: "bg-primary/10 text-primary",
  processed: "bg-success/10 text-success",
  duplicate: "bg-secondary-bg text-muted",
  error: "bg-error/10 text-error",
};

function Badge({ value }: { value: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        STATUS_BADGE[value] ?? "bg-secondary-bg text-muted",
      )}
    >
      {value}
    </span>
  );
}

function Panel({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function AiNewsManager({ stats, sources, pending, stories, articles, runs }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<IngestionSummary | null>(null);
  const now = new Date();

  /**
   * Every action goes through here: run it, surface whatever it refused with,
   * and re-read the server data on success. One place, so no control can
   * forget the refresh and leave a table showing the state before the click.
   */
  const run = (task: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await task();
        if (!result.ok) setError(result.error);
        else router.refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Something went wrong.");
      }
    });
  };

  const statCards = [
    { label: "Published", value: stats.published },
    { label: "In review", value: stats.pending },
    { label: "Hidden", value: stats.hidden },
    { label: "Articles", value: stats.articles },
    { label: "Sources on", value: stats.sourcesEnabled },
    { label: "Unhealthy", value: stats.sourcesUnhealthy },
  ];

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <p className="flex items-start gap-2 rounded-lg border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      ) : null}

      {/* ── Stats ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {statCards.map((card) => (
          <div key={card.label} className="rounded-xl border border-border bg-card p-4">
            <div className="text-2xl font-bold text-ink">
              <Numeric>{card.value.toLocaleString()}</Numeric>
            </div>
            <div className="text-xs text-muted">{card.label}</div>
          </div>
        ))}
      </div>

      {/* ── Run ingestion ──────────────────────────────────────────────── */}
      <Panel
        title="Ingestion"
        description="Fetches every due source, classifies what is new, groups it into stories and rescores. Safe to run repeatedly — a URL already seen is skipped."
        action={
          <Button type="button" onClick={() => runIngestionNow()} disabled={isPending}>
            {isPending ? (
              <RefreshCw aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <Play aria-hidden="true" className="size-4" />
            )}
            Run AI News Ingestion
          </Button>
        }
      >
        {lastRun ? (
          <div className="flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge value={lastRun.status} />
              <span className="text-xs text-muted">
                {(lastRun.durationMs / 1000).toFixed(1)}s ·{" "}
                {lastRun.sourcesSucceeded}/{lastRun.sourcesAttempted} sources
              </span>
            </div>

            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 lg:grid-cols-7">
              {[
                ["Fetched", lastRun.articlesFetched],
                ["AI relevant", lastRun.articlesRelevant],
                ["Duplicates", lastRun.articlesDuplicate],
                ["Rejected", lastRun.articlesRejected],
                ["New stories", lastRun.storiesCreated],
                ["Updated", lastRun.storiesUpdated],
                ["Rescored", lastRun.scoresRecomputed],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <dt className="text-xs text-muted">{label}</dt>
                  <dd className="text-lg font-semibold text-ink">
                    <Numeric>{value}</Numeric>
                  </dd>
                </div>
              ))}
            </dl>

            {lastRun.errors.length > 0 ? (
              <ul className="flex flex-col gap-1 rounded-lg bg-secondary-bg p-3 text-xs text-body">
                {lastRun.errors.map((entry, index) => (
                  <li key={index}>
                    <span className="font-semibold">{entry.source}:</span> {entry.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <p className="p-4 text-sm text-muted">
            Run it to see what a pass over the configured sources produces. The result
            is also written to the run log at the bottom of this page.
          </p>
        )}
      </Panel>

      {/* ── Review queue ───────────────────────────────────────────────── */}
      <Panel
        title={`Review queue (${pending.length})`}
        description="Stories the classifier kept but was not confident enough to publish, and everything from a source that is not allowed to publish on its own."
      >
        {pending.length === 0 ? (
          <p className="p-4 text-sm text-muted">Nothing is waiting. </p>
        ) : (
          <ul className="divide-y divide-border">
            {pending.map((story) => (
              <li key={story.id} className="flex flex-col gap-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">{story.title}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                      <span>{story.category}</span>
                      <span aria-hidden="true">·</span>
                      <span>{story.region}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        <Numeric>{story.source_count}</Numeric> sources
                      </span>
                      {story.top_source_url ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <a
                            href={story.top_source_url}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            {story.top_source_name}
                            <ExternalLink aria-hidden="true" className="size-3" />
                          </a>
                        </>
                      ) : null}
                      <span aria-hidden="true">·</span>
                      <span>{relativeTime(story.created_at, now)}</span>
                    </p>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => run(() => publishAiStory(story.id))}
                      disabled={isPending}
                    >
                      Publish
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => run(() => rejectAiStory(story.id))}
                      disabled={isPending}
                    >
                      Reject
                    </Button>
                  </div>
                </div>

                {story.summary ? (
                  <p className="text-xs leading-relaxed text-body">{story.summary}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* ── Stories ────────────────────────────────────────────────────── */}
      <Panel
        title="Stories"
        description="Every story, newest coverage first. Editing a category or region here overrides the classifier for that story only."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted">
                <th className="px-4 py-2.5 font-medium">Story</th>
                <th className="px-4 py-2.5 font-medium">Category</th>
                <th className="px-4 py-2.5 font-medium">Region</th>
                <th className="px-4 py-2.5 text-right font-medium">Score</th>
                <th className="px-4 py-2.5 text-right font-medium">Sources</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {stories.map((story) => (
                <tr key={story.id} className="border-b border-border/60 last:border-0">
                  <td className="max-w-md px-4 py-2.5">
                    <Link
                      href={`/ai/${story.slug}`}
                      className="line-clamp-2 font-medium text-ink hover:text-primary"
                    >
                      {story.title}
                    </Link>
                  </td>

                  <td className="px-4 py-2.5">
                    <select
                      defaultValue={story.category}
                      onChange={(event) =>
                        run(() => updateAiStoryMeta(story.id, { category: event.target.value }))
                      }
                      disabled={isPending}
                      aria-label={`Category for ${story.title}`}
                      className="min-h-9 rounded-md border border-border bg-background px-2 text-xs text-ink"
                    >
                      {AI_CATEGORIES.map((category) => (
                        <option key={category.value} value={category.value}>
                          {category.label}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td className="px-4 py-2.5">
                    <select
                      defaultValue={story.region}
                      onChange={(event) =>
                        run(() => updateAiStoryMeta(story.id, { region: event.target.value }))
                      }
                      disabled={isPending}
                      aria-label={`Region for ${story.title}`}
                      className="min-h-9 rounded-md border border-border bg-background px-2 text-xs text-ink"
                    >
                      {AI_REGIONS.map((region) => (
                        <option key={region} value={region}>
                          {region}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td className="px-4 py-2.5 text-right text-muted">
                    {/* A null score renders as an em dash and never as 0 — the
                        same rule the public cards follow. */}
                    {story.trend_score === null ? (
                      <span title="No usable publication time — deliberately unranked">—</span>
                    ) : (
                      <Numeric
                        title={`recency ${story.recency_score ?? "—"} · velocity ${
                          story.velocity_score ?? "—"
                        } · authority ${story.authority_score ?? "—"} · engagement ${
                          story.engagement_score ?? "—"
                        }`}
                      >
                        {Math.round(Number(story.trend_score))}
                      </Numeric>
                    )}
                  </td>

                  <td className="px-4 py-2.5 text-right text-muted">
                    <Numeric>{story.source_count}</Numeric>
                  </td>

                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      <Badge value={story.status} />
                      {story.is_hidden ? <Badge value="hidden" /> : null}
                    </div>
                  </td>

                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        title={story.featured ? "Unpin as top story" : "Pin as top story"}
                        onClick={() => run(() => setAiStoryFeatured(story.id, !story.featured))}
                        disabled={isPending}
                        className={cn(
                          "inline-flex size-9 items-center justify-center rounded-md border border-border transition-colors hover:bg-secondary-bg",
                          story.featured && "border-primary/40 bg-primary/10 text-primary",
                        )}
                      >
                        <Star aria-hidden="true" className="size-4" />
                        <span className="sr-only">
                          {story.featured ? "Unpin" : "Pin"} {story.title}
                        </span>
                      </button>

                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => run(() => setAiStoryHidden(story.id, !story.is_hidden))}
                        disabled={isPending}
                      >
                        {story.is_hidden ? "Unhide" : "Hide"}
                      </Button>

                      {story.status !== "published" ? (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => run(() => publishAiStory(story.id))}
                          disabled={isPending}
                        >
                          Publish
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* ── Merge ──────────────────────────────────────────────────────── */}
      <MergePanel stories={stories} disabled={isPending} onMerge={run} />

      {/* ── Sources ────────────────────────────────────────────────────── */}
      <Panel
        title="Sources"
        description="Configuration, not code. Turning a source off stops it being fetched on the next run; turning it back on clears its failure backoff."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted">
                <th className="px-4 py-2.5 font-medium">Source</th>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 text-right font-medium">Trust</th>
                <th className="px-4 py-2.5 text-right font-medium">Every</th>
                <th className="px-4 py-2.5 font-medium">Health</th>
                <th className="px-4 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((source) => (
                <tr key={source.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-ink">{source.name}</div>
                    <div className="max-w-xs truncate text-xs text-muted">
                      {source.feed_url ?? source.api_endpoint ?? "—"}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-muted">
                    <div>{source.source_type}</div>
                    <div className="text-xs">{source.source_category}</div>
                  </td>
                  <td className="px-4 py-2.5 text-right text-muted">
                    <Numeric>{Number(source.reliability_score).toFixed(2)}</Numeric>
                  </td>
                  <td className="px-4 py-2.5 text-right text-muted">
                    <Numeric>{source.poll_interval_minutes}</Numeric>m
                  </td>
                  <td className="px-4 py-2.5">
                    {!source.enabled ? (
                      <span className="text-xs text-muted">off</span>
                    ) : source.is_healthy ? (
                      <span className="inline-flex items-center gap-1 text-xs text-success">
                        <CheckCircle2 aria-hidden="true" className="size-3.5" />
                        ok
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 text-xs text-error"
                        title={source.last_error ?? undefined}
                      >
                        <AlertTriangle aria-hidden="true" className="size-3.5" />
                        {source.consecutive_failures} fails
                      </span>
                    )}
                    <div className="text-xs text-muted">
                      {source.last_success_at
                        ? relativeTime(source.last_success_at, now)
                        : "never fetched"}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          run(() => setAiSourceAutoPublish(source.id, !source.auto_publish))
                        }
                        disabled={isPending}
                        title="Whether stories built only from this source may go live without review"
                      >
                        {source.auto_publish ? "Auto-publish on" : "Auto-publish off"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => run(() => setAiSourceEnabled(source.id, !source.enabled))}
                        disabled={isPending}
                      >
                        {source.enabled ? "Disable" : "Enable"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => runIngestionNow([source.id])}
                        disabled={isPending || source.source_type === "manual"}
                      >
                        Fetch
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* ── Incoming articles ──────────────────────────────────────────── */}
      <Panel
        title="Incoming articles"
        description="Including the rejections and their scores. This is how a bad weight in the classifier gets found."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted">
                <th className="px-4 py-2.5 font-medium">Headline</th>
                <th className="px-4 py-2.5 font-medium">Source</th>
                <th className="px-4 py-2.5 text-right font-medium">Relevance</th>
                <th className="px-4 py-2.5 font-medium">Category</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {articles.map((article) => (
                <tr key={article.id} className="border-b border-border/60 last:border-0">
                  <td className="max-w-md px-4 py-2.5">
                    <a
                      href={article.source_url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="line-clamp-2 text-ink hover:text-primary"
                    >
                      {article.title}
                    </a>
                    {article.rejected_reason ? (
                      <div className="text-xs text-muted">{article.rejected_reason}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5 text-muted">{article.source_name}</td>
                  <td className="px-4 py-2.5 text-right text-muted">
                    <Numeric>
                      {article.relevance_score === null
                        ? "—"
                        : Number(article.relevance_score).toFixed(2)}
                    </Numeric>
                  </td>
                  <td className="px-4 py-2.5 text-muted">{article.category ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <Badge value={article.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* ── Add by hand ────────────────────────────────────────────────── */}
      <ManualArticlePanel disabled={isPending} onSubmit={run} />

      {/* ── Run log ────────────────────────────────────────────────────── */}
      <Panel title="Ingestion log" description="One row per run, newest first.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted">
                <th className="px-4 py-2.5 font-medium">Started</th>
                <th className="px-4 py-2.5 font-medium">Trigger</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 text-right font-medium">Sources</th>
                <th className="px-4 py-2.5 text-right font-medium">Fetched</th>
                <th className="px-4 py-2.5 text-right font-medium">Relevant</th>
                <th className="px-4 py-2.5 text-right font-medium">New</th>
                <th className="px-4 py-2.5 text-right font-medium">Took</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((entry) => (
                <tr key={entry.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2.5 text-muted">{relativeTime(entry.started_at, now)}</td>
                  <td className="px-4 py-2.5 text-muted">{entry.trigger_source}</td>
                  <td className="px-4 py-2.5">
                    <Badge value={entry.status} />
                  </td>
                  <td className="px-4 py-2.5 text-right text-muted">
                    <Numeric>
                      {entry.sources_succeeded}/{entry.sources_attempted}
                    </Numeric>
                  </td>
                  <td className="px-4 py-2.5 text-right text-muted">
                    <Numeric>{entry.articles_fetched}</Numeric>
                  </td>
                  <td className="px-4 py-2.5 text-right text-muted">
                    <Numeric>{entry.articles_relevant}</Numeric>
                  </td>
                  <td className="px-4 py-2.5 text-right text-muted">
                    <Numeric>{entry.stories_created}</Numeric>
                  </td>
                  <td className="px-4 py-2.5 text-right text-muted">
                    <Numeric>
                      {entry.duration_ms === null ? "—" : `${(entry.duration_ms / 1000).toFixed(1)}s`}
                    </Numeric>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );

  /** Kicks off a run and keeps its summary on screen rather than only in the log. */
  function runIngestionNow(sourceIds?: string[]) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await runAiNewsIngestion(sourceIds);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setLastRun(result.summary);
        router.refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "The run could not be started.");
      }
    });
  }
}

/**
 * Merging two stories into one.
 *
 * This is the human half of duplicate detection, and it is here because
 * `findStoryForArticle` is deliberately conservative: it requires a shared
 * entity *and* a similar headline *and* a time window, so it misses pairs a
 * reader would call obvious ("Meta debuts its Muse AI agent" against "Muse:
 * Meta's personal AI agent"). Loosening it would merge unrelated stories about
 * the same company in the same week, and a wrong merge destroys a story while a
 * missed one merely shows it twice. So the misses land here.
 */
function MergePanel({
  stories,
  disabled,
  onMerge,
}: {
  stories: AdminAiStory[];
  disabled: boolean;
  onMerge: (task: () => Promise<{ ok: true } | { ok: false; error: string }>) => void;
}) {
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");

  const options = stories.filter((story) => story.status !== "rejected");

  return (
    <Panel
      title="Merge duplicate stories"
      description="Moves every article and entity from the first story onto the second, then marks the first as merged. The source count on the target is recomputed by the database."
    >
      <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-end">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted">
          Merge this story
          <select
            value={source}
            onChange={(event) => setSource(event.target.value)}
            className="min-h-11 rounded-md border border-border bg-background px-3 text-sm text-ink"
          >
            <option value="">Select a duplicate…</option>
            {options.map((story) => (
              <option key={story.id} value={story.id}>
                {story.title.slice(0, 90)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted">
          into this one
          <select
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            className="min-h-11 rounded-md border border-border bg-background px-3 text-sm text-ink"
          >
            <option value="">Select the story to keep…</option>
            {options
              .filter((story) => story.id !== source)
              .map((story) => (
                <option key={story.id} value={story.id}>
                  {story.title.slice(0, 90)}
                </option>
              ))}
          </select>
        </label>

        <Button
          type="button"
          onClick={() => onMerge(() => mergeAiStories(source, target))}
          disabled={disabled || !source || !target || source === target}
          className="gap-2"
        >
          <Merge aria-hidden="true" className="size-4" />
          Merge
        </Button>
      </div>
    </Panel>
  );
}

/**
 * Adding an article by hand.
 *
 * Goes through the same classifier and the same grouping as an ingested one —
 * this is a shortcut past the *fetch*, not past the pipeline. The one thing it
 * skips is the auto-publish threshold, because a person typed it.
 */
function ManualArticlePanel({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (task: () => Promise<{ ok: true } | { ok: false; error: string }>) => void;
}) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [excerpt, setExcerpt] = useState("");

  return (
    <Panel
      title="Add an article by hand"
      description="For a story no configured feed carries. Classified, grouped and summarised exactly like an ingested one, then published."
    >
      <form
        className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(async () => {
            const result = await addManualAiArticle({ url, title, sourceName, excerpt });
            if (result.ok) {
              setUrl("");
              setTitle("");
              setSourceName("");
              setExcerpt("");
            }
            return result;
          });
        }}
      >
        <label className="flex flex-col gap-1 text-xs text-muted">
          Article URL
          <Input
            type="url"
            required
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com/story"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted">
          Publication
          <Input
            type="text"
            required
            value={sourceName}
            onChange={(event) => setSourceName(event.target.value)}
            placeholder="TechCrunch"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted md:col-span-2">
          Headline
          <Input
            type="text"
            required
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="OpenAI launches…"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted md:col-span-2">
          Snippet (optional — read by the classifier, never rendered)
          <Input
            type="text"
            value={excerpt}
            onChange={(event) => setExcerpt(event.target.value)}
            placeholder="A sentence or two from the feed"
          />
        </label>

        <div className="md:col-span-2">
          <Button type="submit" disabled={disabled}>
            Add article
          </Button>
        </div>
      </form>
    </Panel>
  );
}
