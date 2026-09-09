import type { NextRequest } from "next/server";

import { runIngestion } from "@/lib/funding/ingest";
import { authorizeIngest } from "@/lib/funding/ingest-auth";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

/**
 * The scheduled ingestion trigger.
 *
 * This is the one route in the application that writes funding data without a
 * signed-in user behind it, so the whole file is about who is allowed to call
 * it.
 *
 * The gate
 * --------
 * A shared secret in `FUNDING_INGEST_SECRET`, presented as
 * `Authorization: Bearer <secret>` or `X-Ingest-Secret: <secret>`, compared in
 * constant time. That decision lives in `lib/funding/ingest-auth.ts` — pure, no
 * Next or network imports, so its rejection paths are unit-tested rather than
 * taken on trust. **Unset means closed:** with no secret configured the route
 * answers 503 and ingests nothing.
 *
 * In front of the comparison sits a per-IP limit (`fundingIngest`), which is
 * what makes guessing impractical rather than merely slow, and in front of
 * *that* sits the global per-IP limiter in proxy.ts.
 *
 * Both GET and POST, because scheduler products disagree about which to use:
 * Vercel Cron issues GET, Cloudflare's scheduled handler and most external
 * cron services POST. Both are the same operation, and it is idempotent by
 * construction (see lib/funding/ingest.ts), so answering both costs nothing.
 *
 * The response is a summary, never article content, and it is `no-store`: a
 * cached ingestion result would be a cron job that silently stops running.
 */

// Reads a header and writes to the database on every call. Never prerender,
// never cache.
export const dynamic = "force-dynamic";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

async function handle(request: NextRequest): Promise<Response> {
  const secret = process.env.FUNDING_INGEST_SECRET;

  // Configured at all? Answered before the rate limiter, because a
  // misconfigured deployment should say so on every call rather than start
  // rate-limiting a caller for the deployment's own mistake.
  if (!secret?.trim()) {
    console.error("[funding] FUNDING_INGEST_SECRET is not set — refusing to ingest.");
    return json({ error: "Ingestion is not configured." }, 503);
  }

  // Ahead of the comparison, so a guessing run is bounded whether or not it
  // guesses correctly.
  const ip = await clientIp();
  const limit = await checkRateLimit("fundingIngest", `ip:${ip}`);
  if (!limit.ok) {
    return new Response(JSON.stringify({ error: limit.message }), {
      status: 429,
      headers: {
        "content-type": "application/json",
        "retry-after": String(limit.retryAfter),
        "cache-control": "no-store",
      },
    });
  }

  const decision = authorizeIngest(request.headers, secret);
  if (!decision.ok) {
    // No hint about which part was wrong, and no echo of what was presented.
    console.warn(
      JSON.stringify({
        event: "funding_ingest_unauthorized",
        at: new Date().toISOString(),
      }),
    );
    return json({ error: decision.error }, decision.status);
  }

  /*
   * `?source=<uuid>` runs one source, ignoring whether it is due. Only reachable
   * with the secret already verified, and it is what makes "re-run just the
   * feed that failed" possible without waiting out its backoff.
   */
  const sourceId = request.nextUrl.searchParams.get("source")?.trim() || undefined;

  try {
    const result = await runIngestion({ trigger: "cron", sourceId, force: Boolean(sourceId) });
    return json(result, 200);
  } catch (error) {
    // `runIngestion` handles per-source failure itself, so reaching here means
    // something structural — the sources table is unreadable, most likely.
    console.error(
      JSON.stringify({
        event: "funding_ingest_failed",
        message: error instanceof Error ? error.message : "unknown",
        at: new Date().toISOString(),
      }),
    );
    return json({ error: "Ingestion failed." }, 500);
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  return handle(request);
}

export async function POST(request: NextRequest): Promise<Response> {
  return handle(request);
}
