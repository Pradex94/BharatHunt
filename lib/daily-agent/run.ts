import "server-only";

import { ADMIN_EMAILS, PRODUCT_CATEGORIES } from "@/lib/constants";
import { sendEmail } from "@/lib/email";
import { buildDailyAgentReportEmail } from "@/lib/emails/daily-agent-report";
import { createSubrequestBudget, subrequestLimitFromEnv } from "@/lib/funding/subrequest-budget";
import {
  claimBatch,
  createDryRunBatch,
  domainHistory,
  findOrCreateLiveBatch,
  getAgentConfig,
  getBatch,
  getCandidates,
  getExistingProducts,
  insertCandidates,
  recentArticles,
  recentFundingRounds,
  recountBatch,
  releaseBatch,
  updateAgentConfig,
  updateBatch,
  updateCandidate,
  type BatchRow,
  type CandidateInsert,
  type CandidateRow,
} from "@/services/daily-agent";
import type { Json } from "@/types/database";

import { isAiContentEnabled, refineContent } from "./ai";
import { autoPublishActive, isRunDue, LOG_PREFIX, localClock, type AgentConfig } from "./config";
import { buildContent } from "./content";
import { buildProductIndex, checkDuplicate, isNotAProductSite, normalizeSite, type ProductIndex } from "./domain";
import { evaluateCandidate } from "./evaluate";
import { extractSite, looksParked, secondaryPageLinks, type FetchedPage } from "./extract";
import { createFetcher, type Fetcher } from "./fetcher";
import { domainGuesses, siteMatchesName } from "./names";
import { publishCandidate } from "./publish";
import { prepareCandidates } from "./prepare";
import { mayAutoPublish, selectTop, shortfallMessage } from "./select";
import { DISCOVERY_SOURCES, runSources, type SourceReport } from "./sources";
import type { BatchStatus, DraftContent, Facts, IndiaSignal } from "./types";

/**
 * The batch runner: one call advances one batch by one bounded step.
 *
 *   discovering → verifying (repeated until done) → selecting → review | completed
 *
 * Why steps, not one long run
 * ---------------------------
 * The app runs on serverless functions (Vercel today, Cloudflare Workers when
 * it moves back), each with a time limit and — on Workers — a hard ceiling on
 * outbound requests per invocation. So every call does a bounded amount of
 * work, writes its progress to the batch row, and returns `more: true` until
 * the batch is finished. The scheduler (.github/workflows/daily-agent.yml) and
 * the admin's Run button both just call again while `more` is true. A crash
 * loses one step, never the batch; the next call resumes from the row.
 *
 * Idempotency: one live batch per agent per local day (unique index); a lease
 * stops two callers advancing one batch at once; candidates are unique per
 * (batch, domain); and a product is only ever created by publishCandidate,
 * whose own guards make a repeat a no-op.
 */

/** How long one step may hold the batch. Longer than a step can run. */
const LEASE_SECONDS = 120;
/** Stop *starting* work after this; work already started may finish. */
const STEP_BUDGET_MS = 40_000;
/** Outbound requests one verification can cost (robots, home, two secondary pages, probes). */
const COST_PER_SITE = 6;
/** Verify until this many eligible candidates per slot in the target, then stop fetching. */
const ELIGIBLE_BUFFER = 2;
/** Domains tried when a source named a product without linking it. */
const NAME_PROBES = 2;
/** A failed batch is resumed automatically this many times by the scheduler. */
const MAX_AUTO_ATTEMPTS = 3;

export type StepResult = {
  ok: boolean;
  batchId: string | null;
  status: BatchStatus | "waiting" | "disabled" | null;
  more: boolean;
  busy?: boolean;
  message: string;
};

type Logger = { lines: { at: string; message: string }[]; log(message: string): void };

function createLogger(batchId: string): Logger {
  const lines: { at: string; message: string }[] = [];
  return {
    lines,
    log(message: string) {
      lines.push({ at: new Date().toISOString(), message });
      console.log(`${LOG_PREFIX} ${message} (batch ${batchId.slice(0, 8)})`);
    },
  };
}

/** Errors go to shared logs and the batch row: message only, never a stack, a URL query or a secret. */
function safeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/(bearer|token|key|secret)=?[^\s&]*/gi, "$1=[redacted]").slice(0, 400);
}

function configSnapshot(config: AgentConfig): Json {
  return JSON.parse(JSON.stringify(config)) as Json;
}

function configFrom(batch: BatchRow, fallback: AgentConfig): AgentConfig {
  const snapshot = batch.config_snapshot as Partial<AgentConfig> | null;
  return snapshot && typeof snapshot === "object" && "dailyTarget" in snapshot
    ? { ...fallback, ...snapshot }
    : fallback;
}

// ── Entry points ─────────────────────────────────────────────────────────

/**
 * The scheduler's call. Does nothing until the configured local run time, and
 * nothing at all while the agent is switched off.
 */
export async function scheduledTick(agentType: string, now = new Date()): Promise<StepResult> {
  const config = await getAgentConfig(agentType);
  if (!config) return { ok: false, batchId: null, status: null, more: false, message: `No agent "${agentType}".` };
  if (!config.enabled) return { ok: true, batchId: null, status: "disabled", more: false, message: "Agent is switched off." };
  if (!isRunDue(now, config)) {
    return { ok: true, batchId: null, status: "waiting", more: false, message: `Runs at ${config.runTime} ${config.timezone}.` };
  }
  return advanceLive(agentType, "scheduled", now);
}

/** Today's live batch — created if needed — advanced one step. */
export async function advanceLive(
  agentType: string,
  trigger: "scheduled" | "manual",
  now = new Date(),
): Promise<StepResult> {
  const config = await getAgentConfig(agentType);
  if (!config) return { ok: false, batchId: null, status: null, more: false, message: `No agent "${agentType}".` };
  const batch = await findOrCreateLiveBatch({
    agentType,
    batchDate: localClock(now, config.timezone).date,
    trigger,
    targetCount: config.dailyTarget,
    configSnapshot: configSnapshot(config),
  });

  if (batch.status === "failed") {
    if (trigger === "scheduled" && batch.attempts >= MAX_AUTO_ATTEMPTS) {
      return { ok: false, batchId: batch.id, status: "failed", more: false, message: `Batch failed ${batch.attempts} times; resume it from the dashboard.` };
    }
    await resumeBatch(batch.id);
  }
  return advanceBatch(batch.id);
}

/** A new dry run: the whole pipeline, nothing published. */
export async function startDryRun(agentType: string, now = new Date()): Promise<StepResult> {
  const config = await getAgentConfig(agentType);
  if (!config) return { ok: false, batchId: null, status: null, more: false, message: `No agent "${agentType}".` };
  const batch = await createDryRunBatch({
    agentType,
    batchDate: localClock(now, config.timezone).date,
    targetCount: config.dailyTarget,
    configSnapshot: configSnapshot(config),
  });
  return { ok: true, batchId: batch.id, status: "discovering", more: true, message: "Dry run started." };
}

/** Puts a failed batch back into the stage it failed in. */
export async function resumeBatch(batchId: string): Promise<void> {
  const batch = await getBatch(batchId);
  if (!batch || batch.status !== "failed") return;
  const stage = (batch.failed_stage as BatchStatus | null) ?? "discovering";
  await updateBatch(batchId, { status: stage, error_message: null, locked_until: null });
}

/** Advances a batch by one step. */
export async function advanceBatch(batchId: string): Promise<StepResult> {
  const claimed = await claimBatch(batchId, LEASE_SECONDS);
  if (!claimed) {
    return { ok: true, batchId, status: null, more: true, busy: true, message: "Another run is advancing this batch; try again shortly." };
  }

  const fallback = await getAgentConfig(claimed.agent_type);
  if (!fallback) {
    await releaseBatch(batchId, {});
    return { ok: false, batchId, status: null, more: false, message: "The agent's settings are missing." };
  }
  const config = configFrom(claimed, fallback);
  const logger = createLogger(batchId);
  const status = claimed.status as BatchStatus;

  if (status === "review" || status === "completed" || status === "failed") {
    await releaseBatch(batchId, {});
    return { ok: true, batchId, status, more: false, message: `Batch is ${status}.` };
  }

  const started = Date.now();
  const budget = createSubrequestBudget(subrequestLimitFromEnv(process.env.DAILY_AGENT_SUBREQUEST_LIMIT));
  const fetcher = createFetcher({ timeoutMs: config.requestTimeoutMs, budget });

  try {
    let next: BatchStatus = status;
    const patch: Parameters<typeof releaseBatch>[1] = {};

    if (status === "discovering") {
      if (claimed.log && Array.isArray(claimed.log) && claimed.log.length === 0) logger.log("Batch started");
      const reports = await discover(claimed, config, fetcher, logger);
      patch.source_reports = reports as unknown as Json;
      next = "verifying";
    } else if (status === "verifying") {
      const result = await verify(claimed, config, fetcher, logger, () => Date.now() - started < STEP_BUDGET_MS && budget.remaining() >= COST_PER_SITE);
      patch.sites_fetched = claimed.sites_fetched + result.sitesFetched;
      patch.cache_hits = claimed.cache_hits + result.cacheHits;
      if (result.done) next = "selecting";
    } else if (status === "selecting") {
      const result = await select(claimed, config, logger);
      patch.ai_calls = claimed.ai_calls + result.aiCalls;
      patch.ai_cost_usd = Number(claimed.ai_cost_usd) + result.aiCost;
      patch.completed_at = new Date().toISOString();
      next = result.pendingDecisions > 0 ? "review" : "completed";
    }

    const finished = next === "review" || next === "completed";
    if (finished) logger.log("Batch completed");
    const log = [...((claimed.log as Json[] | null) ?? []), ...(logger.lines as unknown as Json[])].slice(-300);
    await releaseBatch(batchId, { ...patch, status: next, log: log as Json });
    await recountBatch(batchId);
    if (finished && !claimed.is_dry_run) await notify(batchId, config);
    return {
      ok: true,
      batchId,
      status: next,
      more: !finished,
      message: logger.lines.map((line) => line.message).join(" · ") || `Batch is ${next}.`,
    };
  } catch (error) {
    const message = safeMessage(error);
    logger.log(`Batch failed in ${status}: ${message}`);
    const log = [...((claimed.log as Json[] | null) ?? []), ...(logger.lines as unknown as Json[])].slice(-300);
    await releaseBatch(batchId, {
      status: "failed",
      failed_stage: status,
      attempts: claimed.attempts + 1,
      error_message: message,
      log: log as Json,
    }).catch(() => {});
    return { ok: false, batchId, status: "failed", more: false, message };
  }
}

// ── Stage 1: discovery (cheap — no product site is fetched) ──────────────

async function discover(batch: BatchRow, config: AgentConfig, fetcher: Fetcher, logger: Logger): Promise<SourceReport[]> {
  const enabled = DISCOVERY_SOURCES.filter((source) => config.enabledSources.includes(source.key));
  const now = new Date();
  const { candidates: raw, reports } = await runSources(
    enabled,
    {
      now,
      fetchText: (url, accept) => fetcher.fetchApi(url, accept),
      queries: { recentArticles, recentFundingRounds },
      manualUrls: config.manualUrls,
    },
    config.maxDiscoveryCandidates,
    config.requestTimeoutMs * 2,
  );
  for (const report of reports) {
    logger.log(report.ok ? `Source ${report.source}: ${report.found} found` : `Source ${report.source} failed: ${report.error}`);
  }
  logger.log(`Sources discovered: ${raw.length}`);

  // A live run consumes the manual queue; a dry run leaves it for the real run.
  if (!batch.is_dry_run && config.manualUrls.length && config.enabledSources.includes("manual")) {
    const latest = await getAgentConfig(batch.agent_type);
    const remaining = (latest?.manualUrls ?? []).filter((url) => !config.manualUrls.includes(url));
    await updateAgentConfig(batch.agent_type, { manual_urls: remaining });
  }

  // Merge the same product found by two sources; drop platform pages; keep the best.
  const ranked = prepareCandidates(raw, config.maxDiscoveryCandidates);

  const index = buildProductIndex(await getExistingProducts());
  const since = new Date(now.getTime() - config.cacheTtlDays * 86_400_000).toISOString();
  const history = await domainHistory(ranked.map((candidate) => candidate.key), batch.id, since);

  let duplicates = 0;
  let seen = 0;
  const rows: CandidateInsert[] = ranked.map((candidate) => {
    const base: CandidateInsert = {
      batch_id: batch.id,
      agent_type: batch.agent_type,
      normalized_domain: candidate.key,
      website_url: candidate.homeUrl,
      name: candidate.name.slice(0, 120),
      source_name: candidate.sourceName,
      source_urls: candidate.sourceUrls.slice(0, 10),
      source_snippet: candidate.snippet,
      website_inferred: !candidate.homeUrl,
      discovery_score: candidate.discoveryScore,
      india_signals: candidate.discoverySignals as unknown as Json,
    };

    const duplicate = checkDuplicate(index, candidate.homeUrl ? candidate.key : null, [candidate.name]);
    if (duplicate.kind === "duplicate") {
      duplicates += 1;
      return { ...base, status: "already_exists", duplicate_of_product_id: duplicate.productId, duplicate_reason: duplicate.reason };
    }
    if (duplicate.kind === "similar") {
      base.duplicate_of_product_id = duplicate.productId;
      base.duplicate_reason = duplicate.reason;
    }

    const previous = history.get(candidate.key);
    if (previous && (previous.status === "rejected" || previous.status === "ineligible")) {
      seen += 1;
      const when = previous.created_at.slice(0, 10);
      return {
        ...base,
        status: "skipped",
        status_reason: `${previous.status === "rejected" ? "Rejected by an admin" : `Ineligible (${previous.status_reason ?? "failed checks"})`} on ${when}`,
      };
    }
    return base;
  });

  await insertCandidates(rows);
  logger.log(`Duplicates removed: ${duplicates}`);
  if (seen) logger.log(`Seen recently and skipped: ${seen}`);
  return reports;
}

// ── Stage 2–4: verification, enrichment, drafting ────────────────────────

type VerifyResult = { done: boolean; sitesFetched: number; cacheHits: number };

async function verify(
  batch: BatchRow,
  config: AgentConfig,
  fetcher: Fetcher,
  logger: Logger,
  canStart: () => boolean,
): Promise<VerifyResult> {
  const all = await getCandidates(batch.id);
  const pending = all.filter((candidate) => candidate.status === "discovered").sort((a, b) => b.discovery_score - a.discovery_score);
  const goodEnough = config.dailyTarget + ELIGIBLE_BUFFER;
  let eligible = all.filter((candidate) => candidate.status === "eligible").length;
  let sitesFetched = 0;
  let cacheHits = 0;

  const finishRest = async (reason: string) => {
    const rest = (await getCandidates(batch.id, ["discovered"]));
    for (const candidate of rest) await updateCandidate(candidate.id, { status: "skipped", status_reason: reason });
    if (rest.length) logger.log(`Candidates skipped: ${rest.length} (${reason})`);
  };

  if (pending.length === 0) return { done: true, sitesFetched, cacheHits };
  if (eligible >= goodEnough) {
    await finishRest("Not needed today: enough verified candidates already");
    return { done: true, sitesFetched, cacheHits };
  }

  const index = buildProductIndex(await getExistingProducts());
  const since = new Date(Date.now() - config.cacheTtlDays * 86_400_000).toISOString();
  const history = await domainHistory(
    pending.filter((candidate) => !candidate.normalized_domain.startsWith("name:")).map((candidate) => candidate.normalized_domain),
    batch.id,
    since,
  );

  let sitesUsed = batch.sites_fetched;
  const queue = [...pending];

  const worker = async () => {
    for (;;) {
      if (eligible >= goodEnough || sitesUsed >= config.maxSitesPerBatch || !canStart()) {
        return;
      }
      const candidate = queue.shift();
      if (!candidate) return;
      const outcome = await verifyOne(candidate, { batch, config, fetcher, index, history });
      sitesFetched += outcome.sitesFetched;
      sitesUsed += outcome.sitesFetched;
      if (outcome.cacheHit) cacheHits += 1;
      if (outcome.status === "eligible") eligible += 1;
    }
  };
  await Promise.all(Array.from({ length: config.maxConcurrentRequests }, worker));

  logger.log(`Candidates verified this step: ${pending.length - queue.length} (sites fetched ${sitesFetched}, cache hits ${cacheHits})`);

  const left = await getCandidates(batch.id, ["discovered"]);
  if (left.length === 0) return { done: true, sitesFetched, cacheHits };
  if (eligible >= goodEnough) {
    await finishRest("Not needed today: enough verified candidates already");
    return { done: true, sitesFetched, cacheHits };
  }
  if (sitesUsed >= config.maxSitesPerBatch) {
    await finishRest("Today's verification budget is used up — eligible again tomorrow");
    return { done: true, sitesFetched, cacheHits };
  }
  // Out of time or request budget: the next call carries on.
  return { done: false, sitesFetched, cacheHits };
}

type VerifyContext = {
  batch: BatchRow;
  config: AgentConfig;
  fetcher: Fetcher;
  index: ProductIndex;
  history: Map<string, CandidateRow>;
};

type VerifyOutcome = { status: CandidateRow["status"]; sitesFetched: number; cacheHit: boolean };

async function verifyOne(candidate: CandidateRow, ctx: VerifyContext): Promise<VerifyOutcome> {
  const { config, fetcher } = ctx;
  const now = new Date().toISOString();
  let sitesFetched = 0;
  const finish = async (status: CandidateRow["status"], reason: string | null, extra: Parameters<typeof updateCandidate>[1] = {}) => {
    await updateCandidate(candidate.id, { status, status_reason: reason, verified_at: now, ...extra });
    return { status, sitesFetched, cacheHit: false };
  };

  // Resolve a name-only candidate's website by probing likely domains.
  let homeUrl = candidate.website_url;
  let siteKey = candidate.normalized_domain;
  let resolvedHome: FetchedPage | null = null;
  if (!homeUrl) {
    for (const guess of domainGuesses(candidate.name, NAME_PROBES)) {
      const page = await fetcher.fetchPage(guess);
      sitesFetched += 1;
      if (!page.ok) continue;
      const extracted = extractSite([page]);
      const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(page.html)?.[1] ?? null;
      if (!looksParked(page.html) && siteMatchesName(candidate.name, extracted.facts.productName, titleMatch)) {
        resolvedHome = page;
        break;
      }
    }
    if (!resolvedHome) return finish("ineligible", "Could not find the product's own website from its name");
    const site = normalizeSite(resolvedHome.url);
    if (!site || isNotAProductSite(resolvedHome.url)) return finish("ineligible", "Resolved website is not a product site");
    homeUrl = site.homeUrl;
    siteKey = site.key;
    const duplicate = checkDuplicate(ctx.index, siteKey, [candidate.name]);
    if (duplicate.kind === "duplicate") {
      return finish("already_exists", null, {
        normalized_domain: siteKey,
        website_url: homeUrl,
        duplicate_of_product_id: duplicate.productId,
        duplicate_reason: duplicate.reason,
      });
    }
    try {
      await updateCandidate(candidate.id, { normalized_domain: siteKey, website_url: homeUrl });
    } catch {
      // Unique (batch, domain): another candidate in this batch is the same site.
      return finish("skipped", "Same website as another candidate in this batch");
    }
  }

  const discoverySignals = (candidate.india_signals as unknown as IndiaSignal[]) ?? [];
  const duplicate = checkDuplicate(ctx.index, siteKey, [candidate.name]);
  if (duplicate.kind === "duplicate") {
    return finish("already_exists", null, { duplicate_of_product_id: duplicate.productId, duplicate_reason: duplicate.reason });
  }

  // Cache: a verdict on this domain from another batch within the TTL is reused, not refetched.
  const cached = ctx.history.get(siteKey);
  const verdicts = ["eligible", "needs_review", "ineligible", "selected", "publishing", "published"];
  if (cached?.verified_at && verdicts.includes(cached.status) && Object.keys((cached.facts ?? {}) as object).length > 0) {
    // A pick from another day is a verified product, not today's pick.
    const reuse = (["selected", "publishing", "published"].includes(cached.status) ? "eligible" : cached.status) as CandidateRow["status"];
    await updateCandidate(candidate.id, {
      status: reuse,
      status_reason: cached.status_reason,
      verified_at: cached.verified_at,
      name: cached.name,
      facts: cached.facts,
      india_confidence: cached.india_confidence,
      india_signals: cached.india_signals,
      scores: cached.scores,
      overall_score: cached.overall_score,
      issues: cached.issues,
      content: cached.content,
    });
    return { status: reuse, sitesFetched, cacheHit: true };
  }

  // Fetch the home page (unless the probe already did) and up to two evidence pages.
  let home = resolvedHome;
  if (!home) {
    const page = await fetcher.fetchPage(homeUrl);
    sitesFetched += 1;
    if (!page.ok) {
      if (page.kind === "robots") return finish("skipped", "robots.txt does not allow us to read this site");
      if (page.kind === "budget") {
        // Not a verdict: leave it for the next step.
        return { status: "discovered", sitesFetched, cacheHit: false };
      }
      const why = page.kind === "http" ? `HTTP ${page.status}` : page.kind === "not_html" ? "not a web page" : page.message;
      return finish("ineligible", `Website is unreachable or broken (${why})`);
    }
    home = page;
  }

  const pages: FetchedPage[] = [home];
  for (const link of secondaryPageLinks(home.html, home.url, 2)) {
    const page = await fetcher.fetchPage(link);
    if (page.ok) pages.push(page);
  }

  const evaluation = evaluateCandidate({
    name: candidate.name,
    host: normalizeSite(home.url)?.host ?? siteKey,
    pages,
    discoverySignals,
    duplicate,
    websiteInferred: candidate.website_inferred,
    sourceName: candidate.source_name,
    discoveredOn: candidate.discovered_at.slice(0, 10),
    categories: PRODUCT_CATEGORIES,
    weights: config.weights,
    minIndiaConfidence: config.minIndiaConfidence,
    minQualityScore: config.minQualityScore,
  });

  await updateCandidate(candidate.id, {
    status: evaluation.eligibility.status,
    status_reason: evaluation.eligibility.reason,
    verified_at: now,
    name: (evaluation.facts.productName ?? candidate.name).slice(0, 120),
    facts: evaluation.facts as unknown as Json,
    india_confidence: evaluation.indiaConfidence,
    india_signals: evaluation.signals as unknown as Json,
    scores: evaluation.scores as unknown as Json,
    overall_score: evaluation.scores.overallScore,
    issues: evaluation.eligibility.issues,
    content: evaluation.content as unknown as Json,
  });
  return { status: evaluation.eligibility.status, sitesFetched, cacheHit: false };
}

// ── Stage 5: selection, final quality check, auto-publish ────────────────

async function select(
  batch: BatchRow,
  config: AgentConfig,
  logger: Logger,
): Promise<{ aiCalls: number; aiCost: number; pendingDecisions: number }> {
  const candidates = await getCandidates(batch.id);
  const eligible = candidates.filter((candidate) => candidate.status === "eligible");
  const picks = selectTop(
    eligible.map((candidate) => ({
      id: candidate.id,
      overallScore: candidate.overall_score ?? 0,
      indiaConfidence: candidate.india_confidence ?? 0,
      category: ((candidate.content ?? {}) as Partial<DraftContent>).category ?? "Other",
      discoveredAt: candidate.discovered_at,
    })),
    config.dailyTarget,
  );
  logger.log(`India verified: ${candidates.filter((candidate) => (candidate.india_confidence ?? 0) >= config.minIndiaConfidence).length}`);
  logger.log(`Candidates enriched: ${candidates.filter((candidate) => candidate.verified_at).length}`);

  // Tier 4: the optional model pass, on the picks only, capped per batch.
  let aiCalls = 0;
  let aiCost = 0;
  for (const [rank, id] of picks.entries()) {
    const candidate = eligible.find((row) => row.id === id);
    if (!candidate) continue;
    let content = candidate.content as unknown as DraftContent;
    if (isAiContentEnabled() && aiCalls < config.maxAiCalls) {
      const refined = await refineContent(content, candidate.facts as unknown as Facts);
      if (refined.called) aiCalls += 1;
      aiCost += refined.costUsd;
      content = refined.content;
    }
    await updateCandidate(id, { status: "selected", rank: rank + 1, content: content as unknown as Json });
  }
  logger.log(`Final selected: ${picks.length}`);
  const shortfall = shortfallMessage(picks.length, config.dailyTarget);
  if (shortfall) logger.log(shortfall);

  // Auto-publish only with the mode on, the kill switch released, and every gate passed.
  if (!batch.is_dry_run && autoPublishActive(config)) {
    let published = 0;
    for (const id of picks) {
      const candidate = (await getCandidates(batch.id, ["selected"])).find((row) => row.id === id);
      if (!candidate) continue;
      const facts = (candidate.facts ?? {}) as Partial<Facts>;
      const allowed = mayAutoPublish({
        status: "selected",
        indiaConfidence: candidate.india_confidence,
        overallScore: candidate.overall_score,
        issues: candidate.issues,
        pricingKnown: Boolean(facts.pricingType),
        websiteInferred: candidate.website_inferred,
        minIndiaConfidence: config.minIndiaConfidence,
        minQualityScore: config.minQualityScore,
      });
      if (!allowed) continue;
      const result = await publishCandidate(id, { actor: "agent:auto-publish", allowFrom: ["selected"] });
      if (result.ok) published += 1;
      else logger.log(`Auto-publish held back ${candidate.name}: ${result.error}`);
    }
    logger.log(`Auto-published: ${published}`);
  }

  const counts = await recountBatch(batch.id);
  return { aiCalls, aiCost, pendingDecisions: counts.selected + counts.needs_review };
}

/** Rebuilds a candidate's draft from its stored facts (Regenerate). No site is refetched. */
export async function regenerateContent(candidate: CandidateRow, config: AgentConfig): Promise<DraftContent> {
  const facts = candidate.facts as unknown as Facts;
  let content = buildContent({
    name: facts.productName ?? candidate.name,
    facts,
    signals: (candidate.india_signals as unknown as IndiaSignal[]) ?? [],
    indiaConfidence: candidate.india_confidence ?? 0,
    minIndiaConfidence: config.minIndiaConfidence,
    sourceName: candidate.source_name,
    discoveredOn: candidate.discovered_at.slice(0, 10),
    categories: PRODUCT_CATEGORIES,
  });
  if (isAiContentEnabled()) content = (await refineContent(content, facts)).content;
  return content;
}

// ── Stage 6: notify ──────────────────────────────────────────────────────

async function notify(batchId: string, config: AgentConfig): Promise<void> {
  if (!config.notifyEnabled || ADMIN_EMAILS.length === 0) return;
  const batch = await getBatch(batchId);
  if (!batch || batch.notified_at) return;
  // Claim the send first, so a retry after a slow provider cannot mail twice.
  await updateBatch(batchId, { notified_at: new Date().toISOString() });

  const candidates = await getCandidates(batchId, ["selected", "published", "needs_review", "publishing"]);
  const reports = (batch.source_reports as unknown as SourceReport[]) ?? [];
  const email = buildDailyAgentReportEmail({
    label: config.label,
    batchDate: batch.batch_date,
    target: batch.target_count,
    selected: batch.selected_count,
    published: batch.published_count,
    pendingReview: candidates.filter((candidate) => candidate.status === "selected" || candidate.status === "needs_review").length,
    shortfall: shortfallMessage(batch.selected_count, batch.target_count),
    sourceFailures: reports.filter((report) => !report.ok).map((report) => report.source),
    items: candidates.slice(0, 15).map((candidate) => ({
      name: candidate.name,
      website: candidate.website_url,
      status: candidate.status,
      overallScore: candidate.overall_score,
      indiaConfidence: candidate.india_confidence,
      category: ((candidate.content ?? {}) as Partial<DraftContent>).category ?? null,
    })),
  });
  const sent = await sendEmail({ to: [...ADMIN_EMAILS], ...email });
  if (!sent.ok) console.error(`${LOG_PREFIX} report mail for ${batch.batch_date} was not delivered: ${sent.error}`);
}
