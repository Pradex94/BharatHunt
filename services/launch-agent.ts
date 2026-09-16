import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isMissingTableError } from "@/lib/supabase/errors";
import { SITE_URL } from "@/lib/constants";
import { adapterFor } from "@/lib/launch-agent/adapters";
import { generateLaunchKit, type KitTone } from "@/lib/launch-agent/content";
import type { CopilotContext } from "@/lib/launch-agent/copilot";
import { analyzeLaunchOpportunities, ENGINE_VERSION } from "@/lib/launch-agent/fit";
import { parsePlatformRows, PLATFORM_COLUMNS, type LaunchPlatformRow } from "@/lib/launch-agent/registry";
import { checkRequirements, readinessOf } from "@/lib/launch-agent/requirements";
import { analyzeProductSignals } from "@/lib/launch-agent/signals";
import { preparedStatus } from "@/lib/launch-agent/status";
import { buildLaunchTimeline } from "@/lib/launch-agent/timeline";
import type { CampaignStatus, LaunchPlatform, LaunchProduct, PlatformCampaignStatus } from "@/lib/launch-agent/types";
import { buildUtmUrl } from "@/lib/launch-agent/utm";
import { mergeKit, validateAnalysis, validateKit, validateOverrides, validateRequirementChecks } from "@/lib/launch-agent/validate";
import type { CampaignView, MakerCampaignSummary, PlatformView } from "@/lib/launch-agent/view";
import { launchStats, sortPlatformViews } from "@/lib/launch-agent/view";
import type { Database, Json } from "@/types/database";

/**
 * The Launch Agent's data layer and orchestration.
 *
 * Reads that decide *whose* data this is go through the user-scoped client, so
 * RLS agrees with the application check (a product row only comes back to its
 * creator, or to anyone once published — and `creator_id` is then compared).
 * Writes go through the service role, because none of the Launch Agent tables
 * has a write policy (see 20260915000000_launch_agent.sql). **No function here
 * performs authorisation**: callers — lib/actions/launch-agent.ts and the
 * dashboard pages — must have proved ownership first.
 */

/** Launch Agent tables are missing: the migration has not been applied. */
export class LaunchAgentNotConfiguredError extends Error {
  constructor() {
    super("Launch Agent is not set up on this database yet.");
    this.name = "LaunchAgentNotConfiguredError";
  }
}

const PRODUCT_COLUMNS =
  "id, slug, name, tagline, description, category, pricing_type, website_url, github_url, video_url, hero_image_url, screenshot_urls, tags, tech_stack, platform_links, launch_state, status, published_at, updated_at, creator_id, creator:profiles!products_creator_id_fkey(display_name, username, bio, twitter_handle)";

const CAMPAIGN_COLUMNS =
  "id, product_id, user_id, status, overall_score, analysis, engine_version, product_updated_at, access_tier, attempts, error_message, analyzed_at, updated_at";

const PLATFORM_CAMPAIGN_COLUMNS =
  "id, campaign_id, platform_id, status, automation_level, fit_score, priority, recommended, reason, generated_content, content_overrides, content_variant, requirements, readiness, scheduled_for, submission_url, utm_url, published_url, submitted_at, published_at, last_checked_at, error_message, prepared_at";

/** An ANALYZING row older than this is a run that died; it may be retried. */
const STALE_ANALYSIS_MS = 2 * 60_000;
const MAX_JOB_ATTEMPTS = 3;

export type OwnedProduct = LaunchProduct & { status: string; creatorId: string };

type ProductRow = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string | null;
  category: string;
  pricing_type: string;
  website_url: string | null;
  github_url: string | null;
  video_url: string | null;
  hero_image_url: string | null;
  screenshot_urls: string[] | null;
  tags: string[] | null;
  tech_stack: string[] | null;
  platform_links: Json;
  launch_state: string | null;
  status: string;
  published_at: string | null;
  updated_at: string | null;
  creator_id: string;
  creator: { display_name: string; username: string; bio: string | null; twitter_handle: string | null } | null;
};

export type CampaignRow = {
  id: string;
  product_id: string;
  user_id: string;
  status: string;
  overall_score: number | null;
  analysis: Json;
  engine_version: string | null;
  product_updated_at: string | null;
  access_tier: string;
  attempts: number;
  error_message: string | null;
  analyzed_at: string | null;
  updated_at: string;
};

export type PlatformCampaignRow = {
  id: string;
  campaign_id: string;
  platform_id: string;
  status: string;
  automation_level: string;
  fit_score: number;
  priority: string;
  recommended: boolean;
  reason: string;
  generated_content: Json;
  content_overrides: Json;
  content_variant: number;
  requirements: Json;
  readiness: number;
  scheduled_for: string | null;
  submission_url: string | null;
  utm_url: string | null;
  published_url: string | null;
  submitted_at: string | null;
  published_at: string | null;
  last_checked_at: string | null;
  error_message: string | null;
  prepared_at: string | null;
};

function toLaunchProduct(row: ProductRow): OwnedProduct {
  const links = row.platform_links && typeof row.platform_links === "object" && !Array.isArray(row.platform_links)
    ? Object.fromEntries(Object.entries(row.platform_links).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
    : {};
  // Supabase types an embedded to-one join as an object, but older generated
  // types sometimes surface it as an array; accept both.
  const creator = Array.isArray(row.creator) ? row.creator[0] ?? null : row.creator;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    description: row.description,
    category: row.category,
    pricingType: row.pricing_type,
    websiteUrl: row.website_url,
    githubUrl: row.github_url,
    videoUrl: row.video_url,
    heroImageUrl: row.hero_image_url,
    screenshotUrls: row.screenshot_urls ?? [],
    tags: row.tags ?? [],
    techStack: row.tech_stack ?? [],
    platformLinks: links,
    launchState: row.launch_state,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    makerName: creator?.display_name ?? null,
    makerUsername: creator?.username ?? null,
    makerBio: creator?.bio ?? null,
    makerTwitter: creator?.twitter_handle ?? null,
    bharatHuntUrl: `${SITE_URL}/products/${row.slug}`,
    status: row.status,
    creatorId: row.creator_id,
  };
}

function logEvent(event: string, fields: Record<string, unknown>): void {
  console.error(JSON.stringify({ event, ...fields, at: new Date().toISOString() }));
}

// ── Products ─────────────────────────────────────────────────────────────

/**
 * The product, as the *caller's* session can see it. Returns null when RLS
 * hides it or it does not exist. Ownership is still the caller's check
 * (`authorizeCampaignAccess`) — a published product is visible to everyone.
 */
export async function getProductForSession(lookup: { id: string } | { slug: string }): Promise<OwnedProduct | null> {
  const supabase = createClient();
  let query = supabase.from("products").select(PRODUCT_COLUMNS);
  query = "id" in lookup ? query.eq("id", lookup.id) : query.eq("slug", lookup.slug);
  const { data, error } = await query.maybeSingle();
  if (error) {
    // A malformed uuid from a client is "not found", not a server error.
    if (error.code === "22P02") return null;
    logEvent("launch_agent_product_query_failed", { code: error.code ?? null, message: error.message });
    throw new Error("Could not load that product.");
  }
  return data ? toLaunchProduct(data as unknown as ProductRow) : null;
}

async function getProductByIdService(productId: string): Promise<OwnedProduct | null> {
  const { data, error } = await createServiceClient().from("products").select(PRODUCT_COLUMNS).eq("id", productId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toLaunchProduct(data as unknown as ProductRow) : null;
}

// ── Registry ─────────────────────────────────────────────────────────────

export async function getActivePlatforms(): Promise<LaunchPlatform[]> {
  const { data, error } = await createServiceClient()
    .from("launch_platforms")
    .select(PLATFORM_COLUMNS)
    .eq("active", true)
    .order("priority", { ascending: true });
  if (error) {
    if (isMissingTableError(error)) throw new LaunchAgentNotConfiguredError();
    throw new Error(`Could not load launch platforms: ${error.message}`);
  }
  return parsePlatformRows(data as unknown as LaunchPlatformRow[]);
}

/** Every platform, active or not, raw — for the admin editor. */
export async function getAllPlatformRowsAdmin(): Promise<LaunchPlatformRow[] | null> {
  const { data, error } = await createServiceClient()
    .from("launch_platforms")
    .select(PLATFORM_COLUMNS)
    .order("priority", { ascending: true });
  if (error) {
    if (isMissingTableError(error)) return null;
    throw new Error(`Could not load launch platforms: ${error.message}`);
  }
  return data as unknown as LaunchPlatformRow[];
}

async function getPlatformsByIds(ids: string[]): Promise<LaunchPlatform[]> {
  if (ids.length === 0) return [];
  const { data, error } = await createServiceClient().from("launch_platforms").select(PLATFORM_COLUMNS).in("id", ids);
  if (error) throw new Error(error.message);
  return parsePlatformRows(data as unknown as LaunchPlatformRow[]);
}

// ── Campaigns ────────────────────────────────────────────────────────────

/**
 * The campaign for a product, created if missing. Idempotent under races: the
 * unique index on `product_id` makes a concurrent second insert a no-op, and the
 * row is read back either way.
 */
export async function ensureCampaign(productId: string, userId: string): Promise<CampaignRow> {
  const supabase = createServiceClient();
  const { error: insertError } = await supabase
    .from("launch_campaigns")
    .upsert({ product_id: productId, user_id: userId }, { onConflict: "product_id", ignoreDuplicates: true });
  if (insertError) {
    if (isMissingTableError(insertError)) throw new LaunchAgentNotConfiguredError();
    throw new Error(`Could not create the launch campaign: ${insertError.message}`);
  }
  const { data, error } = await supabase.from("launch_campaigns").select(CAMPAIGN_COLUMNS).eq("product_id", productId).single();
  if (error || !data) throw new Error(`Could not load the launch campaign: ${error?.message ?? "missing"}`);
  return data as CampaignRow;
}

/**
 * The publish hook: queue a campaign for a product that just went live.
 *
 * One insert, no analysis — the approval must not wait for any of the Launch
 * Agent's work. Fail-open like every other post-approval side effect in
 * lib/review.ts: a missing table or a transient error is logged, and the maker
 * still gets a campaign the first time they open Launch Agent.
 */
export async function enqueueLaunchCampaign(productId: string, creatorId: string): Promise<void> {
  try {
    await ensureCampaign(productId, creatorId);
  } catch (error) {
    logEvent("launch_agent_enqueue_failed", {
      productId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function loadPlatformCampaigns(campaignId: string): Promise<PlatformCampaignRow[]> {
  const { data, error } = await createServiceClient()
    .from("launch_platform_campaigns")
    .select(PLATFORM_CAMPAIGN_COLUMNS)
    .eq("campaign_id", campaignId);
  if (error) throw new Error(`Could not load platform campaigns: ${error.message}`);
  return (data ?? []) as PlatformCampaignRow[];
}

const PREPARED_STATES: PlatformCampaignStatus[] = ["READY", "READY_TO_SUBMIT", "MISSING_INFORMATION", "USER_ACTION_REQUIRED"];

/** Re-check a prepared row against the current product without touching the kit. */
function recheckRow(row: PlatformCampaignRow, platform: LaunchPlatform, product: LaunchProduct, scheduledFor: string | null) {
  const kit = row.prepared_at ? mergeKit(row.generated_content, row.content_overrides) : null;
  const checks = checkRequirements(platform, product, kit, { hasScheduledDate: Boolean(scheduledFor) });
  const status = row.prepared_at && PREPARED_STATES.includes(row.status as PlatformCampaignStatus)
    ? preparedStatus(row.automation_level as LaunchPlatform["automationLevel"], checks)
    : (row.status as PlatformCampaignStatus);
  return { checks, readiness: row.prepared_at ? readinessOf(checks, true) : 0, status };
}

/**
 * Analyse a campaign: score every active platform, write the recommendations and
 * the suggested timeline, and re-check anything already prepared.
 *
 * Guarded by a compare-and-set on `status`, so two tabs, a retry and the job
 * endpoint cannot analyse the same campaign at once. Existing progress is never
 * discarded — a re-analysis updates fit and reasons, and keeps the maker's kit,
 * edits, dates and submission state.
 */
export async function runCampaignAnalysis(
  campaign: CampaignRow,
  product: OwnedProduct,
  options: { force?: boolean; platforms?: LaunchPlatform[] } = {},
): Promise<CampaignRow> {
  const supabase = createServiceClient();
  const staleBefore = new Date(Date.now() - STALE_ANALYSIS_MS).toISOString();
  const claimable = options.force ? "NOT_STARTED,FAILED,READY" : "NOT_STARTED,FAILED";

  const { data: claimed, error: claimError } = await supabase
    .from("launch_campaigns")
    .update({ status: "ANALYZING", attempts: campaign.attempts + 1, error_message: null })
    .eq("id", campaign.id)
    .or(`status.in.(${claimable}),and(status.eq.ANALYZING,updated_at.lt.${staleBefore})`)
    .select(CAMPAIGN_COLUMNS)
    .maybeSingle();
  if (claimError) throw new Error(`Could not start the analysis: ${claimError.message}`);
  if (!claimed) {
    // Someone else holds it, or it is already analysed. Return what is there.
    const { data } = await supabase.from("launch_campaigns").select(CAMPAIGN_COLUMNS).eq("id", campaign.id).single();
    return (data as CampaignRow) ?? campaign;
  }

  try {
    const platforms = options.platforms ?? (await getActivePlatforms());
    const now = new Date();
    const analysis = analyzeLaunchOpportunities(product, platforms, now);
    const timeline = buildLaunchTimeline(analysis.recommendations, platforms, { publishedAt: product.publishedAt, now });
    const dateBySlug = new Map(timeline.entries.map((entry) => [entry.slug, entry.date]));
    const platformBySlug = new Map(platforms.map((platform) => [platform.slug, platform]));
    const existing = new Map((await loadPlatformCampaigns(campaign.id)).map((row) => [row.platform_id, row]));

    const inserts = [];
    for (const rec of analysis.recommendations) {
      const platform = platformBySlug.get(rec.slug)!;
      const row = existing.get(platform.id);
      const utmUrl = buildUtmUrl(product.websiteUrl ?? product.bharatHuntUrl, platform.slug);
      if (!row) {
        inserts.push({
          campaign_id: campaign.id,
          platform_id: platform.id,
          status: "NOT_STARTED",
          automation_level: platform.automationLevel,
          fit_score: rec.fitScore,
          priority: rec.priority,
          recommended: rec.recommended,
          reason: rec.reason,
          scheduled_for: dateBySlug.get(rec.slug) ?? null,
          submission_url: platform.submissionUrl ?? platform.websiteUrl,
          utm_url: utmUrl,
        });
        continue;
      }
      const scheduledFor = row.scheduled_for ?? dateBySlug.get(rec.slug) ?? null;
      const recheck = recheckRow(row, platform, product, scheduledFor);
      const { error } = await supabase
        .from("launch_platform_campaigns")
        .update({
          fit_score: rec.fitScore,
          priority: rec.priority,
          recommended: rec.recommended,
          reason: rec.reason,
          scheduled_for: scheduledFor,
          utm_url: utmUrl,
          requirements: recheck.checks as unknown as Json,
          readiness: recheck.readiness,
          status: recheck.status,
          last_checked_at: now.toISOString(),
        })
        .eq("id", row.id);
      if (error) throw new Error(`Could not update ${platform.name}: ${error.message}`);
    }
    if (inserts.length > 0) {
      // ignoreDuplicates: a concurrent run that slipped past the claim cannot
      // create a second row for the same platform.
      const { error } = await supabase
        .from("launch_platform_campaigns")
        .upsert(inserts, { onConflict: "campaign_id,platform_id", ignoreDuplicates: true });
      if (error) throw new Error(`Could not save recommendations: ${error.message}`);
    }

    const { data: done, error: doneError } = await supabase
      .from("launch_campaigns")
      .update({
        status: "READY",
        overall_score: analysis.productFit,
        analysis: analysis as unknown as Json,
        engine_version: ENGINE_VERSION,
        product_updated_at: product.updatedAt,
        analyzed_at: now.toISOString(),
        error_message: null,
      })
      .eq("id", campaign.id)
      .select(CAMPAIGN_COLUMNS)
      .single();
    if (doneError || !done) throw new Error(doneError?.message ?? "Campaign vanished");
    return done as CampaignRow;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logEvent("launch_agent_analysis_failed", { campaignId: campaign.id, message });
    const { data: failed } = await supabase
      .from("launch_campaigns")
      .update({ status: "FAILED", error_message: message.slice(0, 500) })
      .eq("id", campaign.id)
      .select(CAMPAIGN_COLUMNS)
      .maybeSingle();
    return (failed as CampaignRow) ?? { ...campaign, status: "FAILED", error_message: message };
  }
}

/** Campaign ready to render: created and analysed on first open. */
export async function getOrAnalyzeCampaign(product: OwnedProduct): Promise<CampaignRow> {
  const campaign = await ensureCampaign(product.id, product.creatorId);
  const staleRun = campaign.status === "ANALYZING" && Date.now() - new Date(campaign.updated_at).getTime() > STALE_ANALYSIS_MS;
  const outdatedEngine = campaign.status === "READY" && campaign.engine_version !== ENGINE_VERSION;
  if (campaign.status === "NOT_STARTED" || staleRun) return runCampaignAnalysis(campaign, product);
  if (outdatedEngine) return runCampaignAnalysis(campaign, product, { force: true });
  return campaign;
}

// ── Preparing a platform ─────────────────────────────────────────────────

async function getPlatformCampaign(campaignId: string, platformId: string): Promise<PlatformCampaignRow | null> {
  const { data, error } = await createServiceClient()
    .from("launch_platform_campaigns")
    .select(PLATFORM_CAMPAIGN_COLUMNS)
    .eq("campaign_id", campaignId)
    .eq("platform_id", platformId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as PlatformCampaignRow | null;
}

/**
 * The one-click workflow: analyse (if needed), generate the platform kit, check
 * requirements, save, and report readiness. `regenerate` rotates the phrasing;
 * the maker's edited fields are kept either way.
 */
export async function preparePlatformCampaign(
  product: OwnedProduct,
  platform: LaunchPlatform,
  options: { regenerate?: boolean } = {},
): Promise<PlatformCampaignRow> {
  const supabase = createServiceClient();
  let campaign = await getOrAnalyzeCampaign(product);
  if (campaign.status === "FAILED") throw new Error(campaign.error_message ?? "Analysis failed.");

  let row = await getPlatformCampaign(campaign.id, platform.id);
  if (!row) {
    // Preparing a platform the analysis did not write (added to the registry
    // since, or activated later): analyse again so it gets a fit score first.
    campaign = await runCampaignAnalysis(campaign, product, { force: true });
    row = await getPlatformCampaign(campaign.id, platform.id);
    if (!row) throw new Error(`${platform.name} is not available right now.`);
  }

  const variant = options.regenerate ? row.content_variant + 1 : row.content_variant;
  const signals = analyzeProductSignals(product);
  const kit = generateLaunchKit(product, platform, signals, { variant });
  const utmUrl = buildUtmUrl(product.websiteUrl ?? product.bharatHuntUrl, platform.slug);
  const adapter = adapterFor(platform);
  const merged = { ...kit, ...validateOverrides(row.content_overrides) };
  const prepared = adapter.prepareSubmission(platform, product, merged, { utmUrl, hasScheduledDate: Boolean(row.scheduled_for) });

  // Progress the maker reported is theirs; preparing again never rolls it back.
  const keepStatus = row.status === "SUBMITTED" || row.status === "PUBLISHED";
  const { data, error } = await supabase
    .from("launch_platform_campaigns")
    .update({
      generated_content: kit as unknown as Json,
      content_variant: variant,
      automation_level: platform.automationLevel,
      requirements: prepared.checks as unknown as Json,
      readiness: prepared.readiness,
      status: keepStatus ? row.status : prepared.status,
      submission_url: prepared.submissionUrl,
      utm_url: utmUrl,
      prepared_at: new Date().toISOString(),
      last_checked_at: new Date().toISOString(),
      error_message: null,
    })
    .eq("id", row.id)
    .select(PLATFORM_CAMPAIGN_COLUMNS)
    .single();
  if (error || !data) throw new Error(`Could not save the launch kit: ${error?.message ?? "missing"}`);
  return data as PlatformCampaignRow;
}

export async function getPlatformCampaignForProduct(product: OwnedProduct, platform: LaunchPlatform) {
  const campaign = await ensureCampaign(product.id, product.creatorId);
  return { campaign, row: await getPlatformCampaign(campaign.id, platform.id) };
}

export async function updatePlatformCampaign(rowId: string, patch: Record<string, unknown>): Promise<PlatformCampaignRow> {
  const { data, error } = await createServiceClient()
    .from("launch_platform_campaigns")
    // Callers pass validated values; JSON columns arrive as plain arrays/objects.
    .update(patch as Database["public"]["Tables"]["launch_platform_campaigns"]["Update"])
    .eq("id", rowId)
    .select(PLATFORM_CAMPAIGN_COLUMNS)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Update failed");
  return data as PlatformCampaignRow;
}

/** Re-check requirements after an edit or a date change, keeping reported progress. */
export async function recheckPlatformCampaign(row: PlatformCampaignRow, platform: LaunchPlatform, product: OwnedProduct): Promise<PlatformCampaignRow> {
  const recheck = recheckRow(row, platform, product, row.scheduled_for);
  return updatePlatformCampaign(row.id, {
    requirements: recheck.checks,
    readiness: recheck.readiness,
    status: recheck.status,
    last_checked_at: new Date().toISOString(),
  });
}

// ── Views ────────────────────────────────────────────────────────────────

function productGaps(product: LaunchProduct): string[] {
  const signals = analyzeProductSignals(product);
  const gaps: string[] = [];
  if (!signals.completeness.hasWebsite) gaps.push("a website link");
  if (!signals.completeness.hasLogo) gaps.push("a logo");
  if (signals.completeness.screenshotCount === 0) gaps.push("screenshots");
  if (signals.completeness.descriptionWords < 40) gaps.push("a longer description (what it does and who it's for)");
  if (!signals.completeness.hasVideo) gaps.push("a short demo video");
  return gaps;
}

export async function buildCampaignView(product: OwnedProduct, campaign: CampaignRow): Promise<CampaignView> {
  const rows = campaign.status === "READY" || campaign.status === "FAILED" ? await loadPlatformCampaigns(campaign.id) : [];
  const active = await getActivePlatforms();
  const activeIds = new Set(active.map((platform) => platform.id));
  // A platform an admin later disabled still shows if the maker has progress on it.
  const extra = await getPlatformsByIds(rows.map((row) => row.platform_id).filter((id) => !activeIds.has(id)));
  const rowByPlatform = new Map(rows.map((row) => [row.platform_id, row]));

  const platforms: PlatformView[] = [...active, ...extra]
    .filter((platform) => platform.active || rowByPlatform.get(platform.id)?.prepared_at)
    .map((platform) => {
      const row = rowByPlatform.get(platform.id);
      const overrides = row ? validateOverrides(row.content_overrides) : {};
      return {
        platformId: platform.id,
        slug: platform.slug,
        name: platform.name,
        description: platform.description,
        websiteUrl: platform.websiteUrl,
        guidelinesUrl: platform.guidelinesUrl,
        category: platform.category,
        automationLevel: row ? (row.automation_level as LaunchPlatform["automationLevel"]) : platform.automationLevel,
        instructions: platform.instructions,
        launchNote: platform.launchRules.note ?? null,
        requirementsConfig: platform.requirements,
        campaign: row
          ? {
              id: row.id,
              status: row.status as PlatformCampaignStatus,
              fitScore: row.fit_score,
              priority: row.priority as "HIGH" | "MEDIUM" | "LOW",
              recommended: row.recommended,
              reason: row.reason,
              readiness: row.readiness,
              checks: validateRequirementChecks(row.requirements),
              kit: row.prepared_at ? { ...validateKit(row.generated_content), ...overrides } : null,
              editedFields: Object.keys(overrides),
              scheduledFor: row.scheduled_for,
              submissionUrl: row.submission_url,
              utmUrl: row.utm_url,
              publishedUrl: row.published_url,
              submittedAt: row.submitted_at,
              publishedAt: row.published_at,
              errorMessage: row.error_message,
              preparedAt: row.prepared_at,
            }
          : null,
      };
    });

  const productChanged = Boolean(
    campaign.product_updated_at && product.updatedAt && new Date(product.updatedAt) > new Date(campaign.product_updated_at),
  );

  return {
    product: {
      id: product.id,
      slug: product.slug,
      name: product.name,
      tagline: product.tagline,
      heroImageUrl: product.heroImageUrl,
      websiteUrl: product.websiteUrl,
      publishedAt: product.publishedAt,
      bharatHuntUrl: product.bharatHuntUrl,
    },
    campaign: {
      id: campaign.id,
      status: campaign.status as CampaignStatus,
      overallScore: campaign.overall_score,
      analysis: validateAnalysis(campaign.analysis),
      analyzedAt: campaign.analyzed_at,
      errorMessage: campaign.status === "FAILED" ? campaign.error_message : null,
      productChanged,
    },
    platforms: sortPlatformViews(platforms),
    productGaps: productGaps(product),
  };
}

export function copilotContextFor(view: CampaignView, product: OwnedProduct, platforms: LaunchPlatform[]): CopilotContext {
  const signals = analyzeProductSignals(product);
  const bySlug = new Map(platforms.map((platform) => [platform.slug, platform]));
  return {
    productName: product.name,
    analysis: view.campaign.analysis,
    productGaps: view.productGaps,
    platforms: view.platforms
      .filter((platform) => platform.campaign)
      .map((platform) => ({
        slug: platform.slug,
        name: platform.name,
        automationLevel: platform.automationLevel,
        status: platform.campaign!.status,
        fitScore: platform.campaign!.fitScore,
        recommended: platform.campaign!.recommended,
        reason: platform.campaign!.reason,
        readiness: platform.campaign!.readiness,
        checks: platform.campaign!.checks,
        kit: platform.campaign!.kit,
        scheduledFor: platform.campaign!.scheduledFor,
        submissionUrl: platform.campaign!.submissionUrl,
      })),
    rewrite: (slug: string) => {
      const platform = bySlug.get(slug);
      if (!platform) return null;
      const tone: KitTone = "bold";
      return generateLaunchKit(product, platform, signals, { tone, variant: 1 });
    },
  };
}

/** Every product a maker owns, with its campaign summary. */
export async function listMakerCampaigns(userId: string): Promise<{ items: MakerCampaignSummary[]; configured: boolean }> {
  const supabase = createClient();
  const { data: products, error } = await supabase
    .from("products")
    .select("id, slug, name, tagline, hero_image_url, status")
    .eq("creator_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    logEvent("launch_agent_products_query_failed", { code: error.code ?? null, message: error.message });
    throw new Error("Failed to load your products.");
  }

  // Through the user-scoped client: RLS returns only this maker's campaigns.
  const { data: campaigns, error: campaignError } = await supabase
    .from("launch_campaigns")
    .select("id, product_id, status, overall_score")
    .eq("user_id", userId);
  if (campaignError && !isMissingTableError(campaignError)) {
    logEvent("launch_agent_campaigns_query_failed", { code: campaignError.code ?? null, message: campaignError.message });
  }
  const configured = !campaignError || !isMissingTableError(campaignError);
  const campaignByProduct = new Map((campaigns ?? []).map((campaign) => [campaign.product_id, campaign]));

  const campaignIds = (campaigns ?? []).map((campaign) => campaign.id);
  const { data: platformRows } = campaignIds.length
    ? await supabase.from("launch_platform_campaigns").select("campaign_id, status, recommended, readiness, prepared_at").in("campaign_id", campaignIds)
    : { data: [] as { campaign_id: string; status: string; recommended: boolean; readiness: number; prepared_at: string | null }[] };

  const items = (products ?? []).map((product) => {
    const campaign = campaignByProduct.get(product.id);
    const rows = (platformRows ?? []).filter((row) => row.campaign_id === campaign?.id);
    const recommended = rows.filter((row) => row.recommended);
    return {
      productId: product.id,
      slug: product.slug,
      name: product.name,
      tagline: product.tagline,
      heroImageUrl: product.hero_image_url,
      productStatus: product.status,
      campaignStatus: (campaign?.status as CampaignStatus | undefined) ?? null,
      overallScore: campaign?.overall_score ?? null,
      recommended: recommended.length,
      averageReadiness: recommended.length
        ? Math.round(recommended.reduce((sum, row) => sum + (row.prepared_at ? row.readiness : 0), 0) / recommended.length)
        : 0,
      published: rows.filter((row) => row.status === "PUBLISHED").length,
    };
  });
  return { items, configured };
}

// ── Job queue ────────────────────────────────────────────────────────────

/**
 * Drain queued campaigns: the background half of "publish returns immediately".
 * Called by the secret-gated job endpoint on the existing schedule. Bounded per
 * run; a campaign that keeps failing stops being retried after
 * {@link MAX_JOB_ATTEMPTS} and waits for the maker's own "Try again".
 */
export async function processQueuedCampaigns(limit = 10): Promise<{ attempted: number; ready: number; failed: number }> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("launch_campaigns")
    .select(CAMPAIGN_COLUMNS)
    .in("status", ["NOT_STARTED", "FAILED"])
    .lt("attempts", MAX_JOB_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) {
    if (isMissingTableError(error)) throw new LaunchAgentNotConfiguredError();
    throw new Error(error.message);
  }

  const platforms = await getActivePlatforms();
  const result = { attempted: 0, ready: 0, failed: 0 };
  for (const campaign of (data ?? []) as CampaignRow[]) {
    result.attempted += 1;
    const product = await getProductByIdService(campaign.product_id).catch(() => null);
    if (!product || product.status !== "published") {
      result.failed += 1;
      continue;
    }
    const done = await runCampaignAnalysis(campaign, product, { platforms });
    if (done.status === "READY") result.ready += 1;
    else result.failed += 1;
  }
  return result;
}

export { launchStats };
