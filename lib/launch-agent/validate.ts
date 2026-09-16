/**
 * Structured-output validation.
 *
 * Everything the engine produces is stored as JSON and read back later — by a
 * newer build, possibly after an admin edited the registry, possibly from a row
 * written by a future generator. The UI renders only what passes through here,
 * so a malformed row degrades to an empty section instead of a crash.
 */

import { AUTOMATION_LEVELS, PRIORITIES, type LaunchAnalysis, type LaunchKit, type PlatformRecommendation, type RequirementCheck } from "./types.ts";
import { cleanLine, cleanText, truncate } from "./text.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function score(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : null;
}

function str(value: unknown, max: number, multiline = false): string {
  if (typeof value !== "string") return "";
  return truncate(multiline ? cleanText(value) : cleanLine(value), max);
}

function strList(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => truncate(cleanLine(item), maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

export function validateRecommendation(value: unknown): PlatformRecommendation | null {
  if (!isRecord(value)) return null;
  const fitScore = score(value.fitScore);
  const priority = PRIORITIES.find((item) => item === value.priority);
  const automationLevel = AUTOMATION_LEVELS.find((item) => item === value.automationLevel);
  if (fitScore === null || !priority || !automationLevel) return null;
  if (typeof value.slug !== "string" || typeof value.platform !== "string") return null;
  return {
    platformId: typeof value.platformId === "string" ? value.platformId : "",
    slug: value.slug,
    platform: cleanLine(value.platform),
    fitScore,
    priority,
    recommended: value.recommended === true,
    reason: str(value.reason, 300),
    automationLevel,
    matchedTags: strList(value.matchedTags, 12, 40),
  };
}

export function validateAnalysis(value: unknown): LaunchAnalysis | null {
  if (!isRecord(value)) return null;
  const productFit = score(value.productFit);
  if (productFit === null) return null;
  const breakdown = isRecord(value.breakdown) ? value.breakdown : {};
  return {
    productFit,
    summary: str(value.summary, 400),
    matchedAudience: strList(value.matchedAudience, 6, 40),
    breakdown: {
      platformFit: score(breakdown.platformFit) ?? 0,
      listingCompleteness: score(breakdown.listingCompleteness) ?? 0,
    },
    recommendations: Array.isArray(value.recommendations)
      ? value.recommendations.map(validateRecommendation).filter((rec): rec is PlatformRecommendation => rec !== null)
      : [],
    engineVersion: typeof value.engineVersion === "string" ? value.engineVersion.slice(0, 40) : "unknown",
  };
}

/** Per-field caps. Generous enough for a real post, small enough to stop a runaway. */
export const KIT_LIMITS = {
  title: 120,
  tagline: 160,
  shortDescription: 300,
  longDescription: 3000,
  founderDescription: 600,
  launchStory: 3000,
  firstComment: 2500,
  cta: 80,
  socialPost: 600,
  linkedinPost: 3000,
  redditTitle: 300,
  redditBody: 4000,
  emailSubject: 150,
  emailBody: 4000,
} as const;

export const KIT_TEXT_FIELDS = Object.keys(KIT_LIMITS) as (keyof typeof KIT_LIMITS)[];
export const KIT_LIST_FIELDS = ["categories", "keywords", "hashtags", "submissionNotes", "xThread"] as const;

const MULTILINE = new Set<string>(["longDescription", "launchStory", "firstComment", "linkedinPost", "redditBody", "emailBody", "socialPost", "founderDescription"]);

export function emptyKit(): LaunchKit {
  return {
    title: "",
    tagline: "",
    shortDescription: "",
    longDescription: "",
    founderDescription: "",
    launchStory: "",
    firstComment: "",
    categories: [],
    keywords: [],
    cta: "",
    socialPost: "",
    xThread: [],
    linkedinPost: "",
    redditTitle: "",
    redditBody: "",
    emailSubject: "",
    emailBody: "",
    hashtags: [],
    submissionNotes: [],
  };
}

/** A complete kit from anything; unknown or malformed fields become empty. */
export function validateKit(value: unknown): LaunchKit {
  const kit = emptyKit();
  if (!isRecord(value)) return kit;
  for (const field of KIT_TEXT_FIELDS) {
    kit[field] = str(value[field], KIT_LIMITS[field], MULTILINE.has(field));
  }
  kit.categories = strList(value.categories, 8, 60);
  kit.keywords = strList(value.keywords, 15, 60);
  kit.hashtags = strList(value.hashtags, 10, 40).filter((tag) => /^#[A-Za-z0-9_]+$/.test(tag));
  kit.submissionNotes = strList(value.submissionNotes, 12, 300);
  kit.xThread = Array.isArray(value.xThread)
    ? value.xThread
        .filter((item): item is string => typeof item === "string")
        .map((item) => truncate(cleanText(item), 280))
        .filter(Boolean)
        .slice(0, 8)
    : [];
  return kit;
}

/**
 * Only fields a maker may override, each validated like generated content.
 * List fields are accepted as newline- or comma-separated text.
 */
export function validateOverrides(value: unknown): Partial<LaunchKit> {
  if (!isRecord(value)) return {};
  const out: Partial<LaunchKit> = {};
  for (const field of KIT_TEXT_FIELDS) {
    if (typeof value[field] === "string") out[field] = str(value[field], KIT_LIMITS[field], MULTILINE.has(field));
  }
  for (const field of KIT_LIST_FIELDS) {
    const raw = value[field];
    const items = typeof raw === "string" ? raw.split(field === "xThread" ? /\n{2,}/ : /\n|,/) : raw;
    if (!Array.isArray(items)) continue;
    if (field === "xThread") {
      out.xThread = items
        .filter((item): item is string => typeof item === "string")
        .map((item) => truncate(cleanText(item), 280))
        .filter(Boolean)
        .slice(0, 8);
    } else if (field === "hashtags") {
      out.hashtags = strList(items, 10, 40)
        .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`))
        .filter((tag) => /^#[A-Za-z0-9_]+$/.test(tag));
    } else {
      out[field] = strList(items, field === "keywords" ? 15 : 12, 300);
    }
  }
  return out;
}

/** Generated kit with the maker's edits laid on top. */
export function mergeKit(generated: unknown, overrides: unknown): LaunchKit {
  return { ...validateKit(generated), ...validateOverrides(overrides) };
}

export function validateRequirementChecks(value: unknown): RequirementCheck[] {
  if (!Array.isArray(value)) return [];
  const out: RequirementCheck[] = [];
  for (const item of value.slice(0, 40)) {
    if (!isRecord(item) || typeof item.key !== "string" || typeof item.label !== "string") continue;
    const status = item.status === "ok" || item.status === "missing" || item.status === "manual" ? item.status : null;
    if (!status) continue;
    const fix = item.fix === "edit_product" || item.fix === "generate" || item.fix === "platform" ? item.fix : null;
    out.push({
      key: item.key,
      label: cleanLine(item.label),
      required: item.required !== false,
      status,
      fix,
      hint: typeof item.hint === "string" ? cleanLine(item.hint) : null,
      verified: item.verified === true,
    });
  }
  return out;
}
