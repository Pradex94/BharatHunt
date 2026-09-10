/**
 * The cron that keeps /funding and /ai moving.
 *
 * Why this is a second Worker
 * ---------------------------
 * The app is deployed through OpenNext, whose Worker exports a `fetch` handler
 * and nothing else. A Cloudflare Cron Trigger invokes `scheduled`, which that
 * Worker does not have — so a cron cannot drive the app directly, no matter how
 * it is configured. This tiny Worker has the `scheduled` handler and calls the
 * app's ingestion routes.
 *
 * Why a service binding rather than fetching bharathunt.org
 * ---------------------------------------------------------
 * `env.APP` is a direct binding to the `bharathunt` Worker. The request never
 * leaves Cloudflare: no DNS, no TLS handshake, no trip through the zone's own
 * routes (which is the case a Worker calling its own hostname gets wrong), and
 * it does not spend an *external* subrequest — the resource the app's ingestion
 * is already short of on the Free plan.
 *
 * The secrets are still sent
 * --------------------------
 * A service binding proves which Worker is calling, but the app's routes
 * authenticate on a shared secret and nothing else, and they must keep doing so
 * — they are reachable from the internet too. So this sends the same
 * `Authorization: Bearer …` any external scheduler would. If a secret is not
 * configured here, the call is skipped rather than sent unauthenticated: the
 * endpoint would answer 401, and a scheduler that quietly generates failures is
 * worse than one that says it has nothing to do.
 *
 * Running often is safe. Ingestion is idempotent by database constraint, every
 * source has its own `poll_interval_minutes` and is skipped until due, and each
 * invocation stops inside the Workers subrequest ceiling — so a run that cannot
 * finish the backlog simply leaves it for the next one.
 */

const TARGETS = [
  { name: "funding", path: "/api/funding/ingest", secret: "FUNDING_INGEST_SECRET" },
  { name: "ai-news", path: "/api/ai-news/ingest", secret: "AI_NEWS_INGEST_SECRET" },
];

async function runOne(env, target) {
  const secret = env[target.secret];
  if (!secret) {
    return { target: target.name, skipped: "no secret configured" };
  }

  try {
    const response = await env.APP.fetch(
      new Request(`https://bharathunt.org${target.path}`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${secret}`,
          "user-agent": "BharatHuntScheduler/1.0",
        },
      }),
    );

    // The body is a counts summary, never article content, so it is safe to log
    // and it is the only record of a cron run that nobody watched.
    const body = await response.text();
    return { target: target.name, status: response.status, body: body.slice(0, 500) };
  } catch (error) {
    return {
      target: target.name,
      error: error instanceof Error ? error.message : "unknown error",
    };
  }
}

export default {
  async scheduled(event, env, ctx) {
    /*
     * Sequential on purpose. Both runs talk to the same database and each is
     * already bounded by its own wall-clock and subrequest budgets; overlapping
     * them would put two ingestion passes in flight against one Postgres for no
     * gain in throughput.
     */
    const work = (async () => {
      const results = [];
      for (const target of TARGETS) {
        results.push(await runOne(env, target));
      }
      console.log(
        JSON.stringify({ event: "ingest_cron", cron: event.cron, at: new Date().toISOString(), results }),
      );
    })();

    // Keeps the invocation alive until both calls finish, rather than being
    // cut off when `scheduled` returns.
    ctx.waitUntil(work);
    await work;
  },
};
