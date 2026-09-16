/**
 * Launch Agent domain types.
 *
 * Framework-agnostic and dependency-free, like the rest of `lib/launch-agent/`,
 * so the whole engine runs under `npm test` in plain Node and is safe to import
 * from a client component.
 */

export const AUTOMATION_LEVELS = ["AUTOMATED", "ASSISTED", "AI_PREPARED"] as const;
export type AutomationLevel = (typeof AUTOMATION_LEVELS)[number];

export const CAMPAIGN_STATUSES = ["NOT_STARTED", "ANALYZING", "READY", "FAILED"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const PLATFORM_CAMPAIGN_STATUSES = [
  "NOT_STARTED",
  "ANALYZING",
  "READY",
  "MISSING_INFORMATION",
  "READY_TO_SUBMIT",
  "SUBMITTED",
  "PUBLISHED",
  "FAILED",
  "USER_ACTION_REQUIRED",
] as const;
export type PlatformCampaignStatus = (typeof PLATFORM_CAMPAIGN_STATUSES)[number];

export const PRIORITIES = ["HIGH", "MEDIUM", "LOW"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PLATFORM_CATEGORIES = [
  "launch_platform",
  "community",
  "directory",
  "developer",
  "newsletter",
] as const;
export type PlatformCategory = (typeof PLATFORM_CATEGORIES)[number];

export const CONTENT_STYLES = [
  "producthunt",
  "show_hn",
  "reddit",
  "peerlist",
  "community_story",
  "directory",
  "devtools",
] as const;
export type ContentStyle = (typeof CONTENT_STYLES)[number];

/** One line of a platform's requirements, as an admin configures it. */
export type PlatformRequirement = {
  key: string;
  label: string;
  required: boolean;
  /** A step the maker takes on the platform itself; we cannot check it. */
  manual?: boolean;
  /** Confirmed on the platform's own site (see the migration's seed note). */
  verified?: boolean;
  note?: string;
};

export type FitRules = {
  /** Extra points when the product carries the tag. */
  tagWeights?: Record<string, number>;
  /** Points removed when the product carries the tag. */
  penalizeTags?: Record<string, number>;
  /** The platform is only relevant if the product has at least one of these. */
  requiredAnyTags?: string[];
  /** A product with no website cannot be launched here at all. */
  requiresWebsite?: boolean;
  /** Suits pre-launch / very recent products. */
  prefersEarlyStage?: boolean;
  /** Visual launch — listing assets move the score. */
  assetSensitive?: boolean;
};

export type LaunchRules = {
  /** Order in the suggested sequence: 1 = queue early … 5 = last. */
  phase?: number;
  /** Allowed launch weekdays, 0 = Sunday (UTC). Empty = any day. */
  weekdays?: number[];
  note?: string;
};

/** A registry entry, validated (lib/launch-agent/registry.ts). */
export type LaunchPlatform = {
  id: string;
  slug: string;
  name: string;
  description: string;
  websiteUrl: string;
  submissionUrl: string | null;
  guidelinesUrl: string | null;
  category: PlatformCategory;
  automationLevel: AutomationLevel;
  apiSupported: boolean;
  requiresUserAction: boolean;
  active: boolean;
  requirements: PlatformRequirement[];
  supportedProductTypes: string[];
  audienceTags: string[];
  fitRules: FitRules;
  contentStyle: ContentStyle;
  launchRules: LaunchRules;
  instructions: string;
  adapter: string;
  priority: number;
  verifiedAt: string | null;
};

/** The product fields the engine reads. Everything here is maker-supplied DATA. */
export type LaunchProduct = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string | null;
  category: string;
  pricingType: string;
  websiteUrl: string | null;
  githubUrl: string | null;
  videoUrl: string | null;
  heroImageUrl: string | null;
  screenshotUrls: string[];
  tags: string[];
  techStack: string[];
  platformLinks: Record<string, string>;
  launchState: string | null;
  publishedAt: string | null;
  updatedAt: string | null;
  makerName: string | null;
  makerUsername: string | null;
  makerBio: string | null;
  makerTwitter: string | null;
  /** Absolute BharatHunt page URL. */
  bharatHuntUrl: string;
};

/** What the engine infers about a product before looking at any platform. */
export type ProductSignals = {
  tags: string[];
  completeness: {
    score: number;
    hasWebsite: boolean;
    hasLogo: boolean;
    screenshotCount: number;
    hasVideo: boolean;
    descriptionWords: number;
    hasGithub: boolean;
    hasMakerInfo: boolean;
    hasTopics: boolean;
  };
  /** Days since the BharatHunt publish, or null if unknown. */
  ageDays: number | null;
};

export type PlatformRecommendation = {
  platformId: string;
  slug: string;
  platform: string;
  fitScore: number;
  priority: Priority;
  recommended: boolean;
  reason: string;
  automationLevel: AutomationLevel;
  matchedTags: string[];
};

export type LaunchAnalysis = {
  productFit: number;
  summary: string;
  matchedAudience: string[];
  breakdown: { platformFit: number; listingCompleteness: number };
  recommendations: PlatformRecommendation[];
  engineVersion: string;
};

export type LaunchKit = {
  title: string;
  tagline: string;
  shortDescription: string;
  longDescription: string;
  founderDescription: string;
  launchStory: string;
  firstComment: string;
  categories: string[];
  keywords: string[];
  cta: string;
  socialPost: string;
  xThread: string[];
  linkedinPost: string;
  redditTitle: string;
  redditBody: string;
  emailSubject: string;
  emailBody: string;
  hashtags: string[];
  submissionNotes: string[];
};

export type LaunchKitField = keyof LaunchKit;

export type RequirementCheckStatus = "ok" | "missing" | "manual";

export type RequirementCheck = {
  key: string;
  label: string;
  required: boolean;
  status: RequirementCheckStatus;
  /** How the gap gets closed. */
  fix: "edit_product" | "generate" | "platform" | null;
  hint: string | null;
  verified: boolean;
};

export type TimelineEntry = {
  slug: string;
  platform: string;
  date: string;
  day: number;
  label: string;
};
