"use server";

/**
 * Launch Agent actions for makers.
 *
 * Every export of a `"use server"` module is a public HTTP endpoint, so each
 * action re-establishes everything from scratch: the session, a rate limit, the
 * product row (loaded by the server, never taken from the client), ownership,
 * and feature access — in that order, before any work. The product id a client
 * posts is a lookup key and nothing more.
 */

import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";

import { featureAccess, type LaunchAgentFeature } from "@/lib/launch-agent/access";
import { adapterFor } from "@/lib/launch-agent/adapters";
import { answerCopilot, COPILOT_MAX_MESSAGE, type CopilotReply } from "@/lib/launch-agent/copilot";
import { authorizeCampaignAccess } from "@/lib/launch-agent/ownership";
import { isHttpsUrl } from "@/lib/launch-agent/registry";
import { canMarkManually } from "@/lib/launch-agent/status";
import { isDateString } from "@/lib/launch-agent/timeline";
import type { LaunchPlatform, PlatformCampaignStatus } from "@/lib/launch-agent/types";
import { KIT_LIST_FIELDS, KIT_TEXT_FIELDS, mergeKit, validateOverrides } from "@/lib/launch-agent/validate";
import { checkRateLimitByIpAndUser, type RateLimitName } from "@/lib/rate-limit";
import {
  buildCampaignView,
  copilotContextFor,
  ensureCampaign,
  getActivePlatforms,
  getOrAnalyzeCampaign,
  getPlatformCampaignForProduct,
  getProductForSession,
  LaunchAgentNotConfiguredError,
  preparePlatformCampaign,
  recheckPlatformCampaign,
  runCampaignAnalysis,
  updatePlatformCampaign,
  type OwnedProduct,
} from "@/services/launch-agent";

export type LaunchAgentResult = { ok: true; message?: string; url?: string | null } | { ok: false; error: string };

const GENERIC_FAILURE = "We couldn't generate your launch kit right now. Your BharatHunt product is safe.";

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

type Owned = { ok: true; userId: string; product: OwnedProduct } | { ok: false; error: string };

async function requireOwnedProduct(productId: unknown, feature: LaunchAgentFeature, limit: RateLimitName): Promise<Owned> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Please log in." };

  const rate = await checkRateLimitByIpAndUser(limit, userId);
  if (!rate.ok) return { ok: false, error: rate.message };

  const product = isUuid(productId) ? await getProductForSession({ id: productId }) : null;
  const decision = authorizeCampaignAccess({
    userId,
    product: product ? { creatorId: product.creatorId, status: product.status } : null,
    intent: "write",
  });
  if (!decision.ok) {
    if (decision.status === 404 && product) {
      // Someone else's product: worth a log line, never an explanation.
      console.warn(JSON.stringify({ event: "launch_agent_denied", userId, at: new Date().toISOString() }));
    }
    return { ok: false, error: decision.error };
  }

  const access = featureAccess({ userId, feature });
  if (!access.allowed) return { ok: false, error: access.reason };
  return { ok: true, userId, product: product! };
}

async function platformBySlug(slug: unknown): Promise<LaunchPlatform | null> {
  if (typeof slug !== "string" || !/^[a-z0-9-]{2,60}$/.test(slug)) return null;
  return (await getActivePlatforms()).find((platform) => platform.slug === slug) ?? null;
}

function refresh(slug: string): void {
  revalidatePath(`/dashboard/launch-agent/${slug}`);
  revalidatePath("/dashboard/launch-agent");
}

function failure(event: string, error: unknown, fallback = GENERIC_FAILURE): { ok: false; error: string } {
  if (error instanceof LaunchAgentNotConfiguredError) return { ok: false, error: error.message };
  console.error(JSON.stringify({ event, message: error instanceof Error ? error.message : String(error), at: new Date().toISOString() }));
  return { ok: false, error: fallback };
}

/** "Try again" on a failed analysis, and "Refresh plan" after the listing changed. */
export async function reanalyzeLaunchCampaign(productId: string): Promise<LaunchAgentResult> {
  const owned = await requireOwnedProduct(productId, "analyze", "launchAgentGenerate");
  if (!owned.ok) return owned;
  try {
    const campaign = await ensureCampaign(owned.product.id, owned.userId);
    const done = await runCampaignAnalysis(campaign, owned.product, { force: true });
    refresh(owned.product.slug);
    if (done.status !== "READY") return { ok: false, error: GENERIC_FAILURE };
    return { ok: true, message: "Your launch plan is up to date." };
  } catch (error) {
    return failure("launch_agent_reanalyze_failed", error);
  }
}

/** Prepare Launch / Prepare Submission / Generate Launch Kit / Generate Missing Content. */
export async function prepareLaunchPlatform(productId: string, platformSlug: string): Promise<LaunchAgentResult> {
  const owned = await requireOwnedProduct(productId, "prepare", "launchAgentGenerate");
  if (!owned.ok) return owned;
  const platform = await platformBySlug(platformSlug);
  if (!platform) return { ok: false, error: "That platform is not available." };
  try {
    const row = await preparePlatformCampaign(owned.product, platform);
    refresh(owned.product.slug);
    return { ok: true, message: `${platform.name} is ${row.readiness}% ready.` };
  } catch (error) {
    return failure("launch_agent_prepare_failed", error);
  }
}

export async function regenerateLaunchKit(productId: string, platformSlug: string): Promise<LaunchAgentResult> {
  const owned = await requireOwnedProduct(productId, "regenerate", "launchAgentGenerate");
  if (!owned.ok) return owned;
  const platform = await platformBySlug(platformSlug);
  if (!platform) return { ok: false, error: "That platform is not available." };
  try {
    await preparePlatformCampaign(owned.product, platform, { regenerate: true });
    refresh(owned.product.slug);
    return { ok: true, message: "Fresh drafts generated. Your edits were kept." };
  } catch (error) {
    return failure("launch_agent_regenerate_failed", error);
  }
}

const EDITABLE_FIELDS = new Set<string>([...KIT_TEXT_FIELDS, ...KIT_LIST_FIELDS]);

/** Save one kit field the maker edited, or `null` to go back to the generated text. */
export async function saveLaunchKitField(
  productId: string,
  platformSlug: string,
  field: string,
  value: string | null,
): Promise<LaunchAgentResult> {
  const owned = await requireOwnedProduct(productId, "prepare", "launchAgentUpdate");
  if (!owned.ok) return owned;
  if (!EDITABLE_FIELDS.has(field)) return { ok: false, error: "That field can't be edited." };
  if (value !== null && (typeof value !== "string" || value.length > 5000)) return { ok: false, error: "That text is too long." };
  const platform = await platformBySlug(platformSlug);
  if (!platform) return { ok: false, error: "That platform is not available." };

  try {
    const { row } = await getPlatformCampaignForProduct(owned.product, platform);
    if (!row?.prepared_at) return { ok: false, error: "Prepare this platform before editing its kit." };
    const current = validateOverrides(row.content_overrides) as Record<string, unknown>;
    if (value === null) {
      delete current[field];
    } else {
      const validated = validateOverrides({ [field]: value }) as Record<string, unknown>;
      if (!(field in validated)) return { ok: false, error: "That text couldn't be saved." };
      current[field] = validated[field];
    }
    const updated = await updatePlatformCampaign(row.id, { content_overrides: current });
    await recheckPlatformCampaign(updated, platform, owned.product);
    refresh(owned.product.slug);
    return { ok: true, message: value === null ? "Restored the generated text." : "Saved." };
  } catch (error) {
    return failure("launch_agent_edit_failed", error, "Couldn't save that edit. Try again.");
  }
}

/** The maker moves a date in their timeline, or clears it. */
export async function setLaunchPlatformDate(productId: string, platformSlug: string, date: string | null): Promise<LaunchAgentResult> {
  const owned = await requireOwnedProduct(productId, "prepare", "launchAgentUpdate");
  if (!owned.ok) return owned;
  if (date !== null && !isDateString(date)) return { ok: false, error: "Pick a valid date." };
  const platform = await platformBySlug(platformSlug);
  if (!platform) return { ok: false, error: "That platform is not available." };
  try {
    const { row } = await getPlatformCampaignForProduct(owned.product, platform);
    if (!row) return { ok: false, error: "That platform isn't in your plan yet." };
    const updated = await updatePlatformCampaign(row.id, { scheduled_for: date });
    await recheckPlatformCampaign(updated, platform, owned.product);
    refresh(owned.product.slug);
    return { ok: true, message: date ? "Date updated." : "Date cleared." };
  } catch (error) {
    return failure("launch_agent_date_failed", error, "Couldn't update that date. Try again.");
  }
}

/**
 * The maker reports progress on a platform BharatHunt cannot see. PUBLISHED
 * needs the live listing URL — the UI labels it "marked by you" either way.
 */
export async function markLaunchPlatformStatus(
  productId: string,
  platformSlug: string,
  status: PlatformCampaignStatus,
  publishedUrl?: string | null,
): Promise<LaunchAgentResult> {
  const owned = await requireOwnedProduct(productId, "submit", "launchAgentUpdate");
  if (!owned.ok) return owned;
  const platform = await platformBySlug(platformSlug);
  if (!platform) return { ok: false, error: "That platform is not available." };
  try {
    const { row } = await getPlatformCampaignForProduct(owned.product, platform);
    if (!row) return { ok: false, error: "That platform isn't in your plan yet." };
    const level = row.automation_level as LaunchPlatform["automationLevel"];
    if (!canMarkManually(level, row.status as PlatformCampaignStatus, status)) {
      return { ok: false, error: "That status change isn't available here." };
    }
    const url = publishedUrl?.trim() ?? "";
    if (status === "PUBLISHED" && !isHttpsUrl(url)) {
      return { ok: false, error: "Paste the https:// link to your live listing." };
    }
    const now = new Date().toISOString();
    if (status === "READY") {
      await updatePlatformCampaign(row.id, { status: "READY", submitted_at: null, published_at: null, published_url: null });
      const fresh = await getPlatformCampaignForProduct(owned.product, platform);
      if (fresh.row) await recheckPlatformCampaign({ ...fresh.row, status: "READY" }, platform, owned.product);
    } else {
      await updatePlatformCampaign(row.id, {
        status,
        submitted_at: row.submitted_at ?? now,
        published_at: status === "PUBLISHED" ? now : null,
        published_url: status === "PUBLISHED" ? url : null,
      });
    }
    refresh(owned.product.slug);
    return { ok: true, message: status === "PUBLISHED" ? "Marked as published." : status === "SUBMITTED" ? "Marked as submitted." : "Status reset." };
  } catch (error) {
    return failure("launch_agent_status_failed", error, "Couldn't update that status. Try again.");
  }
}

/**
 * Submit through the platform's adapter. Only an AUTOMATED platform with an
 * approved integration can submit; everything else gets the official link and
 * the hand-off message, and nothing is claimed.
 */
export async function submitLaunchPlatform(productId: string, platformSlug: string): Promise<LaunchAgentResult> {
  const owned = await requireOwnedProduct(productId, "submit", "launchAgentGenerate");
  if (!owned.ok) return owned;
  const platform = await platformBySlug(platformSlug);
  if (!platform) return { ok: false, error: "That platform is not available." };
  try {
    const { row } = await getPlatformCampaignForProduct(owned.product, platform);
    if (!row?.prepared_at) return { ok: false, error: "Prepare this platform first." };
    const adapter = adapterFor(platform);
    if (!adapter.submit) {
      return {
        ok: true,
        message: "We've prepared everything. Final submission requires you to complete it on the platform.",
        url: row.submission_url,
      };
    }
    const kit = mergeKit(row.generated_content, row.content_overrides);
    const result = await adapter.submit(platform, owned.product, kit);
    const now = new Date().toISOString();
    if (!result.ok) {
      console.error(JSON.stringify({ event: "launch_agent_submit_failed", platform: platform.slug, message: result.error, at: now }));
      await updatePlatformCampaign(row.id, { status: result.status, error_message: result.error, last_checked_at: now });
      refresh(owned.product.slug);
      return { ok: false, error: `${platform.name} connection failed. Your launch campaign has not been published.` };
    }
    await updatePlatformCampaign(row.id, {
      status: result.status,
      submitted_at: now,
      published_at: result.status === "PUBLISHED" ? now : null,
      published_url: result.publishedUrl ?? null,
      error_message: null,
      last_checked_at: now,
    });
    refresh(owned.product.slug);
    return { ok: true, message: `Submitted to ${platform.name}.` };
  } catch (error) {
    return failure("launch_agent_submit_failed", error, `${platform.name} connection failed. Your launch campaign has not been published.`);
  }
}

export type CopilotResult = { ok: true; reply: CopilotReply } | { ok: false; error: string };

export async function askLaunchCopilot(productId: string, message: string): Promise<CopilotResult> {
  if (typeof message !== "string" || !message.trim()) return { ok: false, error: "Type a question first." };
  if (message.length > COPILOT_MAX_MESSAGE) return { ok: false, error: `Keep questions under ${COPILOT_MAX_MESSAGE} characters.` };
  const owned = await requireOwnedProduct(productId, "copilot", "launchCopilot");
  if (!owned.ok) return owned;
  try {
    const campaign = await getOrAnalyzeCampaign(owned.product);
    const [view, platforms] = await Promise.all([buildCampaignView(owned.product, campaign), getActivePlatforms()]);
    return { ok: true, reply: answerCopilot(message, copilotContextFor(view, owned.product, platforms)) };
  } catch (error) {
    return failure("launch_agent_copilot_failed", error, "Launch Copilot couldn't answer right now. Try again.");
  }
}
