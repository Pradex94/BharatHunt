import type { NextRequest } from "next/server";

import { authorizeIngest } from "@/lib/funding/ingest-auth";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { LaunchAgentNotConfiguredError, processQueuedCampaigns } from "@/services/launch-agent";

/**
 * Drains queued Launch Agent campaigns — the background half of "approving a
 * product returns immediately".
 *
 * Same gate as the ingestion routes (app/api/funding/ingest/route.ts): a shared
 * secret in `LAUNCH_AGENT_JOB_SECRET`, compared in constant time by the tested
 * `authorizeIngest`, behind a per-IP limit. Unset means closed (503). Driven by
 * the existing GitHub Actions schedule (.github/workflows/ingest.yml); a maker
 * opening Launch Agent analyses their campaign on the spot anyway, so a missed
 * run only delays nothing anyone is waiting on.
 */

export const dynamic = "force-dynamic";

function json(body: unknown, status: number, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...extra },
  });
}

async function handle(request: NextRequest): Promise<Response> {
  const secret = process.env.LAUNCH_AGENT_JOB_SECRET;
  if (!secret?.trim()) return json({ error: "Launch Agent jobs are not configured." }, 503);

  const limit = await checkRateLimit("launchAgentJobs", `ip:${await clientIp()}`);
  if (!limit.ok) return json({ error: limit.message }, 429, { "retry-after": String(limit.retryAfter) });

  const decision = authorizeIngest(request.headers, secret);
  if (!decision.ok) {
    console.warn(JSON.stringify({ event: "launch_agent_jobs_unauthorized", at: new Date().toISOString() }));
    return json({ error: decision.status === 503 ? "Launch Agent jobs are not configured." : "Unauthorized" }, decision.status);
  }

  try {
    return json(await processQueuedCampaigns(10), 200);
  } catch (error) {
    if (error instanceof LaunchAgentNotConfiguredError) return json({ error: error.message }, 503);
    console.error(JSON.stringify({ event: "launch_agent_jobs_failed", message: error instanceof Error ? error.message : "unknown", at: new Date().toISOString() }));
    return json({ error: "Launch Agent jobs failed." }, 500);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  return handle(request);
}
