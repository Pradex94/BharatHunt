/**
 * Product analysis: what a listing says about who it is for, and how complete
 * it is — derived only from the maker's own fields.
 *
 * Deterministic by design (this deployment runs no language model; see the
 * README). A weighted lexicon over the name, tagline, description, tags and
 * tech stack, plus the category and the links the maker filled in. Every tag
 * here traces back to something the maker wrote, which is what lets the UI say
 * *why* a platform was recommended without inventing a reason.
 */

import { cleanLine, wordCount } from "./text.ts";
import type { LaunchProduct, ProductSignals } from "./types.ts";

/** Category → audience tags. Keys are PRODUCT_CATEGORIES values. */
const CATEGORY_TAGS: Record<string, string[]> = {
  "Developer Tools": ["developer", "technical", "saas", "tech"],
  Productivity: ["productivity", "saas", "tech"],
  Finance: ["fintech", "saas", "b2b", "tech"],
  "Food & Drink": ["consumer", "local"],
  "Design Tools": ["design", "creative", "saas", "tech"],
  Marketing: ["marketing", "saas", "b2b", "tech"],
  "Health & Fitness": ["consumer", "health"],
  Education: ["education", "consumer"],
  Social: ["consumer", "community"],
  Other: ["tech"],
};

/**
 * Lexicon: tag → phrases. Single words match whole words only (so "ai" does not
 * fire inside "maintain"); multi-word phrases match as substrings.
 */
const LEXICON: Record<string, string[]> = {
  ai: ["ai", "gpt", "llm", "llms", "machine learning", "ml", "genai", "chatbot", "artificial intelligence", "openai", "claude", "gemini", "agent", "agents", "copilot", "neural"],
  saas: ["saas", "subscription", "dashboard", "workspace", "platform", "cloud"],
  developer: ["developer", "developers", "api", "sdk", "cli", "devops", "github", "code", "coding", "open source", "framework", "library", "database", "deploy", "backend", "frontend", "typescript", "javascript", "python"],
  api: ["api", "apis", "sdk", "webhook", "webhooks", "endpoint", "rest", "graphql"],
  open_source: ["open source", "open-source", "oss", "mit license", "self-hosted", "self hosted"],
  design: ["design", "designers", "figma", "ui", "ux", "icons", "mockup", "prototype"],
  marketing: ["marketing", "seo", "growth", "newsletter", "campaign", "leads", "social media", "ads"],
  productivity: ["productivity", "tasks", "todo", "notes", "calendar", "workflow", "automation", "focus", "habit"],
  b2b: ["b2b", "teams", "team", "business", "businesses", "enterprise", "crm", "invoice", "invoicing", "sme", "smes", "startups"],
  consumer: ["consumer", "personal", "family", "students", "friends", "shopping", "fitness", "recipes", "travel"],
  mobile: ["ios", "android", "mobile app", "iphone", "play store", "app store"],
  indie: ["side project", "indie", "solo", "bootstrapped", "maker", "makers", "weekend project", "micro saas", "micro-saas"],
  no_code: ["no-code", "no code", "nocode", "low-code", "low code"],
  india: ["india", "indian", "bharat", "upi", "gst", "rupee", "rupees", "inr", "₹"],
  education: ["learn", "learning", "course", "courses", "teachers", "exam", "exams", "tutor", "classroom"],
  fintech: ["payments", "fintech", "finance", "banking", "expense", "accounting", "tax"],
};

function matches(haystack: string, words: Set<string>, phrase: string): boolean {
  if (phrase.includes(" ") || phrase.includes("-") || /[^a-z0-9]/.test(phrase)) {
    return haystack.includes(phrase);
  }
  return words.has(phrase);
}

export function inferTags(product: LaunchProduct): string[] {
  const haystack = [
    product.name,
    product.tagline,
    product.description ?? "",
    product.tags.join(" "),
    product.techStack.join(" "),
  ]
    .map((part) => cleanLine(part).toLowerCase())
    .join(" \n ");
  const words = new Set(haystack.split(/[^a-z0-9₹]+/).filter(Boolean));

  const tags = new Set<string>(CATEGORY_TAGS[product.category] ?? ["tech"]);
  for (const [tag, phrases] of Object.entries(LEXICON)) {
    if (phrases.some((phrase) => matches(haystack, words, phrase))) tags.add(tag);
  }

  // Links are stronger evidence than words.
  if (product.githubUrl) {
    tags.add("open_source");
    tags.add("developer");
  }
  if (product.platformLinks.ios || product.platformLinks.android) tags.add("mobile");
  if (product.platformLinks.chrome) tags.add("browser_extension");
  if (product.platformLinks.figma) tags.add("design");
  if (product.launchState) tags.add("india");
  if (product.techStack.length > 0) tags.add("technical");
  if (tags.has("developer") || tags.has("api")) tags.add("technical");
  if (!tags.has("consumer") && (tags.has("saas") || tags.has("developer") || tags.has("ai"))) {
    tags.add("tech");
  }

  return [...tags].sort();
}

function daysBetween(from: string | null, now: Date): number | null {
  if (!from) return null;
  const time = new Date(from).getTime();
  if (Number.isNaN(time)) return null;
  return Math.max(0, Math.floor((now.getTime() - time) / 86_400_000));
}

/** Listing completeness, 0–100, weighted by what launch platforms actually ask for. */
export function analyzeProductSignals(product: LaunchProduct, now: Date = new Date()): ProductSignals {
  const descriptionWords = wordCount(product.description);
  const screenshotCount = product.screenshotUrls.length;
  const parts = {
    hasWebsite: Boolean(product.websiteUrl),
    hasLogo: Boolean(product.heroImageUrl),
    screenshotCount,
    hasVideo: Boolean(product.videoUrl),
    descriptionWords,
    hasGithub: Boolean(product.githubUrl),
    hasMakerInfo: Boolean(product.makerName),
    hasTopics: product.tags.length > 0 || Boolean(product.category),
  };

  let score = 0;
  score += parts.hasWebsite ? 20 : 0;
  score += product.tagline.trim().length >= 10 ? 10 : 0;
  score += Math.min(20, Math.round((descriptionWords / 60) * 20));
  score += parts.hasLogo ? 15 : 0;
  score += screenshotCount >= 3 ? 15 : screenshotCount * 5;
  score += parts.hasVideo ? 8 : 0;
  score += parts.hasMakerInfo ? 6 : 0;
  score += parts.hasTopics ? 6 : 0;

  return {
    tags: inferTags(product),
    completeness: { score: Math.min(100, score), ...parts },
    ageDays: daysBetween(product.publishedAt, now),
  };
}

/** Human names for tags, for explanations. */
export const TAG_LABELS: Record<string, string> = {
  ai: "AI",
  saas: "SaaS",
  developer: "developer",
  api: "API",
  open_source: "open-source",
  design: "design",
  marketing: "marketing",
  productivity: "productivity",
  b2b: "B2B",
  consumer: "consumer",
  mobile: "mobile",
  indie: "indie maker",
  no_code: "no-code",
  india: "Indian",
  education: "education",
  fintech: "fintech",
  technical: "technical",
  tech: "startup",
  browser_extension: "browser extension",
  creative: "creative",
  health: "health",
  community: "community",
  local: "local",
};

export function tagLabel(tag: string): string {
  return TAG_LABELS[tag] ?? tag.replace(/_/g, " ");
}
