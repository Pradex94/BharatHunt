/**
 * Shared fixtures for the Launch Agent tests: registry rows shaped exactly like
 * the seed in 20260915000000_launch_agent.sql, and product builders.
 */

import { parsePlatformRows, type LaunchPlatformRow } from "../lib/launch-agent/registry.ts";
import type { LaunchProduct } from "../lib/launch-agent/types.ts";

function row(partial: Partial<LaunchPlatformRow> & Pick<LaunchPlatformRow, "slug" | "name">): LaunchPlatformRow {
  return {
    id: `id-${partial.slug}`,
    description: "",
    website_url: `https://${partial.slug}.example.com`,
    submission_url: `https://${partial.slug}.example.com/submit`,
    guidelines_url: null,
    category: "launch_platform",
    automation_level: "AI_PREPARED",
    api_supported: false,
    requires_user_action: true,
    active: true,
    requirements: [],
    supported_product_types: [],
    audience_tags: [],
    fit_rules: {},
    content_style: "directory",
    launch_rules: {},
    instructions: "",
    adapter: "default",
    priority: 100,
    verified_at: null,
    ...partial,
  };
}

export const PLATFORM_ROWS: LaunchPlatformRow[] = [
  row({
    slug: "product-hunt",
    name: "Product Hunt",
    automation_level: "ASSISTED",
    content_style: "producthunt",
    adapter: "product-hunt",
    priority: 10,
    audience_tags: ["tech", "saas", "ai", "productivity", "design", "developer", "consumer", "marketing"],
    fit_rules: { tagWeights: { ai: 14, saas: 12, developer: 8, productivity: 10, design: 10 }, assetSensitive: true },
    launch_rules: { phase: 3, weekdays: [2, 3, 4] },
    requirements: [
      { key: "website_url", label: "Product URL", required: true },
      { key: "name", label: "Product name", required: true },
      { key: "tagline", label: "Tagline", required: true },
      { key: "description", label: "Description", required: true },
      { key: "logo", label: "Logo", required: true },
      { key: "screenshots", label: "Gallery images", required: true },
      { key: "maker_info", label: "Maker information", required: true },
      { key: "topics", label: "Topics", required: true },
      { key: "first_comment", label: "First comment", required: false },
      { key: "video", label: "Demo video", required: false },
      { key: "account", label: "A Product Hunt account", required: true, manual: true, verified: true },
    ],
  }),
  row({
    slug: "peerlist",
    name: "Peerlist Launchpad",
    category: "community",
    content_style: "peerlist",
    priority: 30,
    audience_tags: ["developer", "design", "saas", "ai", "productivity", "tech", "india"],
    fit_rules: { tagWeights: { developer: 12, design: 10, india: 8, ai: 8 } },
    launch_rules: { phase: 2, weekdays: [1] },
  }),
  row({
    slug: "devhunt",
    name: "DevHunt",
    category: "developer",
    content_style: "devtools",
    priority: 40,
    supported_product_types: ["Developer Tools"],
    audience_tags: ["developer", "api", "open_source", "technical"],
    fit_rules: { tagWeights: { developer: 20, api: 10, open_source: 10 }, requiredAnyTags: ["developer", "api", "open_source"] },
    launch_rules: { phase: 2 },
  }),
  row({
    slug: "show-hn",
    name: "Hacker News (Show HN)",
    category: "community",
    automation_level: "ASSISTED",
    content_style: "show_hn",
    adapter: "show-hn",
    submission_url: "https://news.ycombinator.com/submitlink",
    priority: 80,
    audience_tags: ["developer", "technical", "open_source", "api", "ai"],
    fit_rules: { tagWeights: { developer: 16, open_source: 14, technical: 10, api: 8 }, penalizeTags: { consumer: 10, marketing: 12 }, requiresWebsite: true },
    launch_rules: { phase: 4 },
    requirements: [
      { key: "website_url", label: "Something people can try", required: true },
      { key: "title_format", label: "Show HN title", required: true },
      { key: "no_signup_wall", label: "No sign-up wall", required: true, manual: true },
    ],
  }),
  row({
    slug: "uneed",
    name: "Uneed",
    priority: 20,
    audience_tags: ["saas", "ai", "productivity", "design", "developer", "marketing", "indie"],
    fit_rules: { tagWeights: { saas: 12, ai: 10, indie: 8, productivity: 8 } },
    launch_rules: { phase: 1 },
  }),
  row({
    slug: "reddit-sideproject",
    name: "Reddit r/SideProject",
    category: "community",
    automation_level: "ASSISTED",
    content_style: "reddit",
    adapter: "reddit",
    submission_url: "https://www.reddit.com/r/SideProject/submit",
    priority: 110,
    audience_tags: ["indie", "consumer", "productivity", "ai", "developer", "saas"],
    fit_rules: { tagWeights: { indie: 12, consumer: 6 } },
    launch_rules: { phase: 5 },
  }),
];

export const PLATFORMS = parsePlatformRows(PLATFORM_ROWS);

export function platform(slug: string) {
  const found = PLATFORMS.find((item) => item.slug === slug);
  if (!found) throw new Error(`fixture platform ${slug} missing`);
  return found;
}

export function product(overrides: Partial<LaunchProduct> = {}): LaunchProduct {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    slug: "resume-ai",
    name: "ResumeAI",
    tagline: "AI resume builder that tailors your CV to every job",
    description:
      "ResumeAI reads a job description and rewrites your resume to match it. It highlights the skills recruiters look for and exports a clean PDF. Built for students and job seekers who apply to many roles. Your data stays private and is never sold.",
    category: "Productivity",
    pricingType: "freemium",
    websiteUrl: "https://resume-ai.example.com",
    githubUrl: null,
    videoUrl: null,
    heroImageUrl: "https://cdn.example.com/logo.png",
    screenshotUrls: ["https://cdn.example.com/1.png", "https://cdn.example.com/2.png", "https://cdn.example.com/3.png"],
    tags: ["ai", "careers"],
    techStack: [],
    platformLinks: {},
    launchState: null,
    publishedAt: "2026-09-14T10:00:00Z",
    updatedAt: "2026-09-14T10:00:00Z",
    makerName: "Asha Rao",
    makerUsername: "asha",
    makerBio: null,
    makerTwitter: null,
    bharatHuntUrl: "https://bharathunt.org/products/resume-ai",
    ...overrides,
  };
}

export const NOW = new Date("2026-09-15T08:00:00Z");
