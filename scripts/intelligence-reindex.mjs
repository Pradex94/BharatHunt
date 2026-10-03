/**
 * Rebuild Product Intelligence from a terminal, against the database in
 * `.env.local` — the same derivation as lib/intelligence/reindex.ts (which the
 * scheduler and the admin Rebuild button call), for the first population after
 * the migration and for testing lexicon changes before deploying them.
 *
 *   node scripts/intelligence-reindex.mjs            # write
 *   node scripts/intelligence-reindex.mjs --dry-run  # compute and print, write nothing
 *
 * After writing, it also runs refresh_discovery_signals() (trending/rising).
 *
 * Writes only the two derived tables (product_intelligence,
 * product_similarities), through the service role. Never touches `products`.
 */

import { readFileSync } from "node:fs";

import { conceptKeys, contentHash, deriveKnowledge, knowledgeAttributes, KNOWLEDGE_VERSION } from "../lib/intelligence/knowledge.ts";
import { computeSimilarities, SIMILARITY_METHOD } from "../lib/intelligence/similarity.ts";

const dryRun = process.argv.includes("--dry-run");
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("=") && !line.startsWith("#"))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1).replace(/^"|"$/g, "")];
    }),
);
const base = `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`;
const headers = {
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
};

async function rest(path, init = {}) {
  const response = await fetch(`${base}/${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${path.split("?")[0]}: ${response.status} ${await response.text()}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

const columns =
  "id,name,tagline,description,category,pricing_type,tags,website_url,github_url,launch_state,launch_state_source,source,platform_links";
const products = await rest(`products?select=${columns}&status=eq.published&limit=5000`);
const startedAt = new Date().toISOString();
const items = products.map((product) => ({ ...product, knowledge: deriveKnowledge(product), hash: contentHash(product) }));
const similarities = computeSimilarities(items);

const knowledgeRows = items.map((item) => ({
  product_id: item.id,
  concepts: conceptKeys(item.knowledge),
  audiences: item.knowledge.audiences.map((audience) => audience.key),
  attributes: knowledgeAttributes(item.knowledge),
  knowledge: item.knowledge,
  content_hash: item.hash,
  knowledge_version: KNOWLEDGE_VERSION,
  indexed_at: startedAt,
}));
const similarityRows = [...similarities.entries()].flatMap(([productId, entries]) =>
  entries.map((entry, index) => ({
    product_id: productId,
    similar_product_id: entry.similarId,
    rank: index + 1,
    score: entry.score,
    text_score: entry.textScore,
    concept_score: entry.conceptScore,
    shared_concepts: entry.sharedConcepts,
    method: SIMILARITY_METHOD,
    computed_at: startedAt,
  })),
);

console.log(
  `${items.length} products, ${similarityRows.length} similarity rows, ${items.filter((item) => (similarities.get(item.id) ?? []).length === 0).length} with none`,
);
if (dryRun) process.exit(0);

const upsert = { Prefer: "resolution=merge-duplicates,return=minimal" };
for (let index = 0; index < knowledgeRows.length; index += 400) {
  await rest("product_intelligence?on_conflict=product_id", { method: "POST", headers: upsert, body: JSON.stringify(knowledgeRows.slice(index, index + 400)) });
}
for (let index = 0; index < similarityRows.length; index += 400) {
  await rest("product_similarities?on_conflict=product_id,similar_product_id", { method: "POST", headers: upsert, body: JSON.stringify(similarityRows.slice(index, index + 400)) });
}
await rest(`product_similarities?computed_at=lt.${encodeURIComponent(startedAt)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
const liveIds = new Set(items.map((item) => item.id));
const stored = await rest("product_intelligence?select=product_id&limit=5000");
const orphaned = stored.map((row) => row.product_id).filter((id) => !liveIds.has(id));
if (orphaned.length > 0) {
  await rest(`product_intelligence?product_id=in.(${orphaned.join(",")})`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
}
console.log(`Written. Removed ${orphaned.length} unpublished product rows.`);

// Trending / rising / most saved — the same call the hourly job makes. The SQL
// defaults match TRENDING_CONFIG in lib/intelligence/trending.ts.
const signals = await rest("rpc/refresh_discovery_signals", { method: "POST", body: "{}" });
console.log("Signals:", JSON.stringify(signals));
