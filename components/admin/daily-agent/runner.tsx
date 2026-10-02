"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, Loader2, Play, RotateCcw, StepForward } from "lucide-react";

import { resumeDailyBatch, runDailyAgentStep } from "@/lib/actions/daily-agent-admin";
import type { StepResult } from "@/lib/daily-agent/run";
import { cn } from "@/lib/utils";

/**
 * Run buttons for the Daily 5 agent.
 *
 * A run is many short steps (see lib/daily-agent/run.ts), and this loop is
 * what strings them together from the browser: each step is its own server
 * invocation with its own time and request budget, exactly like the ingestion
 * "Run now". Closing the tab stops the loop, not the batch — Continue picks it
 * up, and so does the next scheduled tick for today's live batch.
 */

const MAX_STEPS = 40;

type State =
  | { phase: "idle" }
  | { phase: "running"; steps: number; message: string }
  | { phase: "done"; message: string }
  | { phase: "error"; message: string };

export function DailyAgentRunner({
  activeBatchId,
  activeBatchStatus,
  activeIsDryRun,
}: {
  activeBatchId: string | null;
  activeBatchStatus: string | null;
  activeIsDryRun: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<State>({ phase: "idle" });
  const running = state.phase === "running";

  async function loop(first: () => Promise<StepResult>) {
    let steps = 0;
    setState({ phase: "running", steps, message: "Starting…" });
    try {
      let result = await first();
      for (;;) {
        steps += 1;
        if (!result.ok) {
          setState({ phase: "error", message: result.message });
          return;
        }
        setState({ phase: "running", steps, message: result.message });
        if (result.batchId) router.replace(`/admin/daily-agent?batch=${result.batchId}`, { scroll: false });
        if (!result.more || steps >= MAX_STEPS || !result.batchId) break;
        // Another caller holds the batch: wait a moment rather than spin.
        if (result.busy) await new Promise((resolve) => setTimeout(resolve, 4000));
        const batchId = result.batchId;
        result = await runDailyAgentStep({ kind: "live", batchId });
      }
      setState({ phase: "done", message: result.message });
    } catch (error) {
      setState({
        phase: "error",
        message: `Stopped: ${error instanceof Error ? error.message : "network error"}. Progress so far is saved — press Continue.`,
      });
    } finally {
      router.refresh();
    }
  }

  const canContinue =
    activeBatchId && activeBatchStatus && ["discovering", "verifying", "selecting"].includes(activeBatchStatus);

  const button =
    "inline-flex min-h-11 items-center gap-2 rounded-md px-4 text-sm font-semibold transition-colors disabled:opacity-60";

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-soft md:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={running}
          onClick={() => loop(() => runDailyAgentStep({ kind: "dry" }))}
          className={cn(button, "btn-gradient text-white")}
        >
          <FlaskConical className="size-4" aria-hidden="true" />
          Run dry run
        </button>
        <button
          type="button"
          disabled={running}
          onClick={() => loop(() => runDailyAgentStep({ kind: "live" }))}
          className={cn(button, "border border-border bg-card text-ink hover:border-primary/30 hover:bg-secondary-bg")}
        >
          <Play className="size-4" aria-hidden="true" />
          Run today&apos;s batch now
        </button>
        {canContinue && (
          <button
            type="button"
            disabled={running}
            onClick={() => loop(() => runDailyAgentStep({ kind: activeIsDryRun ? "dry" : "live", batchId: activeBatchId }))}
            className={cn(button, "border border-border bg-card text-ink hover:border-primary/30 hover:bg-secondary-bg")}
          >
            <StepForward className="size-4" aria-hidden="true" />
            Continue this batch
          </button>
        )}
        {activeBatchId && activeBatchStatus === "failed" && (
          <button
            type="button"
            disabled={running}
            onClick={async () => {
              const result = await resumeDailyBatch(activeBatchId);
              if (!result.ok) {
                setState({ phase: "error", message: result.error });
                return;
              }
              await loop(() => runDailyAgentStep({ kind: activeIsDryRun ? "dry" : "live", batchId: activeBatchId }));
            }}
            className={cn(button, "border border-border bg-card text-ink hover:border-primary/30 hover:bg-secondary-bg")}
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            Resume failed batch
          </button>
        )}
      </div>
      <p className="mt-3 text-xs text-muted">
        A dry run discovers, verifies, scores and drafts — and publishes nothing. Today&apos;s batch is created once per day;
        running it again continues the same batch instead of creating duplicates.
      </p>
      {state.phase !== "idle" && (
        <p
          role="status"
          className={cn(
            "mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-sm",
            state.phase === "error" ? "bg-red-50 text-error" : "bg-secondary-bg text-body",
          )}
        >
          {running && <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" aria-hidden="true" />}
          <span>
            {state.phase === "running" ? `Step ${state.steps}: ` : ""}
            {state.message}
          </span>
        </p>
      )}
    </section>
  );
}
