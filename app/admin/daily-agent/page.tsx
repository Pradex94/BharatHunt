import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { ArrowLeft, Radar } from "lucide-react";

import { DailyCandidateCard, StatusBadge, type CandidateView } from "@/components/admin/daily-agent/candidate-card";
import { DailyAgentRunner } from "@/components/admin/daily-agent/runner";
import { DailyAgentSettingsForm, DailyAgentUrlQueue } from "@/components/admin/daily-agent/settings-form";
import { Container } from "@/components/ui/container";
import { getIsAdmin } from "@/lib/admin";
import { PRODUCT_CATEGORIES } from "@/lib/constants";
import { isAiContentEnabled } from "@/lib/daily-agent/ai";
import { autoPublishActive, DAILY5_AGENT, type AgentConfig } from "@/lib/daily-agent/config";
import { shortfallMessage } from "@/lib/daily-agent/select";
import { DISCOVERY_SOURCES, type SourceReport } from "@/lib/daily-agent/sources";
import type { DraftContent, Facts, IndiaSignal, Scores } from "@/lib/daily-agent/types";
import { createServiceClient } from "@/lib/supabase/service";
import {
  getAgentConfig,
  getBatch,
  getCandidates,
  listBatches,
  type BatchRow,
  type CandidateRow,
} from "@/services/daily-agent";

export const metadata = {
  title: "Daily 5 Agent",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Admin → Daily 5 Agent. The page gate decides what renders; every write
 * re-checks admin status in lib/actions/daily-agent-admin.ts.
 */

async function productSlugs(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data } = await createServiceClient().from("products").select("id, slug").in("id", ids);
  return new Map((data ?? []).map((row) => [row.id, row.slug]));
}

function toView(row: CandidateRow, slugs: Map<string, string>): CandidateView {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    statusReason: row.status_reason,
    websiteUrl: row.website_url,
    websiteInferred: row.website_inferred,
    sourceName: row.source_name,
    sourceUrls: row.source_urls,
    sourceSnippet: row.source_snippet,
    discoveredAt: row.discovered_at,
    verifiedAt: row.verified_at,
    indiaConfidence: row.india_confidence,
    signals: (row.india_signals as unknown as IndiaSignal[]) ?? [],
    facts: (row.facts ?? {}) as Partial<Facts>,
    content: (row.content ?? {}) as Partial<DraftContent>,
    scores: (row.scores ?? {}) as Partial<Scores>,
    overallScore: row.overall_score,
    issues: row.issues,
    duplicateReason: row.duplicate_reason,
    productSlug: row.product_id ? (slugs.get(row.product_id) ?? null) : null,
    rank: row.rank,
    reviewNote: row.review_note,
  };
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "primary" | "muted" }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2.5">
      <p className={`font-mono text-2xl font-bold tabular-nums ${tone === "primary" ? "text-primary" : "text-ink"}`}>{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

function settingsInput(config: AgentConfig) {
  return {
    dailyTarget: config.dailyTarget,
    runTime: config.runTime,
    timezone: config.timezone,
    mode: config.mode,
    autoPublishAllowed: config.autoPublishAllowed,
    enabled: config.enabled,
    minIndiaConfidence: config.minIndiaConfidence,
    minQualityScore: config.minQualityScore,
    enabledSources: config.enabledSources,
    maxDiscoveryCandidates: config.maxDiscoveryCandidates,
    maxSitesPerBatch: config.maxSitesPerBatch,
    maxAiCalls: config.maxAiCalls,
    maxConcurrentRequests: config.maxConcurrentRequests,
    requestTimeoutMs: config.requestTimeoutMs,
    cacheTtlDays: config.cacheTtlDays,
    notifyEnabled: config.notifyEnabled,
    weights: { ...config.weights } as Record<string, number>,
  };
}

const SECTIONS: Array<{ title: string; statuses: string[]; hint: string }> = [
  { title: "Selected", statuses: ["selected", "publishing"], hint: "Today's picks, best first." },
  { title: "Published", statuses: ["published"], hint: "Live on BharatHunt and on /daily-5." },
  { title: "Needs review", statuses: ["needs_review"], hint: "Plausible, with an open question — never auto-published." },
  { title: "Eligible reserves", statuses: ["eligible"], hint: "Verified but not in today's top picks." },
];

export default async function DailyAgentAdminPage({ searchParams }: { searchParams: Promise<{ batch?: string }> }) {
  const { userId } = await auth();
  if (!userId) redirect("/login");
  if (!(await getIsAdmin())) redirect("/");

  let config: AgentConfig | null = null;
  let setupError: string | null = null;
  try {
    config = await getAgentConfig(DAILY5_AGENT);
  } catch (error) {
    setupError = error instanceof Error ? error.message : "unknown error";
  }

  if (!config) {
    return (
      <main className="min-h-dvh bg-background py-10">
        <Container>
          <p className="mx-auto max-w-3xl rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            The Daily 5 tables don&apos;t exist yet{setupError ? ` (${setupError})` : ""}. Apply{" "}
            <code>supabase/migrations/20261002000000_daily_agent.sql</code>.
          </p>
        </Container>
      </main>
    );
  }

  const params = await searchParams;
  const batches = await listBatches(DAILY5_AGENT, 30);
  const requested = params.batch && /^[0-9a-f-]{36}$/i.test(params.batch) ? await getBatch(params.batch) : null;
  const batch: BatchRow | null = requested ?? batches[0] ?? null;
  const candidates = batch ? await getCandidates(batch.id) : [];
  const slugs = await productSlugs(candidates.map((row) => row.product_id).filter((id): id is string => Boolean(id)));
  const views = candidates.map((row) => toView(row, slugs));
  const reports = (batch?.source_reports as unknown as SourceReport[]) ?? [];
  const log = ((batch?.log as unknown as { at: string; message: string }[]) ?? []).slice(-60);
  const shortfall = batch && ["review", "completed"].includes(batch.status) ? shortfallMessage(batch.selected_count, batch.target_count) : null;
  const others = views.filter((view) => ["already_exists", "ineligible", "skipped", "rejected", "discovered"].includes(view.status));
  const aiEnabled = isAiContentEnabled();

  return (
    <main className="min-h-dvh bg-background py-10 md:py-14">
      <Container>
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Radar className="size-5" />
              </span>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-ink">Daily 5 Agent</h1>
                <p className="text-sm text-muted">
                  {config.enabled ? `Runs daily at ${config.runTime} (${config.timezone})` : "Switched off"} ·{" "}
                  {autoPublishActive(config) ? "Auto-publish on" : "Approval mode"} · target {config.dailyTarget}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link prefetch={false} href="/daily-5" className="inline-flex min-h-11 items-center rounded-md border border-border bg-card px-4 text-sm font-semibold text-ink hover:bg-secondary-bg">
                Public page
              </Link>
              <Link prefetch={false} href="/admin" className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-semibold text-ink hover:bg-secondary-bg">
                <ArrowLeft className="size-4" aria-hidden="true" />
                Admin
              </Link>
            </div>
          </div>

          <DailyAgentRunner activeBatchId={batch?.id ?? null} activeBatchStatus={batch?.status ?? null} activeIsDryRun={batch?.is_dry_run ?? false} />

          {batch ? (
            <section className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold text-ink">
                  {batch.is_dry_run ? "Dry run" : "Batch"} · {batch.batch_date}
                </h2>
                <StatusBadge status={batch.status} />
                {batch.is_dry_run && <span className="rounded-full bg-secondary-bg px-2.5 py-0.5 text-xs font-semibold text-body">nothing publishes</span>}
                <span className="text-xs text-muted">started {batch.started_at.slice(0, 16).replace("T", " ")} UTC · {batch.trigger}</span>
              </div>
              {batch.error_message && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-error">Failed in {batch.failed_stage}: {batch.error_message}</p>
              )}
              {shortfall && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-warning">{shortfall}</p>}

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
                <Stat label="Target" value={batch.target_count} />
                <Stat label="Discovered" value={batch.discovered_count} />
                <Stat label="Duplicates" value={batch.duplicate_count} />
                <Stat label="Eligible" value={batch.eligible_count} />
                <Stat label="Selected" value={batch.selected_count} tone="primary" />
                <Stat label="Published" value={batch.published_count} tone="primary" />
                <Stat label="Needs review" value={batch.needs_review_count} />
                <Stat label="Rejected" value={batch.rejected_count + batch.ineligible_count} />
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="Websites fetched" value={batch.sites_fetched} />
                <Stat label="Cache hits (not refetched)" value={batch.cache_hits} />
                <Stat label={aiEnabled ? "AI calls" : "AI calls (no key: off)"} value={batch.ai_calls} />
                <Stat label="Estimated AI cost" value={`$${Number(batch.ai_cost_usd).toFixed(2)}`} />
              </div>

              {reports.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-border bg-card">
                  <table className="w-full min-w-[480px] text-left text-sm">
                    <thead className="text-xs text-muted">
                      <tr>
                        <th className="px-3 py-2 font-medium">Source</th>
                        <th className="px-3 py-2 font-medium">Result</th>
                        <th className="px-3 py-2 font-medium">Found</th>
                        <th className="px-3 py-2 font-medium">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reports.map((report) => (
                        <tr key={report.source} className="border-t border-border">
                          <td className="px-3 py-2 text-ink">{report.source.replace(/_/g, " ")}</td>
                          <td className={`px-3 py-2 ${report.ok ? "text-success" : "text-error"}`}>{report.ok ? "ok" : report.error}</td>
                          <td className="px-3 py-2 font-mono tabular-nums">{report.found}</td>
                          <td className="px-3 py-2 font-mono tabular-nums text-muted">{report.ms} ms</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {SECTIONS.map((section) => {
                const rows = views.filter((view) => section.statuses.includes(view.status));
                if (rows.length === 0) return null;
                return (
                  <div key={section.title} className="flex flex-col gap-3">
                    <div>
                      <h3 className="text-base font-bold text-ink">
                        {section.title} <span className="font-mono text-sm text-muted">({rows.length})</span>
                      </h3>
                      <p className="text-xs text-muted">{section.hint}</p>
                    </div>
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                      {rows.map((view) => (
                        <DailyCandidateCard key={view.id} candidate={view} categories={PRODUCT_CATEGORIES} isDryRun={batch.is_dry_run} />
                      ))}
                    </div>
                  </div>
                );
              })}

              {others.length > 0 && (
                <details className="rounded-xl border border-border bg-card p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-ink">
                    Not selected ({others.length}) — duplicates, ineligible, skipped, rejected
                  </summary>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full min-w-[560px] text-left text-xs">
                      <tbody>
                        {others.map((view) => (
                          <tr key={view.id} className="border-t border-border align-top">
                            <td className="px-2 py-2 font-semibold text-ink">
                              {view.websiteUrl ? (
                                <a href={view.websiteUrl} target="_blank" rel="noopener noreferrer nofollow" className="hover:text-primary">
                                  {view.name}
                                </a>
                              ) : (
                                view.name
                              )}
                            </td>
                            <td className="px-2 py-2"><StatusBadge status={view.status} /></td>
                            <td className="px-2 py-2 text-body">{view.duplicateReason ?? view.statusReason ?? "—"}</td>
                            <td className="px-2 py-2 text-muted">{view.sourceName.replace(/_/g, " ")}</td>
                            <td className="px-2 py-2 font-mono text-muted">{view.indiaConfidence ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}

              {log.length > 0 && (
                <details className="rounded-xl border border-border bg-card p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-ink">Batch log</summary>
                  <ol className="mt-2 space-y-0.5 font-mono text-[11px] text-body">
                    {log.map((line, index) => (
                      <li key={index}>
                        <span className="text-muted">{line.at.slice(11, 19)}</span> [BHARATHUNT-DAILY5] {line.message}
                      </li>
                    ))}
                  </ol>
                </details>
              )}
            </section>
          ) : (
            <p className="rounded-xl border border-border bg-card p-4 text-sm text-body">No batches yet. Start with a dry run.</p>
          )}

          <section className="rounded-2xl border border-border bg-card p-4 md:p-5">
            <h2 className="text-base font-bold text-ink">History</h2>
            {batches.length === 0 ? (
              <p className="mt-2 text-sm text-muted">Nothing yet.</p>
            ) : (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="text-xs text-muted">
                    <tr>
                      <th className="px-2 py-1.5 font-medium">Date</th>
                      <th className="px-2 py-1.5 font-medium">Kind</th>
                      <th className="px-2 py-1.5 font-medium">Status</th>
                      <th className="px-2 py-1.5 font-medium">Discovered</th>
                      <th className="px-2 py-1.5 font-medium">Selected</th>
                      <th className="px-2 py-1.5 font-medium">Published</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batches.map((row) => (
                      <tr key={row.id} className={`border-t border-border ${row.id === batch?.id ? "bg-secondary-bg/60" : ""}`}>
                        <td className="px-2 py-1.5">
                          <Link prefetch={false} href={`/admin/daily-agent?batch=${row.id}`} className="font-semibold text-ink hover:text-primary">
                            {row.batch_date}
                          </Link>
                        </td>
                        <td className="px-2 py-1.5 text-muted">{row.is_dry_run ? "dry run" : row.trigger}</td>
                        <td className="px-2 py-1.5"><StatusBadge status={row.status} /></td>
                        <td className="px-2 py-1.5 font-mono tabular-nums">{row.discovered_count}</td>
                        <td className="px-2 py-1.5 font-mono tabular-nums">{row.selected_count}/{row.target_count}</td>
                        <td className="px-2 py-1.5 font-mono tabular-nums">{row.published_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-card p-4 md:p-5">
            <h2 className="text-base font-bold text-ink">Queue product URLs</h2>
            <p className="mb-3 text-xs text-muted">
              Products you have spotted yourself. They go through the same India check, duplicate check and scoring on the next run.
            </p>
            <DailyAgentUrlQueue queued={config.manualUrls} />
          </section>

          <section className="rounded-2xl border border-border bg-card p-4 md:p-5">
            <h2 className="mb-4 text-base font-bold text-ink">Settings</h2>
            <DailyAgentSettingsForm
              initial={settingsInput(config)}
              sources={DISCOVERY_SOURCES.map(({ key, name, description }) => ({ key, name, description }))}
              aiEnabled={aiEnabled}
            />
          </section>
        </div>
      </Container>
    </main>
  );
}
