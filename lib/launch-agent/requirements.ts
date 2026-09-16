/**
 * The launch checklist: a platform's configured requirements, checked against
 * the product listing and the prepared kit.
 *
 * Three outcomes per line. `ok` — we can see it is satisfied. `missing` — we can
 * see it is not, and say how to fix it. `manual` — a step only the maker can
 * take on the platform (an account, agreeing to its rules); we list it and
 * never pretend to have checked it. Readiness counts only what we can check, so
 * "100% ready" means the preparation is done, not that the platform accepted it.
 */

import { wordCount } from "./text.ts";
import type { LaunchKit, LaunchPlatform, LaunchProduct, PlatformRequirement, RequirementCheck } from "./types.ts";

type Evaluator = (product: LaunchProduct, kit: LaunchKit | null) => { ok: boolean; hint: string; fix: RequirementCheck["fix"] };

const editProduct = (ok: boolean, hint: string) => ({ ok, hint, fix: "edit_product" as const });
const generated = (ok: boolean, hint: string) => ({ ok, hint, fix: "generate" as const });

const EVALUATORS: Record<string, Evaluator> = {
  website_url: (p) => editProduct(Boolean(p.websiteUrl), "Add your product's website URL."),
  name: (p) => editProduct(p.name.trim().length > 0, "Add a product name."),
  tagline: (p) => editProduct(p.tagline.trim().length >= 10, "Write a tagline of at least a few words."),
  description: (p) =>
    editProduct(wordCount(p.description) >= 25, "Expand the description to at least 25 words: what it does and who it's for."),
  logo: (p) => editProduct(Boolean(p.heroImageUrl), "Upload a logo."),
  screenshots: (p) => editProduct(p.screenshotUrls.length > 0, "Add at least one screenshot."),
  video: (p) => editProduct(Boolean(p.videoUrl), "Add a short product demo video."),
  github_url: (p) => editProduct(Boolean(p.githubUrl), "Add your GitHub repository link."),
  maker_info: (p) => editProduct(Boolean(p.makerName), "Add your name to your BharatHunt profile."),
  topics: (p, kit) => generated(Boolean(kit && kit.categories.length > 0) || p.tags.length > 0, "Generate the launch kit to get topic suggestions."),
  first_comment: (_p, kit) => generated(Boolean(kit?.firstComment), "Generate the launch kit to draft your first comment."),
  launch_story: (_p, kit) => generated(Boolean(kit?.launchStory), "Generate the launch kit to draft your launch story."),
  reddit_post: (_p, kit) => generated(Boolean(kit?.redditBody), "Generate the launch kit to draft your post."),
  title_format: (_p, kit) => generated(Boolean(kit?.title.startsWith("Show HN:")), "Generate the launch kit for a correctly formatted title."),
  launch_timing: () => ({ ok: true, hint: "", fix: null }),
};

export function checkRequirements(
  platform: Pick<LaunchPlatform, "requirements">,
  product: LaunchProduct,
  kit: LaunchKit | null,
  options: { hasScheduledDate?: boolean } = {},
): RequirementCheck[] {
  return platform.requirements.map((requirement: PlatformRequirement) => {
    const evaluator = EVALUATORS[requirement.key];
    if (requirement.manual || !evaluator) {
      return {
        key: requirement.key,
        label: requirement.label,
        required: requirement.required,
        status: "manual",
        fix: "platform",
        hint: requirement.note ?? null,
        verified: requirement.verified === true,
      };
    }
    const result =
      requirement.key === "launch_timing"
        ? { ok: Boolean(options.hasScheduledDate), hint: "Pick a launch date in your timeline.", fix: null }
        : evaluator(product, kit);
    return {
      key: requirement.key,
      label: requirement.label,
      required: requirement.required,
      status: result.ok ? "ok" : "missing",
      fix: result.ok ? null : result.fix,
      hint: result.ok ? (requirement.note ?? null) : result.hint,
      verified: requirement.verified === true,
    };
  });
}

/**
 * Percentage of checkable preparation done. Optional items weigh half; manual
 * steps are excluded. No checkable items at all → 100 if a kit exists.
 */
export function readinessOf(checks: RequirementCheck[], hasKit: boolean): number {
  let total = 0;
  let done = 0;
  for (const check of checks) {
    if (check.status === "manual") continue;
    const weight = check.required ? 1 : 0.5;
    total += weight;
    if (check.status === "ok") done += weight;
  }
  if (total === 0) return hasKit ? 100 : 0;
  return Math.round((done / total) * 100);
}

export function missingRequired(checks: RequirementCheck[]): RequirementCheck[] {
  return checks.filter((check) => check.required && check.status === "missing");
}
