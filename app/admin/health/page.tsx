/* Admin-only Platform Health — the operational dashboard.
 *
 * Every background system on one page: is it on schedule, when did it last
 * succeed, what failed and why, and what is waiting. Each card links to the
 * screen that manages that system. Read from the tables the systems already
 * write (services/platform-health.ts); thresholds in lib/platform-health.ts.
 * Error text is shown here because only admins reach this page.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import { Container } from "@/components/ui/container";
import { Numeric } from "@/components/ui/typography";
import { getIsAdmin } from "@/lib/admin";
import { formatIstDateTime, relativeTime } from "@/lib/funding/format";
import { cn } from "@/lib/utils";
import { assessJob, JOB_SCHEDULES, nextCronRun, worstHealth, type Health, type JobAssessment } from "@/lib/platform-health";
import { getPlatformHealth } from "@/services/platform-health";

export const metadata = {
  title: "Platform health",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const TONE: Record<Health, { dot: string; label: string }> = {
  ok: { dot: "bg-success", label: "Healthy" },
  warn: { dot: "bg-warning", label: "Attention" },
  fail: { dot: "bg-error", label: "Failing" },
  unknown: { dot: "bg-muted-soft", label: "No data" },
};

function Status({ health }: { health: Health }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink">
      <span aria-hidden="true" className={cn("size-2.5 rounded-full", TONE[health].dot)} />
      {TONE[health].label}
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 text-right break-words text-ink">{children}</dd>
    </div>
  );
}

function SystemCard({
  title,
  href,
  assessment,
  error,
  children,
}: {
  title: string;
  href?: string;
  assessment: JobAssessment;
  error?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-sans text-base font-semibold tracking-normal text-ink">{title}</h2>
          <p className="text-xs text-muted">{assessment.reason}</p>
        </div>
        <Status health={assessment.health} />
      </div>
      {children && <dl className="flex flex-col gap-1.5">{children}</dl>}
      {error && (
        <p className="rounded-lg bg-error/10 px-3 py-2 font-mono text-xs break-words text-error">{error}</p>
      )}
      {href && (
        <Link href={href} className="mt-auto text-sm font-semibold text-primary hover:text-primary-active">
          Open &rarr;
        </Link>
      )}
    </section>
  );
}

const when = (value: string | null, now: Date) => (value ? `${relativeTime(value, now)}` : "Never");
const failed = (message: string): JobAssessment => ({ health: "fail", reason: `Status unavailable: ${message}` });

export default async function PlatformHealthPage() {
  const { userId } = await auth();
  if (!userId) redirect("/login");
  if (!(await getIsAdmin())) redirect("/");

  const health = await getPlatformHealth();
  const now = new Date(health.checkedAt);
  const next = (cron: string) => formatIstDateTime(nextCronRun(cron, now));

  const ai = health.ai.ok
    ? assessJob({
        lastSuccessAt: health.ai.data.lastSuccessAt,
        lastFailureAt: health.ai.data.lastFailureAt,
        expectedHours: JOB_SCHEDULES.ingest.expectedHours,
        failingSources: health.ai.data.failingSources,
        now,
      })
    : failed(health.ai.error);
  const funding = health.funding.ok
    ? assessJob({
        lastSuccessAt: health.funding.data.lastSuccessAt,
        lastFailureAt: health.funding.data.lastFailureAt,
        expectedHours: JOB_SCHEDULES.ingest.expectedHours,
        failingSources: health.funding.data.failingSources,
        now,
      })
    : failed(health.funding.error);
  const daily5 = health.daily5.ok
    ? assessJob({
        lastSuccessAt: health.daily5.data.lastCompletedAt,
        lastFailureAt: health.daily5.data.lastFailureAt,
        expectedHours: JOB_SCHEDULES.daily5.expectedHours,
        now,
      })
    : failed(health.daily5.error);
  const index: JobAssessment = health.index.ok
    ? (() => {
        const job = assessJob({
          lastSuccessAt: health.index.data.lastSignalsAt ?? health.index.data.lastIndexedAt,
          expectedHours: JOB_SCHEDULES.intelligence.expectedHours,
          now,
        });
        const unindexed = health.index.data.published - health.index.data.indexed;
        if (job.health === "ok" && (health.index.data.stale > 0 || unindexed > 0)) {
          return { health: "warn", reason: `${health.index.data.stale} products waiting to be re-indexed` };
        }
        return job;
      })()
    : failed(health.index.error);
  const searchHealth: JobAssessment = health.search.ok
    ? { health: "ok", reason: "Recording searches" }
    : failed(health.search.error);
  const cacheHealth: JobAssessment = health.cache.enabled
    ? { health: "ok", reason: "Upstash Redis connected" }
    : { health: "warn", reason: "Off — reads go straight to the database" };
  const mediaHealth: JobAssessment = health.config.cloudinary
    ? { health: "ok", reason: "Upload preset configured" }
    : { health: "fail", reason: "Cloud name or upload preset missing — uploads will fail" };

  const overall = worstHealth([ai, funding, daily5, index, searchHealth, cacheHealth, mediaHealth].map((a) => a.health));
  const cacheTotal = health.cache.hits + health.cache.misses;

  return (
    <Container className="flex flex-col gap-8 py-10">
      <div className="flex flex-col gap-2">
        <Link href="/admin" className="text-sm text-primary hover:underline">
          &larr; Admin
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl">Platform health</h1>
          <Status health={overall} />
        </div>
        <p className="max-w-3xl text-sm text-body">
          Every background system, from the records it already keeps. Checked {formatIstDateTime(now)}. A job is
          late at 1.5× its interval and failing at 3×, or as soon as its latest run fails.
        </p>
      </div>

      {health.catalogue.ok ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {[
            { label: "Published products", value: health.catalogue.data.published },
            { label: "Awaiting review", value: health.catalogue.data.pending },
            { label: "Founder profiles", value: health.catalogue.data.makers },
            { label: "Daily 5 products", value: health.catalogue.data.curated },
            { label: "Public collections", value: health.catalogue.data.publicLists },
          ].map((stat) => (
            <div key={stat.label} className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4">
              <span className="text-xs font-medium text-muted">{stat.label}</span>
              <Numeric className="text-2xl font-bold text-ink">{stat.value}</Numeric>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-lg bg-error/10 px-4 py-3 text-sm text-error">Catalogue counts unavailable: {health.catalogue.error}</p>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <SystemCard
          title="AI news ingestion"
          href="/admin/ai-news"
          assessment={ai}
          error={health.ai.ok && ai.health === "fail" ? health.ai.data.lastFailureError : null}
        >
          {health.ai.ok && (
            <>
              <Row label="Last successful run">{when(health.ai.data.lastSuccessAt, now)}</Row>
              <Row label="Last failed run">{when(health.ai.data.lastFailureAt, now)}</Row>
              <Row label="Sources">
                {health.ai.data.enabledSources} enabled · {health.ai.data.failingSources} failing
              </Row>
              {health.ai.data.lastRun && (
                <Row label="Latest run">
                  {health.ai.data.lastRun.fetched} fetched · {health.ai.data.lastRun.rejected} rejected ·{" "}
                  {health.ai.data.lastRun.storiesCreated} published
                </Row>
              )}
              <Row label="Next scheduled">{next(JOB_SCHEDULES.ingest.cron)}</Row>
            </>
          )}
        </SystemCard>

        <SystemCard
          title="Funding ingestion"
          href="/admin/funding"
          assessment={funding}
          error={health.funding.ok && funding.health === "fail" ? health.funding.data.lastFailureError : null}
        >
          {health.funding.ok && (
            <>
              <Row label="Last successful run">{when(health.funding.data.lastSuccessAt, now)}</Row>
              <Row label="Last failed run">{when(health.funding.data.lastFailureAt, now)}</Row>
              <Row label="Sources">
                {health.funding.data.enabledSources} enabled · {health.funding.data.failingSources} failing
              </Row>
              <Row label="Rounds">
                {health.funding.data.publishedRounds} published · {health.funding.data.pendingReview} awaiting review
              </Row>
              <Row label="Next scheduled">{next(JOB_SCHEDULES.ingest.cron)}</Row>
            </>
          )}
        </SystemCard>

        <SystemCard
          title="Daily 5 agent"
          href="/admin/daily-agent"
          assessment={daily5}
          error={health.daily5.ok && daily5.health === "fail" ? health.daily5.data.lastFailureError : null}
        >
          {health.daily5.ok && (
            <>
              <Row label="Last completed batch">{when(health.daily5.data.lastCompletedAt, now)}</Row>
              <Row label="Last failed batch">{when(health.daily5.data.lastFailureAt, now)}</Row>
              {health.daily5.data.latest && (
                <Row label={`Batch ${health.daily5.data.latest.date}`}>
                  {health.daily5.data.latest.status} · {health.daily5.data.latest.published} published ·{" "}
                  {health.daily5.data.latest.needsReview} need review
                </Row>
              )}
              <Row label="Candidates awaiting a decision">{health.daily5.data.pendingCandidates}</Row>
              <Row label="Scheduler">{JOB_SCHEDULES.daily5.label}</Row>
            </>
          )}
        </SystemCard>

        <SystemCard title="Product indexing & trending" href="/admin/intelligence" assessment={index}>
          {health.index.ok && (
            <>
              <Row label="Indexed">
                {health.index.data.indexed} of {health.index.data.published}
              </Row>
              <Row label="Waiting to re-index">{health.index.data.stale}</Row>
              <Row label="Last indexed">{when(health.index.data.lastIndexedAt, now)}</Row>
              <Row label="Trending refreshed">{when(health.index.data.lastSignalsAt, now)}</Row>
              <Row label="Next scheduled">{next(JOB_SCHEDULES.intelligence.cron)}</Row>
              <Row label="Embeddings">Not used — concept lexicon + TF-IDF</Row>
            </>
          )}
        </SystemCard>

        <SystemCard title="Search & Product Match" href="/admin/intelligence" assessment={searchHealth}>
          {health.search.ok && (
            <>
              <Row label="Marketplace searches, 24h">{health.search.data.searches24h}</Row>
              <Row label="Product Match requests, 24h">{health.search.data.matches24h}</Row>
              <Row label="Zero-result, 24h">{health.search.data.zeroResult24h}</Row>
            </>
          )}
        </SystemCard>

        <SystemCard title="Cache" assessment={cacheHealth}>
          <Row label="Hit rate (sampled 1 in 20)">
            {health.cache.enabled && cacheTotal > 0 ? `${Math.round((health.cache.hits / cacheTotal) * 1000) / 10}%` : "—"}
          </Row>
        </SystemCard>

        <SystemCard title="Media (Cloudinary)" assessment={mediaHealth} />

        <SystemCard
          title="AI usage"
          assessment={{ health: "ok", reason: health.config.llmKey ? "Model key present — optional upgrades may call it" : "No model key — every pipeline is rule-based by design" }}
        >
          <Row label="Product pages, search, Product Match">No model calls</Row>
        </SystemCard>

        <SystemCard
          title="Scheduled jobs secret"
          assessment={
            health.config.jobSecret
              ? { health: "ok", reason: "DAILY_AGENT_JOB_SECRET set on this deployment" }
              : { health: "fail", reason: "DAILY_AGENT_JOB_SECRET missing — scheduled calls will be refused" }
          }
        />
      </div>
    </Container>
  );
}
