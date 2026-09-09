"use client";

/* Design system: design.md (Bharat Hunt — orange) · /admin/funding
 *
 * The funding review queue, the source table and the ingestion controls.
 *
 * An internal tool, styled like one: dense rows, no motion, no marketing voice.
 * The job it has to support is a person working through a queue of extracted
 * records against their sources, so the priority is that a decision costs one
 * click and that everything needed to make it is on screen — the amount, the
 * stage, the investors, the confidence, and a link to the article.
 *
 * Nothing here authorizes anything. Every action re-checks `getIsAdmin()` on
 * the server (lib/actions/funding-admin.ts); this component only decides what
 * is drawn for someone the page already let in.
 */

import { useMemo, useState, useTransition } from "react";
import {
  Check,
  ExternalLink,
  Eye,
  EyeOff,
  Pencil,
  Play,
  Plus,
  Star,
  TriangleAlert,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Numeric } from "@/components/ui/typography";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  approveFundingRound,
  createManualFundingRound,
  rejectFundingRound,
  runFundingIngestionNow,
  setFundingRoundFeatured,
  setFundingRoundHidden,
  setFundingSourceEnabled,
  updateFundingRound,
  type FundingRoundInput,
} from "@/lib/actions/funding-admin";
import { FUNDING_CITIES, FUNDING_INDUSTRIES, FUNDING_STAGES } from "@/lib/funding/constants";
import { displayAmount, formatDay, relativeTime, UNDISCLOSED_LABEL } from "@/lib/funding/format";
import type {
  AdminFundingRound,
  AdminFundingSource,
  AdminFundingStats,
  IngestionRunSummary,
} from "@/services/funding-admin";

/** The editor's state: every field as a string, the way an input holds it. */
type Draft = {
  id: string | null;
  startupName: string;
  headline: string;
  summary: string;
  amountText: string;
  amountNumeric: string;
  currency: string;
  fundingStage: string;
  industry: string;
  subIndustry: string;
  location: string;
  city: string;
  investors: string;
  leadInvestor: string;
  announcementDate: string;
  sourceName: string;
  sourceUrl: string;
};

const EMPTY_DRAFT: Draft = {
  id: null,
  startupName: "",
  headline: "",
  summary: "",
  amountText: "",
  amountNumeric: "",
  currency: "INR",
  fundingStage: "Undisclosed",
  industry: "",
  subIndustry: "",
  location: "",
  city: "",
  investors: "",
  leadInvestor: "",
  announcementDate: new Date().toISOString().slice(0, 10),
  sourceName: "",
  sourceUrl: "",
};

function toDraft(round: AdminFundingRound): Draft {
  return {
    id: round.id,
    startupName: round.startup_name,
    headline: round.headline,
    summary: round.summary ?? "",
    amountText: round.amount ?? "",
    amountNumeric: round.amount_numeric === null ? "" : String(round.amount_numeric),
    currency: round.currency ?? "INR",
    fundingStage: round.funding_stage,
    industry: round.industry ?? "",
    subIndustry: "",
    location: round.location ?? "",
    city: round.city ?? "",
    investors: round.investors.join(", "),
    leadInvestor: round.lead_investor ?? "",
    announcementDate: round.announcement_date,
    sourceName: round.source_name,
    sourceUrl: round.source_url,
  };
}

function toInput(draft: Draft): FundingRoundInput {
  return {
    startupName: draft.startupName,
    headline: draft.headline,
    summary: draft.summary,
    amountText: draft.amountText,
    amountNumeric: draft.amountNumeric,
    currency: draft.currency,
    fundingStage: draft.fundingStage,
    industry: draft.industry,
    subIndustry: draft.subIndustry,
    location: draft.location,
    city: draft.city,
    investors: draft.investors,
    leadInvestor: draft.leadInvestor,
    announcementDate: draft.announcementDate,
    sourceName: draft.sourceName,
    sourceUrl: draft.sourceUrl,
  };
}

export function FundingManager({
  stats,
  queue,
  published,
  sources,
  runs,
  aiEnabled,
}: {
  stats: AdminFundingStats;
  queue: AdminFundingRound[];
  published: AdminFundingRound[];
  sources: AdminFundingSource[];
  runs: IngestionRunSummary[];
  aiEnabled: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [tab, setTab] = useState<"queue" | "published" | "sources">("queue");

  const lastRun = runs[0];

  /** Every action funnels through here so the result banner behaves the same. */
  function run(action: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) setMessage(result.message ?? "Done.");
      else setError(result.error ?? "Something went wrong.");
    });
  }

  const statTiles = useMemo(
    () => [
      { label: "In review", value: stats.pending },
      { label: "Published", value: stats.published },
      { label: "Rejected", value: stats.rejected },
      { label: "Articles seen", value: stats.articles },
      { label: "Companies", value: stats.startups },
      { label: "Investors", value: stats.investors },
    ],
    [stats],
  );

  return (
    <div className="flex flex-col gap-6">
      {/* ── Counters ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {statTiles.map((tile) => (
          <div key={tile.label} className="rounded-xl border border-border bg-card p-4">
            <Numeric className="text-2xl font-bold text-ink">
              {tile.value.toLocaleString("en-IN")}
            </Numeric>
            <div className="text-xs text-muted">{tile.label}</div>
          </div>
        ))}
      </div>

      {/* ── Ingestion ────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">Ingestion</h2>
            <p className="text-xs text-muted">
              {stats.lastSuccessfulRunAt
                ? `Last successful run ${relativeTime(stats.lastSuccessfulRunAt)} · ${formatDay(stats.lastSuccessfulRunAt)}`
                : "No successful run recorded yet."}
              {" · "}
              {aiEnabled
                ? "AI extraction is configured."
                : "AI extraction is off — rule-based extraction only (set ANTHROPIC_API_KEY to enable)."}
            </p>
          </div>

          <Button
            type="button"
            disabled={pending}
            onClick={() => run(() => runFundingIngestionNow())}
            data-icon="inline-start"
          >
            <Play className="size-4" aria-hidden="true" />
            {pending ? "Running…" : "Run ingestion now"}
          </Button>
        </div>

        {lastRun && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="border-b border-border text-muted">
                <tr>
                  <th className="py-2 pr-3 font-medium">Run</th>
                  <th className="py-2 pr-3 font-medium">Fetched</th>
                  <th className="py-2 pr-3 font-medium">New</th>
                  <th className="py-2 pr-3 font-medium">Rounds</th>
                  <th className="py-2 pr-3 font-medium">Duplicates</th>
                  <th className="py-2 pr-3 font-medium">Rejected</th>
                  <th className="py-2 pr-3 font-medium">Errors</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((entry) => (
                  <tr key={entry.runId} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-3">
                      <span className="text-ink">{relativeTime(entry.startedAt)}</span>
                      <span className="ml-2 text-muted-soft">{entry.trigger}</span>
                    </td>
                    <td className="py-2 pr-3">
                      <Numeric>{entry.articlesFetched}</Numeric>
                    </td>
                    <td className="py-2 pr-3">
                      <Numeric>{entry.articlesCreated}</Numeric>
                    </td>
                    <td className="py-2 pr-3">
                      <Numeric className="font-semibold text-primary">
                        {entry.roundsCreated}
                      </Numeric>
                    </td>
                    <td className="py-2 pr-3">
                      <Numeric>{entry.duplicates}</Numeric>
                    </td>
                    <td className="py-2 pr-3">
                      <Numeric>{entry.rejected}</Numeric>
                    </td>
                    <td className="py-2 pr-3">
                      {entry.errors > 0 ? (
                        <span
                          className="font-semibold text-destructive"
                          title={entry.failures.map((f) => `${f.source}: ${f.error}`).join("\n")}
                        >
                          {entry.errors}
                        </span>
                      ) : (
                        <span className="text-muted-soft">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {(message || error) && (
        <p
          role="status"
          className={cn(
            "rounded-lg border px-3 py-2 text-sm",
            error
              ? "border-destructive/30 bg-destructive/5 text-destructive"
              : "border-success/30 bg-success/5 text-success",
          )}
        >
          {error ?? message}
        </p>
      )}

      {/* ── Tabs ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["queue", `Review queue (${queue.length})`],
            ["published", `Published (${published.length})`],
            ["sources", `Sources (${sources.length})`],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            aria-pressed={tab === value}
            className={cn(
              "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors pointer-coarse:min-h-11",
              tab === value
                ? "border-primary bg-primary text-white"
                : "border-border bg-card text-body hover:bg-secondary-bg",
            )}
          >
            {label}
          </button>
        ))}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setEditing({ ...EMPTY_DRAFT })}
          data-icon="inline-start"
        >
          <Plus className="size-4" aria-hidden="true" />
          Add round manually
        </Button>
      </div>

      {/* ── Review queue ─────────────────────────────────────────────── */}
      {tab === "queue" && (
        <div className="flex flex-col gap-3">
          {queue.length === 0 ? (
            <EmptyPanel>Nothing waiting for review.</EmptyPanel>
          ) : (
            queue.map((round) => (
              <ReviewRow
                key={round.id}
                round={round}
                pending={pending}
                onApprove={() => run(() => approveFundingRound(round.id))}
                onReject={() => run(() => rejectFundingRound(round.id, "Rejected in review"))}
                onEdit={() => setEditing(toDraft(round))}
              />
            ))
          )}
        </div>
      )}

      {/* ── Published ────────────────────────────────────────────────── */}
      {tab === "published" && (
        <div className="flex flex-col gap-3">
          {published.length === 0 ? (
            <EmptyPanel>Nothing published yet.</EmptyPanel>
          ) : (
            published.map((round) => (
              <div
                key={round.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-ink">{round.startup_name}</span>
                    <Numeric className="text-sm text-body">
                      {displayAmount(round) ?? UNDISCLOSED_LABEL}
                    </Numeric>
                    <span className="rounded-full bg-secondary-bg px-2 py-0.5 text-[11px] text-body">
                      {round.funding_stage}
                    </span>
                    {round.is_hidden && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-700">
                        hidden
                      </span>
                    )}
                    {round.is_featured && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                        featured
                      </span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-xs text-muted">{round.headline}</p>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <IconAction
                    label={round.is_featured ? "Unfeature" : "Feature"}
                    disabled={pending}
                    onClick={() =>
                      run(() => setFundingRoundFeatured(round.id, !round.is_featured))
                    }
                  >
                    <Star className={cn("size-4", round.is_featured && "fill-primary text-primary")} />
                  </IconAction>
                  <IconAction
                    label={round.is_hidden ? "Show" : "Hide"}
                    disabled={pending}
                    onClick={() => run(() => setFundingRoundHidden(round.id, !round.is_hidden))}
                  >
                    {round.is_hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </IconAction>
                  <IconAction label="Edit" disabled={pending} onClick={() => setEditing(toDraft(round))}>
                    <Pencil className="size-4" />
                  </IconAction>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Sources ──────────────────────────────────────────────────── */}
      {tab === "sources" && (
        <div className="flex flex-col gap-3">
          {sources.map((source) => (
            <div
              key={source.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-ink">{source.name}</span>
                  <span className="rounded-full bg-secondary-bg px-2 py-0.5 text-[11px] text-body">
                    {source.source_type}
                  </span>
                  {!source.is_healthy && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
                      <TriangleAlert className="size-3" aria-hidden="true" />
                      unhealthy · {source.consecutive_failures} failures
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted">
                  every {source.poll_interval_minutes} min · priority {source.priority}
                  {source.last_success_at
                    ? ` · last ok ${relativeTime(source.last_success_at)}`
                    : " · never succeeded"}
                </p>
                {source.last_error && (
                  <p className="mt-1 text-xs break-words text-destructive/80">{source.last_error}</p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => run(() => runFundingIngestionNow(source.id))}
                >
                  Run
                </Button>
                <Button
                  type="button"
                  variant={source.enabled ? "destructive" : "default"}
                  size="sm"
                  disabled={pending}
                  onClick={() => run(() => setFundingSourceEnabled(source.id, !source.enabled))}
                >
                  {source.enabled ? "Disable" : "Enable"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Editor ───────────────────────────────────────────────────── */}
      <Sheet open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{editing?.id ? "Edit funding round" : "Add funding round"}</SheetTitle>
          </SheetHeader>

          {editing && (
            <form
              className="flex flex-col gap-4 p-4"
              onSubmit={(event) => {
                event.preventDefault();
                const input = toInput(editing);
                run(async () => {
                  const result = editing.id
                    ? await updateFundingRound(editing.id, input)
                    : await createManualFundingRound(input);
                  if (result.ok) setEditing(null);
                  return result;
                });
              }}
            >
              <Field label="Company" required>
                <Input
                  value={editing.startupName}
                  onChange={(e) => setEditing({ ...editing, startupName: e.target.value })}
                  required
                />
              </Field>

              <Field label="Headline" required>
                <Input
                  value={editing.headline}
                  onChange={(e) => setEditing({ ...editing, headline: e.target.value })}
                  required
                />
              </Field>

              <Field label="Summary" hint="50–80 words. Shown on the card.">
                <Textarea
                  rows={4}
                  value={editing.summary}
                  onChange={(e) => setEditing({ ...editing, summary: e.target.value })}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Amount" hint="Number only. Blank = undisclosed.">
                  <Input
                    inputMode="numeric"
                    value={editing.amountNumeric}
                    onChange={(e) =>
                      setEditing({ ...editing, amountNumeric: e.target.value.replace(/[^\d]/g, "") })
                    }
                  />
                </Field>
                <Field label="Currency">
                  <select
                    value={editing.currency}
                    onChange={(e) => setEditing({ ...editing, currency: e.target.value })}
                    className="h-9 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
                  >
                    {["INR", "USD", "EUR", "GBP", "SGD", "AED", "JPY", "AUD", "CAD"].map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="Amount as reported" hint='Optional display text, e.g. "Rs 25 Cr".'>
                <Input
                  value={editing.amountText}
                  onChange={(e) => setEditing({ ...editing, amountText: e.target.value })}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Stage">
                  <select
                    value={editing.fundingStage}
                    onChange={(e) => setEditing({ ...editing, fundingStage: e.target.value })}
                    className="h-9 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
                  >
                    {FUNDING_STAGES.map((stage) => (
                      <option key={stage} value={stage}>
                        {stage}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Announced" required>
                  <Input
                    type="date"
                    value={editing.announcementDate}
                    onChange={(e) => setEditing({ ...editing, announcementDate: e.target.value })}
                    required
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Industry">
                  <select
                    value={editing.industry}
                    onChange={(e) => setEditing({ ...editing, industry: e.target.value })}
                    className="h-9 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
                  >
                    <option value="">—</option>
                    {FUNDING_INDUSTRIES.map((industry) => (
                      <option key={industry} value={industry}>
                        {industry}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="City bucket">
                  <select
                    value={editing.city}
                    onChange={(e) => setEditing({ ...editing, city: e.target.value })}
                    className="h-9 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
                  >
                    <option value="">—</option>
                    {FUNDING_CITIES.map((city) => (
                      <option key={city} value={city}>
                        {city}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="Location" hint="As written in the article.">
                <Input
                  value={editing.location}
                  onChange={(e) => setEditing({ ...editing, location: e.target.value })}
                />
              </Field>

              <Field label="Investors" hint="Comma separated.">
                <Input
                  value={editing.investors}
                  onChange={(e) => setEditing({ ...editing, investors: e.target.value })}
                />
              </Field>

              <Field label="Lead investor">
                <Input
                  value={editing.leadInvestor}
                  onChange={(e) => setEditing({ ...editing, leadInvestor: e.target.value })}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Source name" required>
                  <Input
                    value={editing.sourceName}
                    onChange={(e) => setEditing({ ...editing, sourceName: e.target.value })}
                    required
                  />
                </Field>
                <Field label="Source URL" required hint="Every figure must be attributable.">
                  <Input
                    type="url"
                    value={editing.sourceUrl}
                    onChange={(e) => setEditing({ ...editing, sourceUrl: e.target.value })}
                    required
                  />
                </Field>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <Button type="submit" disabled={pending}>
                  {pending ? "Saving…" : editing.id ? "Save changes" : "Add round"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

/**
 * One row of the review queue.
 *
 * Everything needed for a decision is on the row — including the confidence
 * score and the disagreement note, which are internal-only and never reach the
 * public card.
 */
function ReviewRow({
  round,
  pending,
  onApprove,
  onReject,
  onEdit,
}: {
  round: AdminFundingRound;
  pending: boolean;
  onApprove: () => void;
  onReject: () => void;
  onEdit: () => void;
}) {
  const confidence = round.confidence_score ?? 0;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-ink">{round.startup_name}</span>
            <Numeric className="text-sm font-bold text-ink">
              {displayAmount(round) ?? UNDISCLOSED_LABEL}
            </Numeric>
            <span className="rounded-full bg-secondary-bg px-2 py-0.5 text-[11px] text-body">
              {round.funding_stage}
            </span>
            {round.industry && (
              <span className="rounded-full bg-secondary-bg px-2 py-0.5 text-[11px] text-body">
                {round.industry}
              </span>
            )}
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-medium",
                confidence >= 0.8
                  ? "bg-success/10 text-success"
                  : confidence >= 0.5
                    ? "bg-amber-100 text-amber-700"
                    : "bg-destructive/10 text-destructive",
              )}
              title="Extraction confidence — internal only, never shown publicly"
            >
              {(confidence * 100).toFixed(0)}% confident
            </span>
            <span className="text-[11px] text-muted-soft">{round.extraction_method}</span>
          </div>

          <p className="mt-1 text-xs text-body">{round.headline}</p>

          {round.investors.length > 0 && (
            <p className="mt-1 text-xs text-muted">
              {round.lead_investor ? `Lead: ${round.lead_investor} · ` : ""}
              {round.investors.join(", ")}
            </p>
          )}

          <p className="mt-1 text-xs text-muted">
            {round.source_name} · {formatDay(round.announcement_date)}
            {round.location ? ` · ${round.location}` : ""}
          </p>

          {round.review_note && (
            <p className="mt-1 inline-flex items-center gap-1 text-xs text-amber-700">
              <TriangleAlert className="size-3 shrink-0" aria-hidden="true" />
              {round.review_note}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <a
            href={round.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex size-9 items-center justify-center rounded-md border border-border text-muted transition-colors hover:bg-secondary-bg hover:text-ink"
            title="Open the source article"
          >
            <ExternalLink className="size-4" aria-hidden="true" />
          </a>
          <IconAction label="Edit" disabled={pending} onClick={onEdit}>
            <Pencil className="size-4" />
          </IconAction>
          <Button type="button" size="sm" disabled={pending} onClick={onApprove} data-icon="inline-start">
            <Check className="size-4" aria-hidden="true" />
            Publish
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={pending}
            onClick={onReject}
            data-icon="inline-start"
          >
            <X className="size-4" aria-hidden="true" />
            Reject
          </Button>
        </div>
      </div>
    </div>
  );
}

function IconAction({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex size-9 items-center justify-center rounded-md border border-border text-muted transition-colors hover:bg-secondary-bg hover:text-ink disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs font-semibold text-ink">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
      {hint && <span className="text-[11px] text-muted-soft">{hint}</span>}
    </div>
  );
}

function EmptyPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted">
      {children}
    </div>
  );
}
