/**
 * The HTTP transport every server-side Supabase client runs on.
 *
 * Framework-agnostic on purpose — no `server-only`, no `next/*` — the same
 * contract as `lib/rate-limit-core.ts`, so the retry and deadline behaviour is
 * exercised by `npm test` in plain Node rather than asserted about.
 *
 * `@supabase/supabase-js` issues plain `fetch` calls with no timeout, and Node's
 * `fetch` will wait on a stalled connection indefinitely. That is fine when the
 * database always answers. It is not what we observe: requests to the project
 * stall at the connection level at random — most return in 200-600ms, and then
 * one sits for 30s, 90s, 300s before it resolves or dies. It is not tied to a
 * query. Measured locally, the same four homepage reads produced a 304s stall on
 * one of them, and on the next run that one was fine and a different one took
 * 119s.
 *
 * A launch is roughly eight of those calls, and it only takes one to stall for
 * the whole Server Action to spend its budget and come back as
 * FUNCTION_INVOCATION_TIMEOUT — which reaches the maker as a submit that never
 * finishes. Without a ceiling here, a launch is only ever as reliable as the
 * unluckiest of its eight round trips.
 *
 * So every call gets a deadline, and reads — idempotent, and most of the path —
 * get a second go. The stalls are uncorrelated, so a retry on a fresh connection
 * nearly always lands.
 *
 * Writes are deliberately NOT retried. A POST that stalls may well have been
 * applied already, and replaying it would risk a second row; a maker told to
 * check and try again is recoverable, a duplicate launch is not.
 */

/**
 * How long one attempt may take before it is abandoned.
 *
 * Healthy calls to this project land in 200-600ms, so this is roughly ten times
 * the real thing — slow enough never to cut off a query that was going to
 * answer, short enough that a couple of these plus a retry still leave a launch
 * inside the 60s budget /submit declares.
 */
export const ATTEMPT_TIMEOUT_MS = 6_000;

/**
 * Attempts allowed for an idempotent request, including the first.
 *
 * Two, not more. The stalls are uncorrelated, so the second attempt is where
 * essentially all of the benefit is; a third mostly buys worst-case latency, and
 * `createProduct` spends its budget on several of these in sequence.
 */
export const READ_ATTEMPTS = 2;

export type ResilientFetchOptions = {
  attemptTimeoutMs?: number;
  readAttempts?: number;
  /** Swappable so tests don't have to reach the network. */
  fetchImpl?: typeof fetch;
  /** Swappable so tests don't have to print to the console. */
  onRetry?: (message: string) => void;
};

function methodOf(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (typeof input === "object" && "method" in input) return input.method.toUpperCase();
  return "GET";
}

/** Only replay what cannot be applied twice. */
function isIdempotent(input: RequestInfo | URL, init?: RequestInit): boolean {
  const method = methodOf(input, init);
  return method === "GET" || method === "HEAD";
}

/**
 * Our deadline, combined with whatever the caller already passed.
 *
 * supabase-js exposes a per-query `abortSignal`, so dropping `init.signal` would
 * quietly disable it. `AbortSignal.any` is guarded because this module targets
 * more than one runtime and it is not universally present; without it the
 * deadline still applies, which is the part that matters here.
 */
function combineSignals(ours: AbortSignal, caller: AbortSignal | null | undefined): AbortSignal {
  if (!caller) return ours;
  return typeof AbortSignal.any === "function" ? AbortSignal.any([ours, caller]) : ours;
}

export function createResilientFetch(options: ResilientFetchOptions = {}): typeof fetch {
  const attemptTimeoutMs = options.attemptTimeoutMs ?? ATTEMPT_TIMEOUT_MS;
  const maxReadAttempts = options.readAttempts ?? READ_ATTEMPTS;
  const doFetch = options.fetchImpl ?? fetch;
  const report = options.onRetry ?? ((message: string) => console.error(message));

  return async function resilientFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const attempts = isIdempotent(input, init) ? maxReadAttempts : 1;
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), attemptTimeoutMs);

      try {
        return await doFetch(input, {
          ...init,
          signal: combineSignals(controller.signal, init?.signal),
        });
      } catch (error) {
        lastError = error;

        // The caller gave up, not us — their abort is an answer, not a failure
        // to retry around.
        if (init?.signal?.aborted) throw error;

        // Reported per attempt rather than only at the end: when this fires it
        // is the most useful line in the request, and a retry that then succeeds
        // would otherwise erase every trace of the stall.
        report(
          `[supabase] attempt ${attempt}/${attempts} to ${methodOf(input, init)} failed after ` +
            `up to ${attemptTimeoutMs}ms: ${
              error instanceof Error ? error.message : String(error)
            }`,
        );
      } finally {
        clearTimeout(timer);
      }
    }

    throw lastError;
  };
}

/** The shared instance the Supabase clients are built on. */
export const resilientFetch = createResilientFetch();
