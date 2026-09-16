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
 * `enableCacheInterception` is OFF, deliberately. It serves cached HTML/RSC from R2
 * before Next's server runs, but on Next 16.3 it answers every segment prefetch
 * (`Next-Router-Segment-Prefetch: /_tree`) with the full-route RSC: the
 * interceptor skips segment data whenever `experimental.prefetchInlining` is
 * truthy, and 16.3 defaults it to `{ maxSize: 2048 }`. The client rejects that
 * payload and prefetches again at once, so every visible <Link> refetched ~5x a
 * second for as long as a tab stayed open. On 2026-09-14 that exhausted the
 * Workers free-plan quota and took the site down (Error 1027). Next's own server
 * serves segment prefetches correctly, so leave this off until OpenNext handles
 * prefetchInlining. Re-enabling it needs the idle-tab request count re-checked.
 */
export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
  queue: doQueue,
  tagCache: d1NextTagCache,
  enableCacheInterception: false,
});
