import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import doQueue from "@opennextjs/cloudflare/overrides/queue/do-queue";
import d1NextTagCache from "@opennextjs/cloudflare/overrides/tag-cache/d1-next-tag-cache";

/**
 * OpenNext → Cloudflare Workers adapter config.
 *
 * The app uses `revalidatePath`/`revalidateTag`/`unstable_cache` (see the nine
 * `next/cache` call sites), so a persistent incremental cache and a tag cache
 * are both required — without them ISR and on-demand revalidation silently
 * no-op on Workers.
 *
 *   - incrementalCache: R2  (bound as NEXT_INC_CACHE_R2_BUCKET in wrangler.jsonc)
 *   - tagCache:         D1  (bound as NEXT_TAG_CACHE_D1)
 *   - queue:            Durable Object (NEXT_CACHE_DO_QUEUE) — drains ISR
 *                       revalidations; needs WORKER_SELF_REFERENCE service binding.
 *
 * `enableCacheInterception` serves cached HTML/RSC straight from R2 before Next's
 * server runs, which is the win that makes ISR on Workers competitive with
 * Vercel's edge cache.
 */
export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
  queue: doQueue,
  tagCache: d1NextTagCache,
  enableCacheInterception: true,
});
