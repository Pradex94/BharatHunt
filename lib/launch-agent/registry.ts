/**
 * The platform registry, as the application sees it.
 *
 * Rows live in `launch_platforms` and are edited by admins without a deploy,
 * so nothing downstream may trust their shape: `parsePlatformRow` validates
 * every field and returns null for a row it cannot use, and
 * `validatePlatformInput` is the same rule applied to what the admin form
 * posts. A broken JSON column costs one platform, never the page.
 */

import {
  AUTOMATION_LEVELS,
  CONTENT_STYLES,
  PLATFORM_CATEGORIES,
  type AutomationLevel,
  type ContentStyle,
  type FitRules,
  type LaunchPlatform,
  type LaunchRules,
  type PlatformCategory,
  type PlatformRequirement,
} from "./types.ts";
import { cleanLine, cleanText } from "./text.ts";

export type LaunchPlatformRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  website_url: string;
  submission_url: string | null;
  guidelines_url: string | null;
  category: string;
  automation_level: string;
  api_supported: boolean;
  requires_user_action: boolean;
  active: boolean;
  requirements: unknown;
  supported_product_types: string[] | null;
  audience_tags: string[] | null;
  fit_rules: unknown;
  content_style: string;
  launch_rules: unknown;
  instructions: string | null;
  adapter: string | null;
  priority: number;
  verified_at: string | null;
};

export const PLATFORM_COLUMNS =
  "id, slug, name, description, website_url, submission_url, guidelines_url, category, automation_level, api_supported, requires_user_action, active, requirements, supported_product_types, audience_tags, fit_rules, content_style, launch_rules, instructions, adapter, priority, verified_at";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function stringList(value: unknown, max = 40): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => cleanLine(item))
    .filter(Boolean)
    .slice(0, max);
}

export function parseRequirements(value: unknown): PlatformRequirement[] {
  if (!Array.isArray(value)) return [];
  const out: PlatformRequirement[] = [];
  for (const item of value.slice(0, 40)) {
    if (!isRecord(item)) continue;
    const key = typeof item.key === "string" ? item.key.trim().slice(0, 40) : "";
    const label = typeof item.label === "string" ? cleanLine(item.label).slice(0, 160) : "";
    if (!/^[a-z0-9_]+$/.test(key) || !label) continue;
    out.push({
      key,
      label,
      required: item.required !== false,
      manual: item.manual === true,
      verified: item.verified === true,
      note: typeof item.note === "string" ? cleanLine(item.note).slice(0, 300) : undefined,
    });
  }
  return out;
}

function numberRecord(value: unknown): Record<string, number> | undefined {
  if (!isRecord(value)) return undefined;
  const out: Record<string, number> = {};
  for (const [key, weight] of Object.entries(value)) {
    if (typeof weight === "number" && Number.isFinite(weight) && /^[a-z0-9_]+$/.test(key)) {
      out[key] = Math.max(-50, Math.min(50, weight));
    }
  }
  return out;
}

export function parseFitRules(value: unknown): FitRules {
  if (!isRecord(value)) return {};
  return {
    tagWeights: numberRecord(value.tagWeights),
    penalizeTags: numberRecord(value.penalizeTags),
    requiredAnyTags: stringList(value.requiredAnyTags, 20),
    requiresWebsite: value.requiresWebsite === true,
    prefersEarlyStage: value.prefersEarlyStage === true,
    assetSensitive: value.assetSensitive === true,
  };
}

export function parseLaunchRules(value: unknown): LaunchRules {
  if (!isRecord(value)) return {};
  const phase = typeof value.phase === "number" && Number.isFinite(value.phase) ? value.phase : undefined;
  const weekdays = Array.isArray(value.weekdays)
    ? value.weekdays.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6)
    : undefined;
  return {
    phase: phase === undefined ? undefined : Math.max(1, Math.min(5, Math.round(phase))),
    weekdays: weekdays && weekdays.length > 0 ? [...new Set(weekdays)].sort() : undefined,
    note: typeof value.note === "string" ? cleanLine(value.note).slice(0, 300) : undefined,
  };
}

function oneOf<T extends string>(options: readonly T[], value: unknown): T | null {
  return typeof value === "string" && (options as readonly string[]).includes(value) ? (value as T) : null;
}

/**
 * Enforces the same invariant as the table's check constraint: a platform is
 * only AUTOMATED if it has an API and needs no user action. A row that breaks
 * it is downgraded to ASSISTED rather than trusted.
 */
function effectiveAutomation(level: AutomationLevel, apiSupported: boolean, requiresUserAction: boolean): AutomationLevel {
  if (level === "AUTOMATED" && (!apiSupported || requiresUserAction)) return "ASSISTED";
  return level;
}

export function parsePlatformRow(row: LaunchPlatformRow): LaunchPlatform | null {
  const automationLevel = oneOf(AUTOMATION_LEVELS, row.automation_level);
  const category = oneOf(PLATFORM_CATEGORIES, row.category) ?? "launch_platform";
  const contentStyle = oneOf(CONTENT_STYLES, row.content_style) ?? "directory";
  if (!row.id || !row.slug || !row.name || !automationLevel || !isHttpsUrl(row.website_url)) return null;

  return {
    id: row.id,
    slug: row.slug,
    name: cleanLine(row.name),
    description: cleanText(row.description),
    websiteUrl: row.website_url,
    submissionUrl: isHttpsUrl(row.submission_url) ? row.submission_url : null,
    guidelinesUrl: isHttpsUrl(row.guidelines_url) ? row.guidelines_url : null,
    category,
    automationLevel: effectiveAutomation(automationLevel, row.api_supported, row.requires_user_action),
    apiSupported: Boolean(row.api_supported),
    requiresUserAction: row.requires_user_action !== false,
    active: Boolean(row.active),
    requirements: parseRequirements(row.requirements),
    supportedProductTypes: stringList(row.supported_product_types),
    audienceTags: stringList(row.audience_tags).map((tag) => tag.toLowerCase()),
    fitRules: parseFitRules(row.fit_rules),
    contentStyle,
    launchRules: parseLaunchRules(row.launch_rules),
    instructions: cleanText(row.instructions),
    adapter: (row.adapter ?? "default").trim() || "default",
    priority: Number.isFinite(row.priority) ? row.priority : 100,
    verifiedAt: row.verified_at,
  };
}

export function parsePlatformRows(rows: LaunchPlatformRow[] | null | undefined): LaunchPlatform[] {
  return (rows ?? [])
    .map(parsePlatformRow)
    .filter((platform): platform is LaunchPlatform => platform !== null)
    .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
}

// ── Admin input ─────────────────────────────────────────────────────────

export type PlatformInput = {
  slug: string;
  name: string;
  description: string;
  websiteUrl: string;
  submissionUrl: string;
  guidelinesUrl: string;
  category: string;
  automationLevel: string;
  apiSupported: boolean;
  requiresUserAction: boolean;
  active: boolean;
  requirementsJson: string;
  supportedProductTypes: string;
  audienceTags: string;
  fitRulesJson: string;
  contentStyle: string;
  launchRulesJson: string;
  instructions: string;
  adapter: string;
  priority: number;
};

export type PlatformRowWrite = Omit<LaunchPlatformRow, "id" | "verified_at"> & { verified_at?: string | null };

function parseJson(text: string, fallback: unknown): { ok: true; value: unknown } | { ok: false } {
  if (!text.trim()) return { ok: true, value: fallback };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

function csv(value: string): string[] {
  return value
    .split(",")
    .map((item) => cleanLine(item))
    .filter(Boolean)
    .slice(0, 40);
}

/** Validates the admin form. Returns a DB-ready row or the first error. */
export function validatePlatformInput(input: PlatformInput): { ok: true; row: PlatformRowWrite } | { ok: false; error: string } {
  const slug = input.slug.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,59}$/.test(slug)) {
    return { ok: false, error: "Slug must be 2–60 lowercase letters, numbers or dashes." };
  }
  const name = cleanLine(input.name);
  if (!name || name.length > 80) return { ok: false, error: "Name is required (80 characters max)." };
  if (!isHttpsUrl(input.websiteUrl.trim())) return { ok: false, error: "Website URL must be an https:// address." };
  for (const [label, value] of [["Submission URL", input.submissionUrl], ["Guidelines URL", input.guidelinesUrl]] as const) {
    if (value.trim() && !isHttpsUrl(value.trim())) return { ok: false, error: `${label} must be an https:// address.` };
  }
  const automation = oneOf(AUTOMATION_LEVELS, input.automationLevel);
  if (!automation) return { ok: false, error: "Choose an automation level." };
  if (automation === "AUTOMATED" && (!input.apiSupported || input.requiresUserAction)) {
    return {
      ok: false,
      error: "An AUTOMATED platform must have API support and must not require user action.",
    };
  }
  const category = oneOf(PLATFORM_CATEGORIES, input.category) as PlatformCategory | null;
  if (!category) return { ok: false, error: "Choose a category." };
  const contentStyle = oneOf(CONTENT_STYLES, input.contentStyle) as ContentStyle | null;
  if (!contentStyle) return { ok: false, error: "Choose a content style." };

  const requirements = parseJson(input.requirementsJson, []);
  if (!requirements.ok || !Array.isArray(requirements.value)) {
    return { ok: false, error: "Requirements must be a JSON array." };
  }
  const fitRules = parseJson(input.fitRulesJson, {});
  if (!fitRules.ok || !isRecord(fitRules.value)) return { ok: false, error: "Fit rules must be a JSON object." };
  const launchRules = parseJson(input.launchRulesJson, {});
  if (!launchRules.ok || !isRecord(launchRules.value)) return { ok: false, error: "Launch rules must be a JSON object." };

  const description = cleanText(input.description);
  const instructions = cleanText(input.instructions);
  if (description.length > 600) return { ok: false, error: "Description is 600 characters max." };
  if (instructions.length > 2000) return { ok: false, error: "Instructions are 2000 characters max." };

  const priority = Math.round(Number(input.priority));
  if (!Number.isFinite(priority) || priority < 0 || priority > 1000) {
    return { ok: false, error: "Priority must be between 0 and 1000." };
  }

  const adapter = input.adapter.trim() || "default";
  if (!/^[a-z0-9-]{1,40}$/.test(adapter)) return { ok: false, error: "Adapter key is lowercase letters, numbers or dashes." };

  return {
    ok: true,
    row: {
      slug,
      name,
      description,
      website_url: input.websiteUrl.trim(),
      submission_url: input.submissionUrl.trim() || null,
      guidelines_url: input.guidelinesUrl.trim() || null,
      category,
      automation_level: automation,
      api_supported: input.apiSupported,
      requires_user_action: input.requiresUserAction,
      active: input.active,
      // Stored normalised, so what the admin sees next time is what the engine reads.
      requirements: parseRequirements(requirements.value),
      supported_product_types: csv(input.supportedProductTypes),
      audience_tags: csv(input.audienceTags).map((tag) => tag.toLowerCase().replace(/\s+/g, "_")),
      fit_rules: parseFitRules(fitRules.value),
      content_style: contentStyle,
      launch_rules: parseLaunchRules(launchRules.value),
      instructions,
      adapter,
      priority,
    },
  };
}
