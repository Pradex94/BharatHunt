import "server-only";

import { revalidatePath } from "next/cache";

import { cacheInvalidatePrefix } from "@/lib/cache";
import { PRODUCT_CATEGORIES, PRODUCT_PRICING_TYPES } from "@/lib/constants";
import { moderateProduct } from "@/lib/moderation";
import { createServiceClient } from "@/lib/supabase/service";
import {
  getBatch,
  getCandidate,
  getExistingProducts,
  recountBatch,
  transitionCandidate,
  updateBatch,
} from "@/services/daily-agent";
import { PRODUCTS_CACHE_PREFIX } from "@/services/products";

import { CURATOR_PROFILE_ID } from "./config";
import { buildProductIndex, checkDuplicate, normalizeSite } from "./domain";
import type { CandidateStatus, DraftContent, Facts, PricingType } from "./types";

/**
 * The only way a candidate becomes a BharatHunt product. **Performs no
 * authorisation** — the admin action or the auto-publish gate in run.ts has
 * already decided this may happen, the same split as lib/review.ts.
 *
 * Idempotent by construction:
 *   - the candidate is claimed with a conditional status update
 *     (`selected|eligible|needs_review → publishing`), so a double click or a
 *     scheduler racing an admin publishes once;
 *   - `daily_agent_candidates.product_id` is unique, so one candidate can
 *     never link two products;
 *   - the duplicate check runs again right before the insert, and if it finds
 *     a curated product on the same domain (a previous attempt that inserted
 *     and then crashed) it links that product instead of inserting another.
 *
 * Writes go through the service role, which is what the products review gate
 * and source gate (20260825000000, 20261002000000) require for
 * `status = 'published'` and `source = 'daily_agent'`.
 */

export type PublishOutcome = { ok: true; slug: string; productId: string } | { ok: false; error: string };

const PUBLISHABLE = ["selected", "eligible", "needs_review"] as const;
/** A claim older than this is a crashed attempt and may be retried. */
const STALE_PUBLISHING_MS = 5 * 60_000;

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "")
      .slice(0, 60) || "product"
  );
}

async function freeSlug(base: string): Promise<string> {
  const supabase = createServiceClient();
  const { data } = await supabase.from("products").select("slug").like("slug", `${base}%`).limit(100);
  const taken = new Set((data ?? []).map((row) => row.slug));
  if (!taken.has(base)) return base;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = `${base}-${Math.random().toString(36).slice(2, 6)}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * Copies a remote image into Cloudinary once, through the existing unsigned
 * preset, so the listing does not hotlink a third-party file that may move.
 * Called only at publish time — discovery never downloads images. Fails open:
 * no Cloudinary config, or a refused upload, keeps the verified original URL.
 */
async function toCloudinary(url: string | null): Promise<string | null> {
  if (!url) return null;
  const cloud = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const preset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
  if (!cloud || !preset) return url;
  try {
    const form = new FormData();
    form.append("file", url);
    form.append("upload_preset", preset);
    form.append("folder", "daily5");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
      if (!response.ok) return url;
      const json = (await response.json()) as { secure_url?: string };
      return json.secure_url ?? url;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return url;
  }
}

function revalidateAfterPublish(slug: string, batchDate: string) {
  revalidatePath("/");
  revalidatePath("/marketplace");
  revalidatePath(`/products/${slug}`);
  revalidatePath("/daily-5");
  revalidatePath(`/daily-5/${batchDate}`);
  revalidatePath("/admin/daily-agent");
}

/** Back to where it was before the claim, so the admin can fix the problem and try again. */
async function release(candidateId: string, previous: CandidateStatus, error: string): Promise<PublishOutcome> {
  const status = previous === "publishing" ? "needs_review" : previous;
  await transitionCandidate(candidateId, ["publishing"], { status }).catch(() => null);
  return { ok: false, error };
}

export async function publishCandidate(
  candidateId: string,
  options: { actor: string; allowFrom?: readonly CandidateStatus[] } = { actor: "agent" },
): Promise<PublishOutcome> {
  const existing = await getCandidate(candidateId);
  if (!existing) return { ok: false, error: "That candidate no longer exists." };
  if (existing.status === "published" && existing.product_id) {
    return { ok: false, error: "That candidate is already published." };
  }

  const batch = await getBatch(existing.batch_id);
  if (!batch) return { ok: false, error: "That candidate's batch no longer exists." };
  if (batch.is_dry_run) {
    return { ok: false, error: "This is a dry run — nothing from it can be published. Run today's batch to publish." };
  }

  const stale =
    existing.status === "publishing" && Date.now() - new Date(existing.updated_at).getTime() > STALE_PUBLISHING_MS;
  const from: CandidateStatus[] = stale ? ["publishing"] : [...(options.allowFrom ?? PUBLISHABLE)];
  const claimed = await transitionCandidate(candidateId, from, { status: "publishing" });
  if (!claimed) return { ok: false, error: "That candidate is not waiting for a decision — it may already be handled." };

  const facts = (claimed.facts ?? {}) as Partial<Facts>;
  const content = (claimed.content ?? {}) as Partial<DraftContent>;
  const pricing = (content.pricingType ?? facts.pricingType ?? null) as PricingType | null;
  const category = content.category && (PRODUCT_CATEGORIES as readonly string[]).includes(content.category)
    ? content.category
    : null;
  const name = (facts.productName ?? claimed.name).trim().slice(0, 60);
  const tagline = (content.tagline ?? "").trim().slice(0, 120);
  const description = (content.fullDescription || content.shortDescription || "").trim() || null;
  const site = normalizeSite(claimed.website_url);

  if (!site || !claimed.website_url) return release(claimed.id, existing.status as CandidateStatus, "This candidate has no verified website.");
  if (!pricing || !(PRODUCT_PRICING_TYPES as readonly string[]).includes(pricing)) {
    return release(claimed.id, existing.status as CandidateStatus, "Pricing could not be verified — choose it in Edit before approving.");
  }
  if (!category) return release(claimed.id, existing.status as CandidateStatus, "Choose a category in Edit before approving.");
  if (tagline.length < 10) return release(claimed.id, existing.status as CandidateStatus, "The tagline is too short — write one in Edit before approving.");

  // The same moderation a maker's launch passes.
  const moderated = moderateProduct({
    name,
    tagline,
    description,
    tags: content.tags ?? [],
    websiteUrl: site.homeUrl,
  });
  if (!moderated.ok) return release(claimed.id, existing.status as CandidateStatus, `Moderation: ${moderated.message}`);

  // Re-check just before writing: someone may have launched it since discovery.
  const index = buildProductIndex(await getExistingProducts());
  const duplicate = checkDuplicate(index, site.key, [name, facts.companyName]);
  const supabase = createServiceClient();
  if (duplicate.kind === "duplicate") {
    const { data: match } = await supabase
      .from("products")
      .select("id, slug, source")
      .eq("id", duplicate.productId)
      .maybeSingle();
    // A curated product on this domain is our own earlier, interrupted attempt.
    if (match && match.source === "daily_agent") {
      await transitionCandidate(claimed.id, ["publishing"], {
        status: "published",
        product_id: match.id,
        reviewed_by: options.actor,
        reviewed_at: new Date().toISOString(),
      });
      await recountBatch(claimed.batch_id);
      return { ok: true, slug: match.slug, productId: match.id };
    }
    await transitionCandidate(claimed.id, ["publishing"], {
      status: "already_exists",
      duplicate_of_product_id: duplicate.productId,
      duplicate_reason: duplicate.reason,
    });
    await recountBatch(claimed.batch_id);
    return { ok: false, error: `Already on BharatHunt: ${duplicate.reason}. Nothing was created.` };
  }

  // The owner row normally exists from the migration; this keeps a missing one
  // from turning into a foreign-key failure.
  await supabase
    .from("profiles")
    .upsert(
      { id: CURATOR_PROFILE_ID, username: "bharathunt-curator", display_name: "BharatHunt Curator" },
      { onConflict: "id", ignoreDuplicates: true },
    );

  const [heroImage, screenshot] = await Promise.all([
    toCloudinary(facts.logoUrl ?? null),
    toCloudinary(facts.screenshotUrl ?? null),
  ]);
  const indiaConfident = (claimed.india_confidence ?? 0) >= 70;
  const slug = await freeSlug(slugify(name));
  const now = new Date().toISOString();

  const { data: product, error } = await supabase
    .from("products")
    .insert({
      creator_id: CURATOR_PROFILE_ID,
      slug,
      name,
      tagline,
      description,
      category,
      pricing_type: pricing,
      website_url: claimed.website_url,
      hero_image_url: heroImage,
      screenshot_urls: screenshot ? [screenshot] : [],
      tags: (content.tags ?? []).slice(0, 10),
      platform_links: facts.platformLinks ?? {},
      launch_state: indiaConfident ? (facts.stateCode ?? null) : null,
      launch_state_source: indiaConfident && facts.stateCode ? "verified" : null,
      status: "published",
      published_at: now,
      source: "daily_agent",
    })
    .select("id, slug")
    .single();

  if (error || !product) {
    console.error(`[daily-agent] insert failed for candidate ${claimed.id}: ${error?.message ?? "no row"}`);
    return release(claimed.id, existing.status as CandidateStatus, `Could not create the product: ${error?.message ?? "unknown error"}`);
  }

  await transitionCandidate(claimed.id, ["publishing"], {
    status: "published",
    product_id: product.id,
    reviewed_by: options.actor,
    reviewed_at: now,
  });

  const counts = await recountBatch(claimed.batch_id);
  if (counts.selected + counts.needs_review + counts.publishing === 0 && batch.status === "review") {
    await updateBatch(claimed.batch_id, { status: "completed" });
  }
  await cacheInvalidatePrefix(PRODUCTS_CACHE_PREFIX);
  revalidateAfterPublish(product.slug, batch.batch_date);
  return { ok: true, slug: product.slug, productId: product.id };
}
