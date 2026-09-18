"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarClock, Loader2, Newspaper, Play, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { runAiNewsSweepBatch } from "@/lib/actions/ai-news";
import { runFundingSweepBatch } from "@/lib/actions/funding-admin";
import { shouldRunAnotherBatch, type SweepBatchResult } from "@/lib/pipeline-sweep";

/**
 * "Run now" for the two ingestion pipelines, on the admin dashboard.
 *
 * A press reads every enabled source once. One server call cannot — AI news
 * stops at eight sources and funding at the Workers subrequest ceiling — so the
 * button calls a batch action repeatedly, handing back the sweep's start time,
 * until a batch reads nothing (lib/pipeline-sweep.ts). The loop lives here, in
 * the browser, because that is what gives each batch its own server invocation
 * and its own budget.
 *
 * Every batch is committed as it finishes. Closing the tab mid-run loses the
 * rest of the sweep, not the part already read.
 */

type PipelineKey = "ai" | "funding";

export type PipelineCard = {
  key: PipelineKey;
  label: string;
  /** "3h ago", computed on the server where the status was read. */
  lastFetchLabel: string | null;
  enabledSources: number;
  failingSources: number;
  manageHref: string;
};

type Totals = {
  batches: number;
  sources: number;
  failed: number;
  fetched: number;
  created: number;
  updated: number;
  rejected: number;
};

type RunState =
  | { phase: "idle" }
  | { phase: "running"; totals: Totals }
  | { phase: "done"; totals: Totals }
  | { phase: "error"; totals: Totals; message: string };

const ZERO: Totals = { batches: 0, sources: 0, failed: 0, fetched: 0, created: 0, updated: 0, rejected: 0 };

const ACTIONS: Record<PipelineKey, (sweep?: string) => Promise<SweepBatchResult>> = {
  ai: runAiNewsSweepBatch,
  funding: runFundingSweepBatch,
};

/** What "created" and "updated" mean differs by pipeline, so the words do too. */
const WORDS: Record<PipelineKey, { created: string; updated: string }> = {
  ai: { created: "new stories", updated: "stories updated" },
  funding: { created: "new rounds", updated: "duplicates" },
};

const ICONS: Record<PipelineKey, typeof Sparkles> = { ai: Sparkles, funding: Newspaper };

function summarize(key: PipelineKey, totals: Totals): string {
  const words = WORDS[key];
  const parts = [
    `${totals.sources} source${totals.sources === 1 ? "" : "s"} read`,
    `${totals.fetched} fetched`,
    `${totals.created} ${words.created}`,
    `${totals.updated} ${words.updated}`,
    `${totals.rejected} rejected`,
  ];
  if (totals.failed > 0) parts.push(`${totals.failed} failed`);
  return parts.join(" · ");
}

export function PipelineRunner({
  pipelines,
  scheduleLabel,
}: {
  pipelines: PipelineCard[];
  scheduleLabel: string;
}) {
  const router = useRouter();
  const [states, setStates] = useState<Record<PipelineKey, RunState>>({
    ai: { phase: "idle" },
    funding: { phase: "idle" },
  });

  const setState = (key: PipelineKey, state: RunState) =>
    setStates((previous) => ({ ...previous, [key]: state }));

  async function run(key: PipelineKey) {
    const action = ACTIONS[key];
    let totals = ZERO;
    let sweep: string | undefined;
    setState(key, { phase: "running", totals });

    try {
      for (;;) {
        const result = await action(sweep);
        if (!result.ok) {
          setState(key, { phase: "error", totals, message: result.error });
          return;
        }

        sweep = result.sweepStartedAt;
        totals = {
          batches: totals.batches + 1,
          sources: totals.sources + result.sourcesAttempted,
          failed: totals.failed + result.sourcesFailed,
          fetched: totals.fetched + result.fetched,
          created: totals.created + result.created,
          updated: totals.updated + result.updated,
          rejected: totals.rejected + result.rejected,
        };
        setState(key, { phase: "running", totals });

        if (!shouldRunAnotherBatch(totals.batches, result.sourcesAttempted)) break;
      }
      setState(key, { phase: "done", totals });
    } catch (error) {
      // A thrown Server Action is a network failure or a platform timeout, not
      // a refusal. Whatever finished before it is already saved.
      setState(key, {
        phase: "error",
        totals,
        message:
          error instanceof Error && error.message
            ? `Stopped: ${error.message}. Sources read before this are saved.`
            : "Stopped before finishing. Sources read before this are saved.",
      });
    } finally {
      // The status lines above are server-rendered; refresh them either way.
      router.refresh();
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-ink">Data pipelines</h2>
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <CalendarClock className="size-3.5" aria-hidden="true" />
          {scheduleLabel}
        </p>
      </div>

      <ul className="grid divide-y divide-border md:grid-cols-2 md:divide-x md:divide-y-0">
        {pipelines.map((pipeline) => {
          const state = states[pipeline.key];
          const running = state.phase === "running";
          const Icon = ICONS[pipeline.key];

          return (
            <li key={pipeline.key} className="flex flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="flex items-center gap-2 font-semibold text-ink">
                    <Icon className="size-4 text-primary" aria-hidden="true" />
                    {pipeline.label}
                  </h3>
                  <p className="mt-1 text-xs text-muted">
                    {pipeline.lastFetchLabel
                      ? `Last read ${pipeline.lastFetchLabel}`
                      : "No successful read recorded yet"}
                    {" · "}
                    {pipeline.enabledSources} source{pipeline.enabledSources === 1 ? "" : "s"}
                  </p>
                  {pipeline.failingSources > 0 && (
                    <p className="mt-1 flex items-center gap-1 text-xs font-medium text-amber-700">
                      <AlertTriangle className="size-3.5" aria-hidden="true" />
                      {pipeline.failingSources} source{pipeline.failingSources === 1 ? " is" : "s are"}{" "}
                      failing
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <Link
                    href={pipeline.manageHref}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Details
                  </Link>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => run(pipeline.key)}
                    disabled={running}
                  >
                    {running ? (
                      <Loader2 className="animate-spin" aria-hidden="true" />
                    ) : (
                      <Play aria-hidden="true" />
                    )}
                    {running ? "Running…" : "Run now"}
                  </Button>
                </div>
              </div>

              {/* Announced as it changes, so a screen-reader user hears the
                  batches go by rather than a button that went quiet. */}
              <div aria-live="polite" className="min-h-5 text-xs">
                {state.phase === "running" && (
                  <p className="text-body">
                    {state.totals.batches === 0
                      ? "Starting… keep this tab open until it finishes."
                      : `Batch ${state.totals.batches} done · ${summarize(pipeline.key, state.totals)}`}
                  </p>
                )}
                {state.phase === "done" && (
                  <p className="text-body">
                    <span className="font-semibold text-ink">Done.</span>{" "}
                    {summarize(pipeline.key, state.totals)}
                  </p>
                )}
                {state.phase === "error" && (
                  <p role="alert" className="text-destructive">
                    {state.message}
                    {state.totals.sources > 0 ? ` (${summarize(pipeline.key, state.totals)})` : ""}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
