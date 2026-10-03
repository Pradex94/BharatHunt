import "server-only";

import { cacheInvalidatePrefix } from "@/lib/cache";
import { isMissingTableError } from "@/lib/supabase/errors";
import { createServiceClient } from "@/lib/supabase/service";
import type { Json } from "@/types/database";

import { INTELLIGENCE_CACHE_PREFIX } from "./cache-keys";
import {
  conceptKeys,
  knowledgeAttributes,
  contentHash,
  deriveKnowledge,
  KNOWLEDGE_VERSION,
  type KnowledgeInput,
} from "./knowledge";
import { computeSimilarities, SIMILARITY_METHOD, type SimilarityItem } from "./similarity";

/**
 * Rebuilds `product_intelligence` and `product_similarities` from the catalogue.
 *
 * The background half of Product Intelligence: the scheduler, the admin
 * "Rebuild" button and nothing else calls this. Product pages only ever read
 * what it wrote. **Performs no authorisation** — callers gate it (the job
 * secret, or `getIsAdmin()`), the same split as lib/daily-agent/publish.ts.
 *
 * Cost is one read of every published product (narrow columns), one read of
 * the stored hashes, and — only when something changed — a handful of chunked
 * upserts. A tick with nothing to do writes nothing, so the hourly schedule is
 * nearly free. Similarities are recomputed for *every* product whenever any
 * listing changes, because a new word or concept shifts the IDF weights for
 * all of them; at today's size that is milliseconds.
 */

const PRODUCT_COLUMNS =
  "id, name, tagline, description, category, pricing_type, tags, website_url, github_url, launch_state, launch_state_source, source, platform_links";

const CHUNK = 400;

export type ReindexResult =
  | {
      ok: true;
      skipped: boolean;
      products: number;
      changed: number;
      removed: number;
      similarityRows: number;
      ms: number;
    }
  | { ok: false; error: string };

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

export async function reindexProductIntelligence(
  options: { force?: boolean } = {},
): Promise<ReindexResult> {
  const started = Date.now();
  const runStartedAt = new Date(started).toISOString();
  const db = createServiceClient();

  const [{ data: products, error: productsError }, { data: stored, error: storedError }] =
    await Promise.all([
      db.from("products").select(PRODUCT_COLUMNS).eq("status", "published").limit(5000),
      db.from("product_intelligence").select("product_id, content_hash, knowledge_version").limit(5000),
    ]);

  if (productsError) return { ok: false, error: `Could not read products: ${productsError.message}` };
  if (storedError) {
    return {
      ok: false,
      error: isMissingTableError(storedError)
        ? "Product Intelligence tables are missing — apply migration 20261003000000_product_intelligence.sql."
        : `Could not read the index: ${storedError.message}`,
    };
  }

  const rows = (products ?? []) as unknown as KnowledgeInput[];
  const storedHash = new Map(
    (stored ?? []).map((row) => [row.product_id, `${row.content_hash}:${row.knowledge_version}`]),
  );
  const liveIds = new Set(rows.map((row) => row.id));

  const items: (SimilarityItem & { hash: string })[] = rows.map((row) => ({
    ...row,
    knowledge: deriveKnowledge(row),
    hash: contentHash(row),
  }));
  const changed = items.filter((item) => storedHash.get(item.id) !== `${item.hash}:${KNOWLEDGE_VERSION}`);
  // Deleted products cascade away; these are products that left `published`.
  const removed = [...storedHash.keys()].filter((id) => !liveIds.has(id));

  if (!options.force && changed.length === 0 && removed.length === 0) {
    return {
      ok: true,
      skipped: true,
      products: items.length,
      changed: 0,
      removed: 0,
      similarityRows: 0,
      ms: Date.now() - started,
    };
  }

  for (const batch of chunks(changed, CHUNK)) {
    const { error } = await db.from("product_intelligence").upsert(
      batch.map((item) => ({
        product_id: item.id,
        concepts: conceptKeys(item.knowledge),
        audiences: item.knowledge.audiences.map((audience) => audience.key),
        attributes: knowledgeAttributes(item.knowledge),
        knowledge: item.knowledge as unknown as Json,
        content_hash: item.hash,
        knowledge_version: KNOWLEDGE_VERSION,
        indexed_at: runStartedAt,
      })),
      { onConflict: "product_id" },
    );
    if (error) return { ok: false, error: `Could not write knowledge: ${error.message}` };
  }

  if (removed.length > 0) {
    for (const batch of chunks(removed, CHUNK)) {
      await db.from("product_intelligence").delete().in("product_id", batch);
      await db.from("product_similarities").delete().in("product_id", batch);
      await db.from("product_similarities").delete().in("similar_product_id", batch);
    }
  }

  const similarities = computeSimilarities(items);
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
      computed_at: runStartedAt,
    })),
  );

  for (const batch of chunks(similarityRows, CHUNK)) {
    const { error } = await db
      .from("product_similarities")
      .upsert(batch, { onConflict: "product_id,similar_product_id" });
    if (error) return { ok: false, error: `Could not write similarities: ${error.message}` };
  }

  // Pairs this run did not reproduce are stale (a listing changed, or fell
  // below the threshold). Deleted only after the new rows are in, so a reader
  // never sees a product with an empty list mid-rebuild.
  const { error: staleError } = await db
    .from("product_similarities")
    .delete()
    .lt("computed_at", runStartedAt);
  if (staleError) return { ok: false, error: `Could not prune similarities: ${staleError.message}` };

  await cacheInvalidatePrefix(INTELLIGENCE_CACHE_PREFIX);

  return {
    ok: true,
    skipped: false,
    products: items.length,
    changed: changed.length,
    removed: removed.length,
    similarityRows: similarityRows.length,
    ms: Date.now() - started,
  };
}
