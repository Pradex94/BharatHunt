/**
 * Platform fit: which launch platforms suit a product, how strongly, and why.
 *
 * `analyzeLaunchOpportunities` is the engine's entry point. Every number it
 * returns is computed from the product's own listing and the registry's
 * configured rules — no traffic predictions, no invented performance data. The
 * reason string is assembled from the rules that actually fired, so it can
 * always be traced to a field the maker wrote or a rule an admin configured.
 */

import { analyzeProductSignals, tagLabel } from "./signals.ts";
import type {
  LaunchAnalysis,
  LaunchPlatform,
  LaunchProduct,
  PlatformRecommendation,
  Priority,
  ProductSignals,
} from "./types.ts";

export const ENGINE_VERSION = "rules-v1";

/** A platform is recommended at or above this fit. */
export const RECOMMEND_THRESHOLD = 50;

const BASE_SCORE = 42;
const MATCH_POINTS = 6;
const MAX_MATCH_POINTS = 24;

function priorityFor(score: number): Priority {
  if (score >= 75) return "HIGH";
  if (score >= 58) return "MEDIUM";
  return "LOW";
}

function joinLabels(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

export function scorePlatformFit(
  platform: LaunchPlatform,
  product: LaunchProduct,
  signals: ProductSignals,
): PlatformRecommendation {
  const rules = platform.fitRules;
  const productTags = new Set(signals.tags);
  const matched = platform.audienceTags.filter((tag) => productTags.has(tag));
  const positives: string[] = [];
  const negatives: string[] = [];

  let score = BASE_SCORE + Math.min(MAX_MATCH_POINTS, matched.length * MATCH_POINTS);

  for (const [tag, weight] of Object.entries(rules.tagWeights ?? {})) {
    if (productTags.has(tag)) score += weight;
  }
  for (const [tag, weight] of Object.entries(rules.penalizeTags ?? {})) {
    if (productTags.has(tag)) {
      score -= weight;
      negatives.push(`${tagLabel(tag)} products tend to do less well there`);
    }
  }

  const supported = platform.supportedProductTypes;
  if (supported.length > 0) {
    if (supported.includes(product.category)) {
      score += 8;
      positives.push(`built for ${product.category}`);
    } else {
      score -= 12;
    }
  }

  const required = rules.requiredAnyTags ?? [];
  if (required.length > 0 && !required.some((tag) => productTags.has(tag))) {
    // A hard audience rule: DevHunt without a developer product is noise.
    score = Math.min(score, 30);
    negatives.push(`it focuses on ${joinLabels(required.map(tagLabel))} products`);
  }

  if (rules.requiresWebsite && !signals.completeness.hasWebsite) {
    score = Math.min(score, 25);
    negatives.push("it needs a live link people can try right away");
  }

  if (rules.prefersEarlyStage && signals.ageDays !== null) {
    if (signals.ageDays <= 60) {
      score += 6;
      positives.push("suits a recent launch");
    } else if (signals.ageDays > 365) {
      score -= 10;
      negatives.push("it favours early-stage products");
    }
  }

  if (rules.assetSensitive) {
    const c = signals.completeness;
    score += (c.hasLogo ? 3 : -4) + (c.screenshotCount > 0 ? 3 : -6) + (c.hasVideo ? 2 : 0);
  }

  // Capped below 100: a fit score is a rule-based estimate, and "100/100" reads
  // as a certainty nothing here can offer.
  const fitScore = Math.max(0, Math.min(98, Math.round(score)));
  const priority = priorityFor(fitScore);
  const recommended = fitScore >= RECOMMEND_THRESHOLD;

  const audience = matched.length > 0 ? joinLabels(matched.slice(0, 3).map(tagLabel)) : null;
  let reason: string;
  if (!recommended) {
    reason = negatives.length > 0
      ? `Lower fit for ${platform.name}: ${negatives[0]}.`
      : `Lower fit for ${platform.name}: little overlap between its audience and this listing.`;
  } else if (audience) {
    const strength = priority === "HIGH" ? "Strong fit" : "Good fit";
    const extra = positives[0] ? `, ${positives[0]}` : "";
    reason = `${strength} for ${platform.name}'s ${audience} audience${extra}.`;
  } else {
    reason = `Reasonable general fit for ${platform.name}.`;
  }

  return {
    platformId: platform.id,
    slug: platform.slug,
    platform: platform.name,
    fitScore,
    priority,
    recommended,
    reason,
    automationLevel: platform.automationLevel,
    matchedTags: matched,
  };
}

/**
 * The analysis for one product against every active platform.
 *
 * `productFit` — the Distribution Score — is 60% how well the product's best
 * platforms fit and 40% how complete its listing is, because a well-matched
 * product with no screenshots still is not ready to launch anywhere visual.
 */
export function analyzeLaunchOpportunities(
  product: LaunchProduct,
  platforms: LaunchPlatform[],
  now: Date = new Date(),
): LaunchAnalysis {
  const signals = analyzeProductSignals(product, now);
  const recommendations = platforms
    .filter((platform) => platform.active)
    .map((platform) => scorePlatformFit(platform, product, signals))
    .sort((a, b) => b.fitScore - a.fitScore || a.platform.localeCompare(b.platform));

  const top = recommendations.slice(0, 5);
  const platformFit = top.length > 0 ? Math.round(top.reduce((sum, rec) => sum + rec.fitScore, 0) / top.length) : 0;
  const listingCompleteness = signals.completeness.score;
  const productFit = Math.round(platformFit * 0.6 + listingCompleteness * 0.4);

  // The audience a maker is told about is the tags that actually won platforms.
  const tagCounts = new Map<string, number>();
  for (const rec of recommendations.filter((item) => item.recommended)) {
    for (const tag of rec.matchedTags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  }
  const matchedAudience = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag]) => tag)
    .filter((tag) => tag !== "tech")
    .slice(0, 3);

  const recommendedCount = recommendations.filter((rec) => rec.recommended).length;
  let summary: string;
  if (recommendedCount === 0) {
    summary = "No platform in the directory is a strong match yet — a fuller description and screenshots will change that.";
  } else {
    const audience = joinLabels([...matchedAudience.map(tagLabel), "startup"]);
    const strength = productFit >= 75 ? "a strong fit" : productFit >= 55 ? "a good fit" : "a possible fit";
    summary = `Your product is ${strength} for ${audience} discovery communities.`;
    if (listingCompleteness < 60) summary += " Completing your listing will raise the score.";
  }

  return {
    productFit,
    summary,
    matchedAudience,
    breakdown: { platformFit, listingCompleteness },
    recommendations,
    engineVersion: ENGINE_VERSION,
  };
}
