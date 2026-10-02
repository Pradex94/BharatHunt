/**
 * Run the Daily 5 agent's pipeline against the real sources and real product
 * websites, and print what it *would* do. Writes nothing, anywhere.
 *
 *   node scripts/daily-agent-dry-run.mjs                # discover + verify the top 10 sites
 *   node scripts/daily-agent-dry-run.mjs --sites=20     # verify more
 *   node scripts/daily-agent-dry-run.mjs --no-db        # skip the database reads
 *   node scripts/daily-agent-dry-run.mjs --verbose      # evidence per candidate
 *
 * With `.env.local` present it *reads* (never writes) the stored news and
 * funding articles the database-backed sources use, and every existing product
 * for the duplicate check. Without it, those sources return nothing and the
 * duplicate check sees an empty catalogue.
 *
 * The decision logic is the real one — prepareCandidates, checkDuplicate,
 * evaluateCandidate, selectTop all come from lib/daily-agent. Only the fetching
 * is simplified (no SSRF guard, no Redis): this is a developer tool run against
 * public sites, not a server path.
 */

import { existsSync, readFileSync } from "node:fs";

import { buildProductIndex, checkDuplicate, normalizeSite } from "../lib/daily-agent/domain.ts";
import { evaluateCandidate } from "../lib/daily-agent/evaluate.ts";
import { extractSite, looksParked, secondaryPageLinks } from "../lib/daily-agent/extract.ts";
import { domainGuesses, siteMatchesName } from "../lib/daily-agent/names.ts";
import { prepareCandidates } from "../lib/daily-agent/prepare.ts";
import { isPathAllowed, rulesForStatus, DISALLOW_ALL } from "../lib/daily-agent/robots.ts";
import { selectTop, shortfallMessage } from "../lib/daily-agent/select.ts";
import { DISCOVERY_SOURCES, runSources } from "../lib/daily-agent/sources.ts";
import { DEFAULT_WEIGHTS } from "../lib/daily-agent/config.ts";

// Mirrors PRODUCT_CATEGORIES in lib/constants.ts, which cannot load in plain Node (it imports icons).
const CATEGORIES = ["Developer Tools", "Productivity", "Finance", "Food & Drink", "Design Tools", "Marketing", "Health & Fitness", "Education", "Social", "Other"];

const args = process.argv.slice(2);
const flag = (name, fallback) => Number(args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? fallback);
const SITES = flag("sites", 10);
const MAX = flag("max", 40);
const TARGET = flag("target", 5);
const verbose = args.includes("--verbose");
const useDb = !args.includes("--no-db") && existsSync(".env.local");
const UA = "Mozilla/5.0 (compatible; BharatHuntBot/1.0; +https://bharathunt.org/daily-5)";

let requests = 0;
async function get(url, accept = "text/html,*/*;q=0.5", timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    requests += 1;
    const response = await fetch(url, { headers: { "User-Agent": UA, Accept: accept }, signal: controller.signal, redirect: "follow" });
    const body = (await response.text()).slice(0, 600 * 1024);
    return { status: response.status, url: response.url, body, type: response.headers.get("content-type") ?? "", ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

const robots = new Map();
async function allowed(url) {
  const { origin, pathname, search } = new URL(url);
  if (!robots.has(origin)) {
    robots.set(origin, get(`${origin}/robots.txt`, "text/plain").then((r) => rulesForStatus(r.status, r.body)).catch(() => DISALLOW_ALL));
  }
  return isPathAllowed(await robots.get(origin), `${pathname}${search}`);
}

async function page(url) {
  if (!(await allowed(url))) return { ok: false, why: "robots" };
  try {
    const r = await get(url);
    if (r.status < 200 || r.status >= 300) return { ok: false, why: `HTTP ${r.status}` };
    if (r.type && !/html|xml/i.test(r.type)) return { ok: false, why: "not html" };
    return { ok: true, url: r.url, html: r.body, status: r.status, ms: r.ms };
  } catch (error) {
    return { ok: false, why: error.name === "AbortError" ? "timeout" : error.message };
  }
}

// ── Read-only database access ──────────────────────────────────────────────
let db = null;
if (useDb) {
  const env = Object.fromEntries(
    readFileSync(".env.local", "utf8")
      .split(/\r?\n/)
      .filter((line) => /^[A-Z_]+=/.test(line))
      .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).replace(/^"|"$/g, "")]),
  );
  const { createClient } = await import("@supabase/supabase-js");
  db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

const queries = {
  async recentArticles(sinceIso, limit) {
    if (!db) return [];
    const [ai, funding] = await Promise.all([
      db.from("ai_news_articles").select("title, source_url, excerpt, published_at, source_name").gte("fetched_at", sinceIso).limit(limit),
      db.from("funding_news").select("title, url, excerpt, published_at, source_name").gte("fetched_at", sinceIso).limit(limit),
    ]);
    return [
      ...(ai.data ?? []).map((r) => ({ title: r.title, url: r.source_url, excerpt: r.excerpt, publishedAt: r.published_at, sourceName: r.source_name, region: null })),
      ...(funding.data ?? []).map((r) => ({ title: r.title, url: r.url, excerpt: r.excerpt, publishedAt: r.published_at, sourceName: r.source_name, region: "india" })),
    ];
  },
  async recentFundingRounds(sinceDate, limit) {
    if (!db) return [];
    const { data } = await db
      .from("funding_rounds")
      .select("startup_name, headline, summary, source_url, location, city, announcement_date")
      .eq("status", "published")
      .gte("announcement_date", sinceDate)
      .limit(limit);
    return (data ?? []).map((r) => ({ startupName: r.startup_name, headline: r.headline, summary: r.summary, sourceUrl: r.source_url, location: r.location, city: r.city, announcedOn: r.announcement_date }));
  },
};

async function existingProducts() {
  if (!db) return [];
  const { data, error } = await db.from("products").select("id, name, website_url, github_url").limit(5000);
  if (error) throw new Error(error.message);
  return data ?? [];
}

// ── Run ───────────────────────────────────────────────────────────────────
const started = Date.now();
console.log(`[BHARATHUNT-DAILY5] Dry run started (${useDb ? "reading the database" : "no database"}; nothing is written)`);

const { candidates: raw, reports } = await runSources(
  DISCOVERY_SOURCES.filter((source) => source.key !== "manual"),
  { now: new Date(), fetchText: async (url, accept) => (await get(url, accept, 15000)).body, queries, manualUrls: [] },
  MAX,
  20000,
);
for (const report of reports) console.log(`  source ${report.source.padEnd(20)} ${report.ok ? `${report.found} found` : `FAILED: ${report.error}`} (${report.ms} ms)`);
console.log(`[BHARATHUNT-DAILY5] Sources discovered: ${raw.length}`);

const prepared = prepareCandidates(raw, MAX);
const index = buildProductIndex(await existingProducts());
const fresh = [];
let duplicates = 0;
for (const candidate of prepared) {
  const duplicate = checkDuplicate(index, candidate.homeUrl ? candidate.key : null, [candidate.name]);
  if (duplicate.kind === "duplicate") {
    duplicates += 1;
    if (verbose) console.log(`  duplicate: ${candidate.name} — ${duplicate.reason}`);
  } else fresh.push({ ...candidate, duplicate });
}
console.log(`[BHARATHUNT-DAILY5] Duplicates removed: ${duplicates} (${index.products.length} existing products checked)`);

const results = [];
let sites = 0;
for (const candidate of fresh) {
  if (sites >= SITES) break;
  let home = null;
  let inferred = false;
  if (candidate.homeUrl) {
    sites += 1;
    const result = await page(candidate.homeUrl);
    if (!result.ok) {
      results.push({ candidate, status: result.why === "robots" ? "skipped" : "ineligible", reason: result.why });
      continue;
    }
    home = result;
  } else {
    inferred = true;
    for (const guess of domainGuesses(candidate.name, 2)) {
      sites += 1;
      const result = await page(guess);
      if (!result.ok) continue;
      const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(result.html)?.[1] ?? null;
      if (!looksParked(result.html) && siteMatchesName(candidate.name, extractSite([result]).facts.productName, title)) {
        home = result;
        break;
      }
    }
    if (!home) {
      results.push({ candidate, status: "ineligible", reason: "no website found from the name" });
      continue;
    }
  }
  const pages = [home];
  for (const link of secondaryPageLinks(home.html, home.url, 2)) {
    const result = await page(link);
    if (result.ok) pages.push(result);
  }
  const evaluation = evaluateCandidate({
    name: candidate.name,
    host: normalizeSite(home.url)?.host ?? candidate.key,
    pages,
    discoverySignals: candidate.discoverySignals,
    duplicate: candidate.duplicate,
    websiteInferred: inferred,
    sourceName: candidate.sourceName,
    discoveredOn: new Date().toISOString().slice(0, 10),
    categories: CATEGORIES,
    weights: DEFAULT_WEIGHTS,
    minIndiaConfidence: 70,
    minQualityScore: 60,
  });
  results.push({ candidate, status: evaluation.eligibility.status, reason: evaluation.eligibility.reason, evaluation, url: home.url });
}

const verified = results.filter((r) => r.evaluation);
console.log(`[BHARATHUNT-DAILY5] India verified: ${verified.filter((r) => r.evaluation.indiaConfidence >= 70).length}`);
console.log(`[BHARATHUNT-DAILY5] Candidates enriched: ${verified.length} (${sites} sites, ${requests} requests)`);

const eligible = results.filter((r) => r.status === "eligible");
const picks = selectTop(
  eligible.map((r, i) => ({ id: String(i), overallScore: r.evaluation.scores.overallScore, indiaConfidence: r.evaluation.indiaConfidence, category: r.evaluation.content.category, discoveredAt: "" })),
  TARGET,
).map((id) => eligible[Number(id)]);
console.log(`[BHARATHUNT-DAILY5] Final selected: ${picks.length}`);
const shortfall = shortfallMessage(picks.length, TARGET);
if (shortfall) console.log(`[BHARATHUNT-DAILY5] ${shortfall}`);

console.log("\nVerdicts:");
for (const r of results) {
  const e = r.evaluation;
  console.log(
    `  ${r.status.padEnd(13)} ${r.candidate.name.slice(0, 28).padEnd(28)} ${String(e?.indiaConfidence ?? "—").padStart(3)} india  ${String(e?.scores.overallScore ?? "—").padStart(3)} score  ${r.candidate.sourceName.padEnd(18)} ${r.url ?? r.candidate.homeUrl ?? ""}`,
  );
  if (r.reason) console.log(`      ↳ ${r.reason}`);
  if (e?.eligibility.issues.length) console.log(`      ↳ issues: ${e.eligibility.issues.join(", ")}`);
  if (verbose && e) {
    for (const signal of e.signals) console.log(`      + ${signal.weight} ${signal.label} — “${signal.evidence.slice(0, 120)}”`);
    console.log(`      tagline: ${e.content.tagline}`);
  }
}

console.log(`\nWould select (nothing is published by a dry run):`);
for (const [i, r] of picks.entries()) console.log(`  ${i + 1}. ${r.candidate.name} — ${r.evaluation.content.tagline} (${r.url})`);
console.log(`\n[BHARATHUNT-DAILY5] Batch completed in ${((Date.now() - started) / 1000).toFixed(1)}s`);
