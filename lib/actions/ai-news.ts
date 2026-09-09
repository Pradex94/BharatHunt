"use server";

import { revalidatePath } from "next/cache";
import { auth, currentUser } from "@clerk/nextjs/server";

import { isAdminUser } from "@/lib/admin";
import { cacheInvalidatePrefix } from "@/lib/cache";
import { checkRateLimitByIp } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/service";
import { AI_CATEGORY_VALUES, AI_REGIONS } from "@/lib/ai-news/constants";
import {
  contentHash,
  normalizeEntityName,
  normalizeTitle,
  normalizeUrl,
  splitPublisherSuffix,
  storyKey as buildStoryKey,
  storySlug,
} from "@/lib/ai-news/normalize";
import { classifyArticle } from "@/lib/ai-news/classify";
import { composeSummary } from "@/lib/ai-news/summarize";
import { runIngestion, type IngestionSummary } from "@/lib/ai-news/ingest";
import {
  AI_NEWS_CACHE_PREFIX,
  countAiStoriesSince,
  searchAiStories,
  type AiStoryPage,
  type AiStoryQuery,
} from "@/services/ai-news";

/**
 * The Server Actions behind /ai and /admin/ai-news.
 *
 * Everything exported from a `"use server"` module is a public endpoint
 * reachable by anyone who can guess its id, so **authorisation is the first
 * thing every admin action here does** — never a check the calling page
 * performed on its behalf. That is the same rule `lib/actions/review.ts`
 * states, and the reason the work itself lives in `lib/ai-news/ingest.ts`,
 * which does no permission checking at all.
 *
 * Exactly one action here is callable by the public: `recordAiStoryView`. It
 * increments one counter, is rate-limited per IP, and is discussed where it is
 * defined.
 */

export type AdminActionResult = { ok: true } | { ok: false; error: string };

const DENIED = "You do not have permission to do that.";

/**
 * The gate. Returns the acting admin's email when allowed, so an action can
 * stamp `reviewed_by` without a second round trip to Clerk (`currentUser()` is
 * an HTTP call on every invocation — see the note in lib/admin.ts).
 */
async function requireAdmin(): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: DENIED };

  const user = await currentUser();
  if (!isAdminUser(user)) return { ok: false, error: DENIED };

  return { ok: true, email: user?.emailAddresses[0]?.emailAddress ?? userId };
}

/**
 * Everything that has to happen after a write.
 *
 * The Redis prefix and the two rendered routes, together — a published story
 * that is still missing from /ai because a cache key survived is the bug this
 * exists to prevent.
 */
async function invalidate(slug?: string | null): Promise<void> {
  await cacheInvalidatePrefix(AI_NEWS_CACHE_PREFIX);
  revalidatePath("/ai");
  if (slug) revalidatePath(`/ai/${slug}`);
}

// ── Story moderation (section 23) ────────────────────────────────────────

async function setStoryState(
  storyId: string,
  patch: Record<string, unknown>,
): Promise<AdminActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  const db = createServiceClient();
  const { data, error } = await db
    .from("ai_stories")
    .update({ ...patch, reviewed_by: gate.email, reviewed_at: new Date().toISOString() })
    .eq("id", storyId)
    .select("slug")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };

  await invalidate(data?.slug);
  revalidatePath("/admin/ai-news");
  return { ok: true };
}

/** Take a queued story live. */
export async function publishAiStory(storyId: string): Promise<AdminActionResult> {
  return setStoryState(storyId, { status: "published", is_hidden: false });
}

/**
 * Reject a story.
 *
 * Not a delete. The row stays, its articles stay, and `normalized_url` still
 * recognises them — so a rejected story does not come back on the next run, and
 * the reason it was rejected is still readable.
 */
export async function rejectAiStory(storyId: string, note?: string): Promise<AdminActionResult> {
  return setStoryState(storyId, { status: "rejected", review_note: note?.slice(0, 500) ?? null });
}

/** Pull a live story off the page immediately, without rejecting it. */
export async function setAiStoryHidden(
  storyId: string,
  hidden: boolean,
): Promise<AdminActionResult> {
  return setStoryState(storyId, { is_hidden: hidden });
}

/**
 * Pin a story as the "Top AI Story", or unpin it.
 *
 * Only one can be pinned, so setting a new one clears the others. Without that,
 * `getFeaturedAiStory` would silently pick between them by score and the flag
 * would look broken.
 */
export async function setAiStoryFeatured(
  storyId: string,
  featured: boolean,
): Promise<AdminActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  const db = createServiceClient();

  if (featured) {
    await db.from("ai_stories").update({ featured: false }).eq("featured", true);
  }

  const { data, error } = await db
    .from("ai_stories")
    .update({ featured })
    .eq("id", storyId)
    .select("slug")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };

  await invalidate(data?.slug);
  revalidatePath("/admin/ai-news");
  return { ok: true };
}

/**
 * Correct a story's metadata.
 *
 * Category and region are validated against the closed vocabularies rather than
 * trusted: this is a Server Action, so its arguments arrive from the network
 * whatever the form renders, and the database CHECK on `region` would turn a bad
 * value into a 500 instead of a message.
 */
export async function updateAiStoryMeta(
  storyId: string,
  patch: { title?: string; summary?: string; category?: string; region?: string },
): Promise<AdminActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  const update: Record<string, unknown> = {};

  if (patch.title !== undefined) {
    const title = patch.title.trim();
    if (title.length < 3 || title.length > 300) {
      return { ok: false, error: "A headline must be between 3 and 300 characters." };
    }
    update.title = title;
  }

  if (patch.summary !== undefined) {
    const summary = patch.summary.trim();
    if (summary.length > 700) return { ok: false, error: "That summary is too long." };
    update.summary = summary || null;
  }

  if (patch.category !== undefined) {
    if (!AI_CATEGORY_VALUES.includes(patch.category)) {
      return { ok: false, error: "Unknown category." };
    }
    update.category = patch.category;
  }

  if (patch.region !== undefined) {
    if (!(AI_REGIONS as readonly string[]).includes(patch.region)) {
      return { ok: false, error: "Unknown region." };
    }
    update.region = patch.region;
  }

  if (Object.keys(update).length === 0) return { ok: true };

  const db = createServiceClient();
  const { data, error } = await db
    .from("ai_stories")
    .update({ ...update, reviewed_by: gate.email, reviewed_at: new Date().toISOString() })
    .eq("id", storyId)
    .select("slug")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };

  await invalidate(data?.slug);
  revalidatePath("/admin/ai-news");
  return { ok: true };
}

/**
 * Fold one story into another (section 23).
 *
 * This is the human half of duplicate detection, and it is not a convenience —
 * `findStoryForArticle` is deliberately conservative because a false merge
 * destroys a story while a missed one merely shows it twice, so the misses are
 * expected and this is where they get fixed.
 *
 * The articles move; the source story is marked rejected rather than deleted, so
 * its URLs stay known and the next ingestion run does not recreate it. The
 * aggregate trigger recomputes `source_count` on both stories as the articles
 * move, which is the whole reason that counter is a trigger and not application
 * code.
 */
export async function mergeAiStories(
  sourceStoryId: string,
  targetStoryId: string,
): Promise<AdminActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  if (sourceStoryId === targetStoryId) {
    return { ok: false, error: "A story cannot be merged into itself." };
  }

  const db = createServiceClient();

  const { data: target } = await db
    .from("ai_stories")
    .select("id, slug, title, category, sub_category, region")
    .eq("id", targetStoryId)
    .maybeSingle();

  if (!target) return { ok: false, error: "The story to merge into no longer exists." };

  const { error: moveError } = await db
    .from("ai_news_articles")
    .update({ story_id: targetStoryId })
    .eq("story_id", sourceStoryId);

  if (moveError) return { ok: false, error: moveError.message };

  // The entity links follow the articles. `ignoreDuplicates` because the target
  // may already be linked to the same entity, and that pair is the primary key.
  const { data: links } = await db
    .from("ai_story_entities")
    .select("entity_id, mentions")
    .eq("story_id", sourceStoryId);

  if (links?.length) {
    await db.from("ai_story_entities").upsert(
      links.map((link) => ({
        story_id: targetStoryId,
        entity_id: link.entity_id,
        mentions: link.mentions,
        is_primary: false,
      })),
      { onConflict: "story_id,entity_id", ignoreDuplicates: true },
    );
  }

  const { data: sourceRow } = await db
    .from("ai_stories")
    .select("slug")
    .eq("id", sourceStoryId)
    .maybeSingle();

  await db
    .from("ai_stories")
    .update({
      status: "rejected",
      review_note: `Merged into ${target.slug}`,
      reviewed_by: gate.email,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", sourceStoryId);

  // The coverage sentence is now wrong on the target — it was composed against a
  // smaller source list. Recomposed from what the target actually holds now.
  const { data: sources } = await db
    .from("ai_news_articles")
    .select("source_name")
    .eq("story_id", targetStoryId)
    .neq("status", "rejected")
    .limit(30);

  const { data: entities } = await db
    .from("ai_story_entities")
    .select("entity:ai_entities!ai_story_entities_entity_id_fkey(name)")
    .eq("story_id", targetStoryId)
    .limit(6);

  const summary = composeSummary({
    headline: target.title,
    category: target.category,
    subCategory: target.sub_category,
    region: target.region as "india" | "global",
    entities: (entities ?? []).map((row) => row.entity?.name).filter((name): name is string => Boolean(name)),
    sources: [...new Set((sources ?? []).map((row) => row.source_name))],
  });

  if (summary) {
    await db.from("ai_stories").update({ summary }).eq("id", targetStoryId);
  }

  await invalidate(target.slug);
  if (sourceRow?.slug) revalidatePath(`/ai/${sourceRow.slug}`);
  revalidatePath("/admin/ai-news");
  return { ok: true };
}

// ── Sources (section 23) ─────────────────────────────────────────────────

export async function setAiSourceEnabled(
  sourceId: string,
  enabled: boolean,
): Promise<AdminActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  const db = createServiceClient();
  const { error } = await db
    .from("ai_news_sources")
    .update({
      enabled,
      // Re-enabling clears the backoff. An operator turning a source back on has
      // usually just fixed it, and making them wait out sixteen intervals of
      // exponential backoff would look like the switch did nothing.
      ...(enabled ? { consecutive_failures: 0, is_healthy: true, last_error: null } : {}),
    })
    .eq("id", sourceId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/ai-news");
  return { ok: true };
}

export async function setAiSourceAutoPublish(
  sourceId: string,
  autoPublish: boolean,
): Promise<AdminActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  const db = createServiceClient();
  const { error } = await db
    .from("ai_news_sources")
    .update({ auto_publish: autoPublish })
    .eq("id", sourceId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/ai-news");
  return { ok: true };
}

// ── Ingestion (sections 23 and 24) ───────────────────────────────────────

export type RunIngestionResult =
  | { ok: true; summary: IngestionSummary }
  | { ok: false; error: string };

/**
 * The "Run AI News Ingestion" button.
 *
 * Authenticates the signed-in admin rather than the cron secret, so an operator
 * can run the pipeline without `AI_NEWS_INGEST_SECRET` being configured at all —
 * the same split the funding feature's endpoint documents in .env.example.
 *
 * `force: true` ignores `poll_interval_minutes`, which is the point of a manual
 * run: an operator who has just fixed a feed wants to see it fetched now, not in
 * fifty minutes. A cron must never pass it, and the route handler does not.
 */
export async function runAiNewsIngestion(sourceIds?: string[]): Promise<RunIngestionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  const summary = await runIngestion({
    trigger: "admin",
    force: true,
    sourceIds: sourceIds?.length ? sourceIds : undefined,
    // A manual run of one source should fetch that source, not eight others.
    maxSources: sourceIds?.length ? sourceIds.length : undefined,
  });

  await invalidate();
  revalidatePath("/admin/ai-news");
  return { ok: true, summary };
}

/**
 * Add an article by hand (section 23).
 *
 * Goes through the same classifier, the same normalisation and the same story
 * grouping as an ingested one — an admin-entered article is a shortcut past the
 * *fetch*, not past the pipeline. What it does skip is the auto-publish
 * threshold: a human typed it, so it goes live.
 */
export async function addManualAiArticle(input: {
  url: string;
  title: string;
  sourceName: string;
  excerpt?: string;
  publishedAt?: string;
}): Promise<AdminActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  const normalizedUrl = normalizeUrl(input.url);
  if (!normalizedUrl) return { ok: false, error: "That is not a valid http(s) URL." };

  const { headline } = splitPublisherSuffix(input.title.trim());
  if (headline.length < 8) return { ok: false, error: "That headline is too short." };

  const sourceName = input.sourceName.trim();
  if (!sourceName) return { ok: false, error: "Name the publication this came from." };

  const db = createServiceClient();

  const { data: existing } = await db
    .from("ai_news_articles")
    .select("id")
    .eq("normalized_url", normalizedUrl)
    .maybeSingle();
  if (existing) return { ok: false, error: "That URL is already in the archive." };

  const classification = classifyArticle({
    title: headline,
    excerpt: input.excerpt ?? null,
    // No prior: a hand-added article should stand on its own text. The admin can
    // fix the category afterwards if the classifier reads it differently.
    sourcePrior: 0,
  });

  const publishedAt = input.publishedAt ? new Date(input.publishedAt) : new Date();
  const key = buildStoryKey({
    primaryEntity: classification.primaryEntity?.name ?? null,
    title: headline,
    at: publishedAt,
  });

  const { data: manualSource } = await db
    .from("ai_news_sources")
    .select("id")
    .eq("source_type", "manual")
    .limit(1)
    .maybeSingle();

  const baseSlug = storySlug(headline);
  if (!baseSlug) return { ok: false, error: "That headline cannot be turned into a URL." };

  const hash = await contentHash(headline, input.excerpt);
  const { data: slugTaken } = await db
    .from("ai_stories")
    .select("id")
    .eq("slug", baseSlug)
    .maybeSingle();

  const { data: story, error: storyError } = await db
    .from("ai_stories")
    .insert({
      title: headline,
      slug: slugTaken ? `${baseSlug}-${hash.slice(0, 6)}` : baseSlug,
      summary: composeSummary({
        headline,
        category: classification.category,
        subCategory: classification.subCategory,
        region: classification.region,
        entities: classification.entities.map((entity) => entity.name),
        sources: [sourceName],
      }),
      category: classification.category ?? "AI Models",
      sub_category: classification.subCategory,
      region: classification.region,
      primary_entity: normalizeEntityName(classification.primaryEntity?.name ?? "") || null,
      entity_text: classification.entities.map((entity) => entity.name).join(" | "),
      keywords: classification.keywords,
      story_key: key,
      top_source_name: sourceName,
      top_source_url: input.url,
      status: "published",
      first_seen_at: publishedAt.toISOString(),
      last_seen_at: publishedAt.toISOString(),
      reviewed_by: gate.email,
      reviewed_at: new Date().toISOString(),
    })
    .select("id, slug")
    .single();

  if (storyError || !story) {
    return {
      ok: false,
      error:
        storyError?.code === "23505"
          ? "A story for that event already exists — add the URL to it as coverage instead."
          : (storyError?.message ?? "Could not create the story."),
    };
  }

  const { error: articleError } = await db.from("ai_news_articles").insert({
    story_id: story.id,
    source_id: manualSource?.id ?? null,
    source_name: sourceName,
    source_url: input.url,
    normalized_url: normalizedUrl,
    content_hash: hash,
    title: headline,
    normalized_title: normalizeTitle(headline),
    excerpt: input.excerpt ?? null,
    published_at: publishedAt.toISOString(),
    is_ai_related: true,
    relevance_score: classification.relevanceScore,
    category: classification.category,
    sub_category: classification.subCategory,
    region: classification.region,
    entities: classification.entities.map((entity) => entity.name),
    keywords: classification.keywords,
    status: "processed",
  });

  if (articleError) return { ok: false, error: articleError.message };

  await invalidate(story.slug);
  revalidatePath("/admin/ai-news");
  return { ok: true };
}

// ── Public actions ───────────────────────────────────────────────────────

/**
 * One more page of the "Latest AI News" feed, for client-side accumulation.
 *
 * The same shape as `loadMoreProducts`: the filters travel back to the server,
 * the server returns one page, and the browser appends. Nothing about the query
 * is trusted — `searchAiStories` passes it to `ai_story_search`, whose
 * `page_limit` is clamped in SQL, so an edited request cannot ask for the whole
 * table.
 */
export async function loadMoreAiStories(query: AiStoryQuery): Promise<AiStoryPage> {
  const limit = await checkRateLimitByIp("loadMore");
  if (!limit.ok) {
    return { stories: [], totalCount: 0, page: query.page ?? 1, pageSize: 0, hasMore: false };
  }
  return searchAiStories(query);
}

/**
 * How many stories have gone live since the page was rendered (section 25).
 *
 * Returns a count and nothing else, so the page can offer "5 new AI stories —
 * refresh" instead of rearranging itself under someone who is reading. That
 * restraint is the requirement; the count is just what makes it actionable.
 */
export async function countNewAiStories(sinceIso: string): Promise<number> {
  const since = new Date(sinceIso);
  if (Number.isNaN(since.getTime())) return 0;

  const limit = await checkRateLimitByIp("loadMore");
  if (!limit.ok) return 0;

  return countAiStoriesSince(since.toISOString());
}



/**
 * Count an open of a story page.
 *
 * Public, and therefore the most carefully bounded thing in this module. It is
 * an input to a public ranking — `view_count` feeds the engagement term of the
 * BharatHunt Trend Score — so an unbounded increment endpoint would be a way to
 * push a chosen story up the page.
 *
 * Three constraints together: a per-IP rate limit (`aiStoryView`), a service-role
 * write so the counter is not exposed to the anon key at all, and a log-scaled,
 * 8%-weighted term at the other end, so even a successful flood moves the score
 * by very little. Failures are swallowed — a view that goes uncounted is not
 * worth failing a page render over.
 */
export async function recordAiStoryView(slug: string): Promise<void> {
  const limit = await checkRateLimitByIp("aiStoryView");
  if (!limit.ok) return;

  try {
    const db = createServiceClient();
    const { data } = await db
      .from("ai_stories")
      .select("id, view_count")
      .eq("slug", slug)
      .eq("status", "published")
      .eq("is_hidden", false)
      .maybeSingle();

    if (!data) return;

    // Read-modify-write, which is right for this counter: it is an input to a
    // log-scaled 8% term, so a lost increment under concurrency is invisible,
    // and the alternative is another SQL function for a number that does not
    // need to be exact.
    await db
      .from("ai_stories")
      .update({ view_count: (data.view_count ?? 0) + 1 })
      .eq("id", data.id);
  } catch {
    // Deliberately silent.
  }
}
