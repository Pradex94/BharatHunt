/**
 * Discovery sources: where candidate products come from.
 *
 * One adapter per source, all returning `RawCandidate[]`, registered in
 * `DISCOVERY_SOURCES`. Adding a source is one object here plus its key in the
 * agent's `enabled_sources`; nothing else branches on a source name.
 *
 * What a source may do
 * --------------------
 * Read a public API that exists for this (Hacker News via Algolia), read data
 * BharatHunt already holds (the news and funding pipelines' stored articles,
 * the AI company index), or take URLs an admin pasted. A source never crawls
 * and never fetches a product's site — that is the verifier's job, under
 * robots.txt and a per-batch budget. `rateLimit.maxRequests` is the most
 * outbound requests one `discover()` makes; the database sources make none.
 *
 * Deliberately not here: Product Hunt (its API bars commercial use without
 * permission), Reddit (API terms), and any search API (none is configured, and
 * scraping a search engine's HTML is exactly what the brief rules out).
 *
 * Pure apart from what the context injects, so `tests/` can exercise every
 * adapter with fakes.
 */

import { CURATED_ENTITIES } from "../ai-news/entities.ts";
import { nameFromHostname } from "../metadata-extract.ts";
import { isNotAProductSite, normalizeSite } from "./domain.ts";
import { discoveryIndiaSignal, SIGNAL_WEIGHTS } from "./india.ts";
import { extractLaunchedName } from "./names.ts";
import type { RawCandidate } from "./types.ts";

/** A stored news article, as the news source reads it. */
export type StoredArticle = {
  title: string;
  url: string;
  excerpt: string | null;
  publishedAt: string | null;
  sourceName: string;
  /** The publishing source's configured region, when known. */
  region: "india" | "global" | null;
};

/** A published funding round, as the funding source reads it. */
export type StoredRound = {
  startupName: string;
  headline: string;
  summary: string | null;
  sourceUrl: string;
  location: string | null;
  city: string | null;
  announcedOn: string;
};

/** The database reads a source may use, injected so tests can fake them. */
export type DiscoveryQueries = {
  recentArticles(sinceIso: string, limit: number): Promise<StoredArticle[]>;
  recentFundingRounds(sinceDate: string, limit: number): Promise<StoredRound[]>;
};

export type DiscoveryContext = {
  now: Date;
  /** The most candidates this source should return. */
  limit: number;
  /** One bounded, identified, backed-off GET. Counts against the batch budget. */
  fetchText(url: string, accept: string): Promise<string>;
  queries: DiscoveryQueries;
  /** URLs an admin queued for this run (the manual source's input). */
  manualUrls: string[];
};

export type DiscoverySource = {
  key: string;
  name: string;
  description: string;
  /** Higher runs first and wins ties in the candidate pre-rank. */
  priority: number;
  rateLimit: { maxRequests: number };
  /** Whether a fresh agent row should list it. The row's `enabled_sources` decides. */
  defaultEnabled: boolean;
  discover(ctx: DiscoveryContext): Promise<RawCandidate[]>;
};

const DAY_MS = 86_400_000;

/** Folds discovery text and clips it to what the candidate row stores. */
function snippet(...parts: (string | null | undefined)[]): string | null {
  const text = parts.filter(Boolean).join(" — ").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 600) : null;
}

// ── Manual ───────────────────────────────────────────────────────────────

export const manualSource: DiscoverySource = {
  key: "manual",
  name: "Manual URLs",
  description: "Product URLs an admin queued from the Daily 5 dashboard. Drained by the next run.",
  priority: 100,
  rateLimit: { maxRequests: 0 },
  defaultEnabled: true,
  async discover(ctx) {
    const candidates: RawCandidate[] = [];
    for (const raw of ctx.manualUrls.slice(0, ctx.limit)) {
      const site = normalizeSite(raw);
      if (!site || isNotAProductSite(raw)) continue;
      candidates.push({
        name: nameFromHostname(site.host),
        websiteUrl: site.homeUrl,
        sourceName: "manual",
        sourceUrls: [],
        snippet: "Queued by an admin",
        publishedAt: ctx.now.toISOString(),
        discoverySignals: [],
        discoveryScore: 90,
      });
    }
    return candidates;
  },
};

// ── Show HN ──────────────────────────────────────────────────────────────

type HnHit = {
  objectID?: string;
  title?: string | null;
  url?: string | null;
  story_text?: string | null;
  points?: number | null;
  num_comments?: number | null;
  created_at?: string | null;
};

const SHOW_HN_TERMS = ["india", "indian", "bengaluru", "bangalore", "mumbai", "delhi", "hyderabad", "pune", "chennai", "gurugram", "noida"];

/** Exposed for tests: Algolia hits → candidates, with the India pre-filter applied. */
export function showHnCandidates(payload: unknown, limit: number): RawCandidate[] {
  const hits = (payload as { hits?: HnHit[] })?.hits;
  if (!Array.isArray(hits)) return [];
  const candidates: RawCandidate[] = [];
  for (const hit of hits) {
    const title = (hit.title ?? "").replace(/^Show HN:\s*/i, "").trim();
    const url = hit.url ?? null;
    if (!title || !url || isNotAProductSite(url)) continue;
    const thread = hit.objectID ? `https://news.ycombinator.com/item?id=${hit.objectID}` : null;
    const body = (hit.story_text ?? "").replace(/<[^>]+>/g, " ");
    // The maker's own words: weaker than coverage, and required — a Show HN
    // post that never mentions India is not worth a site fetch.
    const signal = discoveryIndiaSignal(`${title} ${body}`, thread, "self_declared");
    if (!signal) continue;
    const name = title.split(/\s[–—:-]\s|:\s/)[0].trim().slice(0, 60) || nameFromHostname(normalizeSite(url)?.host ?? url);
    const engagement = (hit.points ?? 0) + (hit.num_comments ?? 0);
    candidates.push({
      name,
      websiteUrl: url,
      sourceName: "show_hn",
      sourceUrls: thread ? [thread] : [],
      snippet: snippet(hit.title, body.slice(0, 300)),
      publishedAt: hit.created_at ?? null,
      discoverySignals: [signal],
      discoveryScore: 60 + Math.min(20, Math.round(Math.log2(1 + engagement) * 3)),
    });
    if (candidates.length >= limit) break;
  }
  return candidates;
}

export const showHnSource: DiscoverySource = {
  key: "show_hn",
  name: "Show HN (Hacker News)",
  description:
    "Makers' own launch posts on Hacker News from the last 45 days that mention India, via Algolia's public HN Search API. One request per run.",
  priority: 70,
  rateLimit: { maxRequests: 1 },
  defaultEnabled: true,
  async discover(ctx) {
    const since = Math.floor((ctx.now.getTime() - 45 * DAY_MS) / 1000);
    const terms = SHOW_HN_TERMS.join(" ");
    const params = new URLSearchParams({
      tags: "show_hn",
      query: terms,
      // Every word optional = match any of them, in one request.
      optionalWords: terms,
      typoTolerance: "false",
      numericFilters: `created_at_i>${since}`,
      hitsPerPage: "100",
    });
    const body = await ctx.fetchText(`https://hn.algolia.com/api/v1/search_by_date?${params}`, "application/json");
    return showHnCandidates(JSON.parse(body), ctx.limit);
  },
};

// ── Indian startup news (stored articles) ─────────────────────────────────

/** Exposed for tests: stored articles → name-only candidates. */
export function newsLaunchCandidates(articles: StoredArticle[], limit: number): RawCandidate[] {
  const byName = new Map<string, RawCandidate>();
  for (const article of articles) {
    const name = extractLaunchedName(article.title);
    if (!name) continue;
    const text = `${article.title}. ${article.excerpt ?? ""}`;
    const signal = discoveryIndiaSignal(text, article.url, "external_coverage");
    // An Indian outlet covering a launch is not evidence the launch is Indian —
    // they cover OpenAI too. The article itself must connect the maker to India.
    if (!signal) continue;
    const key = name.toLowerCase();
    const existing = byName.get(key);
    if (existing) {
      if (!existing.sourceUrls.includes(article.url)) existing.sourceUrls.push(article.url);
      existing.discoveryScore = Math.min(85, existing.discoveryScore + 5);
      continue;
    }
    byName.set(key, {
      name,
      websiteUrl: null,
      sourceName: "news_launches",
      sourceUrls: [article.url],
      snippet: snippet(article.title, article.sourceName),
      publishedAt: article.publishedAt,
      discoverySignals: [signal],
      // Below every source that hands over a URL: a name costs probe fetches to resolve.
      discoveryScore: 45,
    });
    if (byName.size >= limit) break;
  }
  return [...byName.values()];
}

export const newsLaunchesSource: DiscoverySource = {
  key: "news_launches",
  name: "Indian startup news",
  description:
    "Launch headlines (\"X launches Y\") from the last 10 days that the AI Trends and Funding pipelines already stored — no extra fetching. Headlines rarely link the product, so its website is found by probing likely domains and always needs an admin's confirmation.",
  priority: 50,
  rateLimit: { maxRequests: 0 },
  defaultEnabled: true,
  async discover(ctx) {
    const since = new Date(ctx.now.getTime() - 10 * DAY_MS).toISOString();
    const articles = await ctx.queries.recentArticles(since, 400);
    return newsLaunchCandidates(articles, ctx.limit);
  },
};

// ── Funding announcements (stored rounds) ─────────────────────────────────

const PLAUSIBLE_COMPANY = /^[A-Z0-9][\w.&'+-]*(?: [A-Z0-9][\w.&'+-]*){0,3}$/;

/** Exposed for tests: published rounds → name-only candidates. */
export function fundingCandidates(rounds: StoredRound[], limit: number): RawCandidate[] {
  const seen = new Set<string>();
  const candidates: RawCandidate[] = [];
  for (const round of rounds) {
    const name = round.startupName.trim();
    // The extractor sometimes keeps a phrase ("for hospitality"); a company
    // name starts with a capital and is a few words long.
    if (!PLAUSIBLE_COMPANY.test(name) || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());

    const place = round.city && round.city !== "Other India" ? round.city : round.location;
    const signal = place
      ? {
          kind: "external_coverage" as const,
          label: `Funding coverage describes it as based in ${place}`,
          weight: SIGNAL_WEIGHTS.external_coverage,
          evidence: round.headline.slice(0, 220),
          url: round.sourceUrl,
        }
      : discoveryIndiaSignal(`${round.headline}. ${round.summary ?? ""}`, round.sourceUrl, "external_coverage");
    if (!signal) continue;

    candidates.push({
      name,
      websiteUrl: null,
      sourceName: "funded_startups",
      sourceUrls: [round.sourceUrl],
      snippet: snippet(round.headline),
      publishedAt: round.announcedOn,
      discoverySignals: [signal],
      // Name-only, like the news source: verified after anything with a URL.
      discoveryScore: 40,
    });
    if (candidates.length >= limit) break;
  }
  return candidates;
}

export const fundedStartupsSource: DiscoverySource = {
  key: "funded_startups",
  name: "Indian funding announcements",
  description:
    "Startups in funding rounds the Funding pipeline published in the last 120 days. Reads the database only; websites are found by probing likely domains and need an admin's confirmation.",
  priority: 40,
  rateLimit: { maxRequests: 0 },
  defaultEnabled: true,
  async discover(ctx) {
    const since = new Date(ctx.now.getTime() - 120 * DAY_MS).toISOString().slice(0, 10);
    const rounds = await ctx.queries.recentFundingRounds(since, 300);
    return fundingCandidates(rounds, ctx.limit);
  },
};

// ── BharatHunt's AI company index ─────────────────────────────────────────

export const indiaAiGazetteerSource: DiscoverySource = {
  key: "india_ai_gazetteer",
  name: "BharatHunt AI company index",
  description:
    "AI-native Indian companies in the curated entity index behind /ai (lib/ai-news/entities.ts). No network; each is offered once and then remembered.",
  priority: 30,
  rateLimit: { maxRequests: 0 },
  defaultEnabled: true,
  async discover(ctx) {
    return CURATED_ENTITIES.filter(
      (entity) =>
        entity.region === "india" &&
        entity.aiNative &&
        entity.website &&
        (entity.type === "company" || entity.type === "tool"),
    )
      .slice(0, ctx.limit)
      .map((entity) => ({
        name: entity.name,
        websiteUrl: entity.website ?? null,
        sourceName: "india_ai_gazetteer",
        sourceUrls: [],
        snippet: "Listed as an Indian AI company in BharatHunt's AI index",
        publishedAt: null,
        discoverySignals: [
          {
            kind: "external_coverage" as const,
            label: "BharatHunt's curated AI index lists it as an Indian company",
            weight: SIGNAL_WEIGHTS.external_coverage,
            evidence: entity.name,
            url: null,
          },
        ],
        discoveryScore: 50,
      }));
  },
};

export const DISCOVERY_SOURCES: DiscoverySource[] = [
  manualSource,
  showHnSource,
  newsLaunchesSource,
  fundedStartupsSource,
  indiaAiGazetteerSource,
].sort((a, b) => b.priority - a.priority);

export function sourceByKey(key: string): DiscoverySource | undefined {
  return DISCOVERY_SOURCES.find((source) => source.key === key);
}

export type SourceReport = {
  source: string;
  ok: boolean;
  found: number;
  ms: number;
  error?: string;
};

/**
 * Runs every enabled source, each in isolation: a source that throws or times
 * out is recorded and the rest carry on. The batch never fails because one
 * source did.
 */
export async function runSources(
  sources: DiscoverySource[],
  ctx: Omit<DiscoveryContext, "limit">,
  perSourceLimit: number,
  timeoutMs: number,
): Promise<{ candidates: RawCandidate[]; reports: SourceReport[] }> {
  const candidates: RawCandidate[] = [];
  const reports: SourceReport[] = [];
  for (const source of sources) {
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const found = await Promise.race([
        source.discover({ ...ctx, limit: perSourceLimit }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs}ms`)), timeoutMs);
        }),
      ]);
      candidates.push(...found);
      reports.push({ source: source.key, ok: true, found: found.length, ms: Date.now() - started });
    } catch (error) {
      reports.push({
        source: source.key,
        ok: false,
        found: 0,
        ms: Date.now() - started,
        error: (error instanceof Error ? error.message : String(error)).slice(0, 300),
      });
    } finally {
      clearTimeout(timer);
    }
  }
  return { candidates, reports };
}
