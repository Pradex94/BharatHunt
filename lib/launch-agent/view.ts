/**
 * The serialisable shapes the Launch Agent pages hand to client components,
 * plus the pure summaries computed from them. No server imports — the campaign
 * view is built in services/launch-agent.ts and rendered in
 * components/launch-agent/.
 */

import type {
  AutomationLevel,
  CampaignStatus,
  LaunchAnalysis,
  LaunchKit,
  PlatformCampaignStatus,
  PlatformCategory,
  PlatformRequirement,
  Priority,
  RequirementCheck,
} from "./types.ts";

export type PlatformView = {
  platformId: string;
  slug: string;
  name: string;
  description: string;
  websiteUrl: string;
  guidelinesUrl: string | null;
  category: PlatformCategory;
  automationLevel: AutomationLevel;
  instructions: string;
  launchNote: string | null;
  requirementsConfig: PlatformRequirement[];
  /** null until the analysis wrote a row for this platform. */
  campaign: {
    id: string;
    status: PlatformCampaignStatus;
    fitScore: number;
    priority: Priority;
    recommended: boolean;
    reason: string;
    readiness: number;
    checks: RequirementCheck[];
    kit: LaunchKit | null;
    /** Fields the maker has edited (their text is already merged into `kit`). */
    editedFields: string[];
    scheduledFor: string | null;
    submissionUrl: string | null;
    utmUrl: string | null;
    publishedUrl: string | null;
    submittedAt: string | null;
    publishedAt: string | null;
    errorMessage: string | null;
    preparedAt: string | null;
  } | null;
};

export type CampaignView = {
  product: {
    id: string;
    slug: string;
    name: string;
    tagline: string;
    heroImageUrl: string | null;
    websiteUrl: string | null;
    publishedAt: string | null;
    bharatHuntUrl: string;
  };
  campaign: {
    id: string;
    status: CampaignStatus;
    overallScore: number | null;
    analysis: LaunchAnalysis | null;
    analyzedAt: string | null;
    errorMessage: string | null;
    /** The listing changed after the analysis ran. */
    productChanged: boolean;
  };
  platforms: PlatformView[];
  /** Listing gaps that affect every platform. */
  productGaps: string[];
};

export type LaunchStats = {
  recommended: number;
  prepared: number;
  submitted: number;
  published: number;
  averageReadiness: number;
};

const PREPARED: PlatformCampaignStatus[] = ["READY", "READY_TO_SUBMIT", "MISSING_INFORMATION", "USER_ACTION_REQUIRED", "SUBMITTED", "PUBLISHED", "FAILED"];

export function launchStats(platforms: PlatformView[]): LaunchStats {
  const rows = platforms.map((platform) => platform.campaign).filter((row): row is NonNullable<PlatformView["campaign"]> => row !== null);
  const recommended = rows.filter((row) => row.recommended);
  const prepared = rows.filter((row) => PREPARED.includes(row.status) && row.preparedAt);
  return {
    recommended: recommended.length,
    prepared: prepared.length,
    submitted: rows.filter((row) => row.status === "SUBMITTED" || row.status === "PUBLISHED").length,
    published: rows.filter((row) => row.status === "PUBLISHED").length,
    averageReadiness:
      recommended.length > 0 ? Math.round(recommended.reduce((sum, row) => sum + (row.preparedAt ? row.readiness : 0), 0) / recommended.length) : 0,
  };
}

/** Recommended first by fit; then anything the maker has already worked on; then the rest. */
export function sortPlatformViews(platforms: PlatformView[]): PlatformView[] {
  const rank = (platform: PlatformView) => {
    if (!platform.campaign) return 3;
    if (platform.campaign.recommended) return 0;
    return platform.campaign.preparedAt ? 1 : 2;
  };
  return [...platforms].sort(
    (a, b) => rank(a) - rank(b) || (b.campaign?.fitScore ?? 0) - (a.campaign?.fitScore ?? 0) || a.name.localeCompare(b.name),
  );
}

export type MakerCampaignSummary = {
  productId: string;
  slug: string;
  name: string;
  tagline: string;
  heroImageUrl: string | null;
  productStatus: string;
  campaignStatus: CampaignStatus | null;
  overallScore: number | null;
  recommended: number;
  averageReadiness: number;
  published: number;
};
