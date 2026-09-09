import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

import { anonymizeIp, checkRateLimitByIp, clientIpFrom } from "@/lib/rate-limit";
import { runIngestion } from "@/lib/ai-news/ingest";

/**
 * The scheduled entry point for AI news ingestion (section 24).
 *
 * Everything the pipeline does lives in `lib/ai-news/ingest.ts`; this file is
 * only the gate in front of it, and the gate is the interesting part.
 *
 * Why a shared secret and not "it's an obscure URL"
 * ------------------------------------------------
 * Running ingestion is not free: it makes outbound requests to two dozen
 * publishers under our own name and writes to the database. An unauthenticated
 * endpoint that does that is an amplification primitive — anyone could point it
 * at itself in a loop and have Bharat Hunt hammer every publisher on the list,
 * which is exactly the behaviour that gets a bot blocked and the domain
 * blacklisted. So it takes `AI_NEWS_INGEST_SECRET`.
 *
 * **Unset means closed, never open.** With no secret configured this answers
 * 503 and ingests nothing. A deployment that forgot to set the variable must
 * fail loudly rather than quietly expose the endpoint to the world — the same
 * fail-closed rule `DODO_PAYMENTS_ENVIRONMENT` follows in .env.example.
 *
 * The admin button does *not* come through here. `runAiNewsIngestion` in
 * lib/actions/ai-news.ts authenticates the signed-in admin instead, so an
 * operator can run the pipeline before any cron is configured.
 *
 * GET and POST both work. Vercel Cron issues a GET; most other schedulers and a
 * hand-run `curl` prefer POST. The work is identical and is idempotent either
 * way, so there is nothing to gain by insisting on one.
 */

// Reads a secret from the request and writes to the database — never cached,
// never prerendered.
export const dynamic = "force-dynamic";

/**
 * A run walks up to eight sources plus a rescore pass, and `RUN_BUDGET_MS` in
 * the ingestion is 45s. This is the platform ceiling that budget sits under.
 */
export const maxDuration = 60;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/**
 * Constant-time comparison of the presented secret with the configured one.
 *
 * `===` on strings short-circuits at the first differing byte, which leaks the
 * length of the correct prefix to anyone who can measure response times — and
 * this endpoint is rate-limited, not unreachable, so an attacker gets fifteen
 * measurements an hour indefinitely. `timingSafeEqual` throws rather than
 * returning false on a length mismatch, so the lengths are checked first.
 */
function secretMatches(presented: string, configured: string): boolean {
  const left = Buffer.from(presented, "utf8");
  const right = Buffer.from(configured, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** The secret from either header form, or null. */
function presentedSecret(request: NextRequest): string | null {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) return authorization.slice(7).trim();
  return request.headers.get("x-ingest-secret")?.trim() || null;
}

async function handle(request: NextRequest): Promise<Response> {
  /*
   * The limiter runs before the secret check, and it is keyed on the IP rather
   * than on the presented secret. Keying on the secret would hand an attacker a
   * fresh budget for every guess, which is the opposite of the point.
   */
  const limit = await checkRateLimitByIp("aiNewsIngest");
  if (!limit.ok) {
    return json({ error: "Too many ingestion requests." }, 429);
  }

  const configured = process.env.AI_NEWS_INGEST_SECRET?.trim();
  if (!configured) {
    return json(
      {
        error:
          "AI news ingestion is not configured. Set AI_NEWS_INGEST_SECRET to enable the scheduled endpoint.",
      },
      503,
    );
  }

  const presented = presentedSecret(request);
  if (!presented || !secretMatches(presented, configured)) {
    // Logged with a truncated IP only — enough to correlate an attempt, not
    // enough to identify a person, and never the value that was presented.
    console.warn(
      JSON.stringify({
        event: "ai_news_ingest_denied",
        ip: anonymizeIp(clientIpFrom((name) => request.headers.get(name))),
        at: new Date().toISOString(),
      }),
    );
    return json({ error: "Unauthorized." }, 401);
  }

  const summary = await runIngestion({ trigger: "cron" });

  /*
   * 200 even for a partial run, and even for a failed one.
   *
   * The status code here is the scheduler's signal, and the scheduler's
   * question is "did the job execute", not "was every publisher reachable". A
   * feed returning 500 is normal weather; answering 500 back would make a cron
   * dashboard red every time one of two dozen sources had a bad afternoon, and
   * a dashboard that is always red is a dashboard nobody looks at. What
   * happened is in the body, and it is also in `ai_ingestion_runs` and on the
   * admin screen.
   */
  return json(summary, 200);
}

export async function POST(request: NextRequest): Promise<Response> {
  return handle(request);
}

export async function GET(request: NextRequest): Promise<Response> {
  return handle(request);
}
