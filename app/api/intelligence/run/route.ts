import type { NextRequest } from "next/server";

import { authorizeIngest } from "@/lib/funding/ingest-auth";
import { reindexProductIntelligence } from "@/lib/intelligence/reindex";
import { refreshDiscoverySignals } from "@/lib/intelligence/trending";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

/**
 * The Product Intelligence indexer, for the scheduler
 * (.github/workflows/intelligence.yml).
 *
 * Same gate as the Daily 5 and ingestion routes: a shared secret (Bearer or
 * X-Ingest-Secret) compared in constant time by `authorizeIngest`, behind a
 * per-IP limit. `INTELLIGENCE_JOB_SECRET` if set, otherwise the existing
 * `DAILY_AGENT_JOB_SECRET` — one less secret to provision for a job that runs
 * on the same schedule. **Unset means closed** (503).
 *
 * `?force=1` rebuilds even when no listing changed (after a lexicon change, a
 * KNOWLEDGE_VERSION bump does the same thing automatically).
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export async function POST(request: NextRequest): Promise<Response> {
  const secret = process.env.INTELLIGENCE_JOB_SECRET || process.env.DAILY_AGENT_JOB_SECRET;
  if (!secret?.trim()) {
    console.error("[INTELLIGENCE] No job secret is set — refusing to run.");
    return json({ error: "The indexer is not configured." }, 503);
  }

  const limit = await checkRateLimit("intelligenceRun", `ip:${await clientIp()}`);
  if (!limit.ok) return json({ error: limit.message }, 429);

  const decision = authorizeIngest(request.headers, secret);
  if (!decision.ok) {
    console.warn(JSON.stringify({ event: "intelligence_unauthorized", at: new Date().toISOString() }));
    return json({ error: decision.status === 503 ? "The indexer is not configured." : "Unauthorized" }, decision.status);
  }

  try {
    const result = await reindexProductIntelligence({
      force: request.nextUrl.searchParams.get("force") === "1",
    });
    // Independent of the index: trending moves every hour even when no
    // listing changed, so this runs whether or not the reindex skipped.
    const signals = await refreshDiscoverySignals();
    console.log(JSON.stringify({ event: "intelligence_reindex", ...result, signals, at: new Date().toISOString() }));
    return json({ ...result, signals }, result.ok && signals.ok ? 200 : 500);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "intelligence_reindex_failed",
        message: error instanceof Error ? error.message.slice(0, 300) : "unknown",
        at: new Date().toISOString(),
      }),
    );
    return json({ error: "The indexer failed." }, 500);
  }
}
