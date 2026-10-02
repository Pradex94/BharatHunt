import type { NextRequest } from "next/server";

import { DAILY5_AGENT } from "@/lib/daily-agent/config";
import { advanceBatch, advanceLive, scheduledTick } from "@/lib/daily-agent/run";
import { authorizeIngest } from "@/lib/funding/ingest-auth";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

/**
 * The Daily 5 agent's step endpoint, for the scheduler.
 *
 * Same gate as the ingestion routes: a shared secret in
 * `DAILY_AGENT_JOB_SECRET` (Bearer or X-Ingest-Secret), compared in constant
 * time by the tested `authorizeIngest`, behind a per-IP limit. **Unset means
 * closed** (503).
 *
 * Each call advances one bounded step and answers `{ more }`; the workflow
 * calls again while `more` is true. Modes:
 *   - default (`?mode=tick`): the hourly tick — does nothing before the
 *     configured local run time or while the agent is off, then creates or
 *     resumes today's batch. Idempotent: today's batch is unique.
 *   - `?mode=continue&batch=<id>`: carry on a batch the previous call started.
 *
 * Dry runs start from the admin dashboard only; nothing here can publish
 * except through the agent's own auto-publish gate.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

async function handle(request: NextRequest): Promise<Response> {
  const secret = process.env.DAILY_AGENT_JOB_SECRET;
  if (!secret?.trim()) {
    console.error("[BHARATHUNT-DAILY5] DAILY_AGENT_JOB_SECRET is not set — refusing to run.");
    return json({ error: "The Daily 5 agent is not configured." }, 503);
  }

  const limit = await checkRateLimit("dailyAgentRun", `ip:${await clientIp()}`);
  if (!limit.ok) return json({ error: limit.message }, 429);

  const decision = authorizeIngest(request.headers, secret);
  if (!decision.ok) {
    console.warn(JSON.stringify({ event: "daily_agent_unauthorized", at: new Date().toISOString() }));
    return json({ error: decision.status === 503 ? "The Daily 5 agent is not configured." : "Unauthorized" }, decision.status);
  }

  const params = request.nextUrl.searchParams;
  const agent = params.get("agent")?.trim() || DAILY5_AGENT;
  if (!/^[a-z0-9][a-z0-9_]{1,39}$/.test(agent)) return json({ error: "Unknown agent." }, 400);
  const mode = params.get("mode") ?? "tick";
  const batch = params.get("batch")?.trim();

  try {
    if (mode === "continue" && batch && /^[0-9a-f-]{36}$/i.test(batch)) {
      return json(await advanceBatch(batch), 200);
    }
    if (mode === "now") return json(await advanceLive(agent, "manual"), 200);
    return json(await scheduledTick(agent), 200);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "daily_agent_failed",
        message: error instanceof Error ? error.message.slice(0, 300) : "unknown",
        at: new Date().toISOString(),
      }),
    );
    return json({ error: "The agent step failed." }, 500);
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  return handle(request);
}

export async function POST(request: NextRequest): Promise<Response> {
  return handle(request);
}
