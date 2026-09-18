/**
 * The rules for a "sweep": reading every ingestion source once, in batches.
 *
 * One invocation cannot read every source. AI news takes at most eight a run
 * and funding stops at the Workers per-invocation subrequest ceiling, so with
 * ~26 AI sources a single call covers a third of them. That was invisible while
 * a scheduler came round every ten minutes; with one run a day it would leave
 * most sources unread for days. So both the daily schedule and the admin's
 * "Run now" button work in batches, each its own invocation with its own
 * budget, until a batch finds nothing left to read.
 *
 * "Left to read" is defined by time, not by a list: a sweep that started at T
 * reads every enabled source whose `last_attempt_at` is before T. Each batch
 * stamps the sources it touches with a time after T, so they drop out, and the
 * sweep ends when a batch attempts nothing. No state is kept between batches
 * except T itself, which the server issues and the client hands back.
 *
 * Framework-agnostic (no `next/*`, no Supabase) so `tests/` can cover it.
 */

/**
 * One batch of a sweep, as the admin's "Run now" button sees it.
 *
 * The counts are this batch's alone; the client adds them up. `sweepStartedAt`
 * is what to send back for the next batch.
 */
export type SweepBatchResult =
  | {
      ok: true;
      sweepStartedAt: string;
      sourcesAttempted: number;
      sourcesFailed: number;
      fetched: number;
      /** New stories (AI) or new funding rounds. */
      created: number;
      /** Existing stories grown by a new article (AI), or duplicates (funding). */
      updated: number;
      rejected: number;
    }
  | { ok: false; error: string };

/** The refusal for a start time `resolveSweepStart` rejected. */
export const STALE_SWEEP_ERROR = "That run went on too long to continue. Press Run now to start again.";

/**
 * AI sources per batch of an admin sweep. Smaller than a scheduled run's eight
 * so each step of the button's progress arrives within a minute or so.
 */
export const SWEEP_AI_SOURCES_PER_BATCH = 5;

/**
 * A backstop. A sweep normally ends because a batch attempts nothing.
 *
 * Ten batches of five is fifty AI sources, comfortably above the ~26
 * configured; raise it with the source count, or a sweep will stop short.
 */
export const MAX_SWEEP_BATCHES = 10;

/**
 * How old a sweep's start time may be when a client hands it back.
 *
 * Long enough for a full sweep — ten batches, and a batch can run a couple of
 * minutes because a source already under way is allowed to finish — and short
 * enough that a stale value from a tab left open overnight cannot be replayed
 * to mean "everything read since yesterday".
 */
export const SWEEP_MAX_AGE_MS = 30 * 60_000;

/** Clock skew tolerated between the server that issued a start and the one reading it. */
const FUTURE_TOLERANCE_MS = 5_000;

/**
 * The start time for this batch.
 *
 * No value starts a new sweep, now. A value must be one this server could have
 * issued recently: parseable, not in the future, not older than
 * `SWEEP_MAX_AGE_MS`. Anything else is refused rather than clamped — it can
 * only come from a tampered or very stale client, and guessing what it meant
 * would be worse than asking it to start again.
 */
export function resolveSweepStart(value: string | undefined | null, now: Date = new Date()): Date | null {
  if (value === undefined || value === null || value === "") return now;

  const parsed = new Date(value);
  const time = parsed.getTime();
  if (Number.isNaN(time)) return null;
  if (time > now.getTime() + FUTURE_TOLERANCE_MS) return null;
  if (now.getTime() - time > SWEEP_MAX_AGE_MS) return null;
  return parsed;
}

/** Whether a source still needs reading in the sweep that began at `sweepStart`. */
export function isUnreadInSweep(lastAttemptAt: string | null | undefined, sweepStart: Date): boolean {
  if (!lastAttemptAt) return true;
  const last = new Date(lastAttemptAt).getTime();
  // An unparseable timestamp is treated as "never read": the safe side of a
  // sweep is one extra fetch, not a source silently skipped.
  if (Number.isNaN(last)) return true;
  return last < sweepStart.getTime();
}

/**
 * Whether to ask for another batch.
 *
 * `batch` is the number of batches already run. A batch that attempted nothing
 * is the normal end; the cap only matters if a source somehow never gets
 * stamped (a crash between fetch and bookkeeping), which would otherwise loop.
 */
export function shouldRunAnotherBatch(batch: number, sourcesAttempted: number): boolean {
  return sourcesAttempted > 0 && batch < MAX_SWEEP_BATCHES;
}

/**
 * When the automatic run happens, for the admin dashboard.
 *
 * Must match the cron in .github/workflows/ingest.yml (`17 2 * * *`, UTC).
 * 02:17 UTC is 07:47 IST: fresh data for an Indian morning, and off the top of
 * the hour, which is when GitHub's scheduler is busiest and most often late.
 */
export const DAILY_RUN_LABEL = "Runs automatically once a day at about 7:47 AM IST";
