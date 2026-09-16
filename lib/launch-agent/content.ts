/**
 * Platform-specific launch kits.
 *
 * Deterministic templates, not a language model — this deployment runs none
 * (see the README). Each `content_style` in the registry selects a template
 * family, so Product Hunt gets a maker comment, Show HN gets a plain technical
 * title and explanation, Reddit gets a feedback-seeking post, and directories
 * get tight listing copy.
 *
 * The honesty rules are structural, not aspirational:
 *
 * - **Nothing is invented.** Every sentence is either template scaffolding or a
 *   field the maker wrote. No user counts, revenue, testimonials, reviews or
 *   rankings can appear, because no template has a slot for one. Personal facts
 *   the maker has not given us (why they started, what they learned) are left
 *   as `[bracketed prompts]` for them to fill in, never made up.
 * - **Product text is data.** It is cleaned (lib/launch-agent/text.ts) and
 *   interpolated; it never selects a template or changes a rule. A description
 *   that says "ignore previous instructions" ends up quoted in a draft, and
 *   nowhere else.
 * - **Links carry UTM tags** (lib/launch-agent/utm.ts) so a maker can see in
 *   their own analytics which launch sent traffic.
 */

import { tagLabel } from "./signals.ts";
import {
  cleanLine,
  cleanText,
  hashString,
  leadingSentences,
  lowerFirst,
  pick,
  sentences,
  stripLeadingName,
  toHashtag,
  truncate,
  uniqueCaseless,
  withoutTrailingPunctuation,
} from "./text.ts";
import { buildUtmUrl } from "./utm.ts";
import type { LaunchKit, LaunchPlatform, LaunchProduct, ProductSignals } from "./types.ts";
import { validateKit } from "./validate.ts";

export type KitTone = "standard" | "bold";

export type KitOptions = {
  /** Regenerate increments this to rotate phrasing, deterministically. */
  variant?: number;
  tone?: KitTone;
};

/** Words Show HN readers (and its guidelines) treat as marketing. */
const HYPE_WORDS = /\b(revolutionary|revolutionize|revolutionizing|game[- ]?chang(?:er|ing)|ultimate|best|world'?s first|amazing|awesome|incredible|disruptive|cutting[- ]edge|next[- ]gen(?:eration)?|blazing(?:ly)?|10x|unleash|supercharge|seamless(?:ly)?|effortless(?:ly)?)\b/gi;
const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}]/gu;

const TOPIC_NAMES: Record<string, string> = {
  ai: "Artificial Intelligence",
  saas: "SaaS",
  developer: "Developer Tools",
  api: "APIs",
  open_source: "Open Source",
  design: "Design Tools",
  marketing: "Marketing",
  productivity: "Productivity",
  b2b: "B2B",
  mobile: "Mobile Apps",
  no_code: "No-Code",
  education: "Education",
  fintech: "Fintech",
  browser_extension: "Browser Extensions",
  health: "Health & Fitness",
};

const HASHTAG_NAMES: Record<string, string> = {
  ai: "#AI",
  saas: "#SaaS",
  developer: "#DevTools",
  open_source: "#OpenSource",
  design: "#Design",
  marketing: "#Marketing",
  productivity: "#Productivity",
  indie: "#BuildInPublic",
  no_code: "#NoCode",
  india: "#MadeInIndia",
  fintech: "#Fintech",
  education: "#EdTech",
};

const AUDIENCE_NOUNS: [string, string][] = [
  ["developer", "developers"],
  ["design", "designers"],
  ["marketing", "marketers"],
  ["b2b", "teams"],
  ["education", "learners"],
  ["fintech", "businesses"],
  ["indie", "makers"],
  ["consumer", "people"],
];

function audienceNoun(tags: string[]): string {
  for (const [tag, noun] of AUDIENCE_NOUNS) if (tags.includes(tag)) return noun;
  return "people";
}

function dehype(value: string): string {
  return value.replace(HYPE_WORDS, "").replace(EMOJI, "").replace(/!+/g, ".").replace(/\s{2,}/g, " ").replace(/\s+([,.])/g, "$1").trim();
}

function pricingSentence(pricingType: string): string {
  if (pricingType === "free") return "It's free to use.";
  if (pricingType === "freemium") return "There's a free plan, with paid upgrades.";
  return "";
}

/** Everything each template family shares, computed once. */
function baseParts(product: LaunchProduct, platform: LaunchPlatform, signals: ProductSignals, options: KitOptions) {
  const name = truncate(cleanLine(product.name), 60);
  const rawTagline = stripLeadingName(cleanLine(product.tagline), name);
  const tagline = withoutTrailingPunctuation(rawTagline) || name;
  const description = cleanText(product.description) || `${name}: ${tagline}.`;
  const descSentences = sentences(description);
  const link = buildUtmUrl(product.websiteUrl ?? product.bharatHuntUrl, platform.slug);
  const bharatHuntLink = product.bharatHuntUrl;
  const maker = cleanLine(product.makerName) || null;
  const tags = signals.tags;
  const audience = audienceNoun(tags);
  const pricing = pricingSentence(product.pricingType);
  const seed = hashString(`${product.id}:${platform.slug}`) + (options.variant ?? 0);
  const bold = options.tone === "bold";

  const categories = uniqueCaseless([
    product.category,
    ...tags.map((tag) => TOPIC_NAMES[tag]).filter((topic): topic is string => Boolean(topic)),
  ]).slice(0, 5);

  const keywords = uniqueCaseless([
    ...product.tags.map(cleanLine),
    ...tags.filter((tag) => !["tech", "technical", "consumer", "local"].includes(tag)).map(tagLabel),
    ...product.techStack.map(cleanLine),
    product.category,
  ])
    .filter((keyword) => keyword.length <= 40)
    .slice(0, 12);

  const hashtags = uniqueCaseless([
    ...tags.map((tag) => HASHTAG_NAMES[tag]).filter((tag): tag is string => Boolean(tag)),
    toHashtag(product.category),
    "#ProductLaunch",
  ]).filter((tag) => /^#[A-Za-z0-9_]+$/.test(tag)).slice(0, 6);

  return { name, tagline, description, descSentences, link, bharatHuntLink, maker, tags, audience, pricing, seed, bold, categories, keywords, hashtags };
}

type Parts = ReturnType<typeof baseParts>;

function founderDescription(product: LaunchProduct, parts: Parts): string {
  const bio = truncate(cleanLine(product.makerBio), 240);
  if (parts.maker && bio) return `${parts.maker} — ${bio}`;
  if (parts.maker) return `${parts.maker} is the maker of ${parts.name}. [Add one line about your background.]`;
  return `[Add a line about who you are and why you built ${parts.name}.]`;
}

function bulletPoints(parts: Parts, max: number): string[] {
  return parts.descSentences.slice(1, 1 + max).map((sentence) => `• ${withoutTrailingPunctuation(sentence)}`);
}

function xThread(parts: Parts, opener: string): string[] {
  const posts = [
    truncate(`${opener} ${parts.name} — ${lowerFirst(parts.tagline)}.`, 270),
    ...parts.descSentences.slice(0, 2).map((sentence) => truncate(sentence, 270)),
  ];
  if (parts.pricing) posts.push(parts.pricing);
  posts.push(truncate(`Try it: ${parts.link}\n\nFeedback welcome. ${parts.hashtags.slice(0, 3).join(" ")}`, 280));
  return posts;
}

function commonKit(product: LaunchProduct, platform: LaunchPlatform, parts: Parts): LaunchKit {
  const opener = parts.bold
    ? pick(["Just launched:", "It's live:", "Launch day:"], parts.seed)
    : pick(["I just launched", "Sharing something I built:", "New launch:"], parts.seed);
  const longDescription = [
    parts.description,
    parts.pricing,
  ].filter(Boolean).join("\n\n");

  const linkedinPost = [
    parts.bold
      ? `${parts.name} is live. ${parts.tagline}.`
      : `I've launched ${parts.name} — ${lowerFirst(parts.tagline)}.`,
    leadingSentences(parts.description, 500),
    bulletPoints(parts, 3).join("\n"),
    parts.pricing,
    `If this sounds useful for you or your team, I'd love your feedback: ${parts.link}`,
    parts.hashtags.slice(0, 4).join(" "),
  ].filter(Boolean).join("\n\n");

  const emailBody = [
    "Hi,",
    `I wanted to share something I've been working on: ${parts.name} — ${lowerFirst(parts.tagline)}.`,
    leadingSentences(parts.description, 600),
    parts.pricing,
    `You can try it here: ${parts.link}`,
    `It's also listed on BharatHunt: ${parts.bharatHuntLink}`,
    "I'd really value a reply with your honest thoughts.",
    parts.maker ? `Thanks,\n${parts.maker}` : "Thanks,",
  ].filter(Boolean).join("\n\n");

  return {
    title: parts.name,
    tagline: truncate(parts.tagline, 60),
    shortDescription: leadingSentences(parts.description, 260),
    longDescription,
    founderDescription: founderDescription(product, parts),
    launchStory: [
      `## Why I built ${parts.name}`,
      "[Share the problem you ran into that made you start — in your own words.]",
      `## What it does`,
      parts.description,
      "## What's next",
      "[One or two things you're working on next, and the feedback you most want.]",
    ].join("\n\n"),
    firstComment: [
      `Hi everyone 👋 I'm ${parts.maker ?? "the maker"} of ${parts.name}.`,
      leadingSentences(parts.description, 400),
      parts.pricing,
      "I'd love to hear what you think — what would make it more useful for you?",
    ].filter(Boolean).join("\n\n"),
    categories: parts.categories,
    keywords: parts.keywords,
    cta: product.pricingType === "paid" ? `Check out ${parts.name}` : `Try ${parts.name}`,
    socialPost: truncate(
      `${opener} ${parts.name} — ${lowerFirst(parts.tagline)}.\n\n${parts.link}\n\n${parts.hashtags.slice(0, 3).join(" ")}`,
      560,
    ),
    xThread: xThread(parts, opener),
    linkedinPost,
    redditTitle: truncate(`I built ${parts.name} — ${lowerFirst(parts.tagline)}. Looking for feedback`, 280),
    redditBody: [
      `Hey all, I'm the maker of ${parts.name}.`,
      leadingSentences(parts.description, 700),
      parts.pricing,
      `Link: ${parts.link}`,
      "I'm posting to get honest feedback — what's confusing, what's missing, what you'd change. Happy to answer questions in the comments.",
    ].filter(Boolean).join("\n\n"),
    emailSubject: truncate(`I just launched ${parts.name}`, 120),
    emailBody,
    hashtags: parts.hashtags,
    submissionNotes: [
      platform.requiresUserAction
        ? `Final submission happens on ${platform.name} — BharatHunt does not post on your behalf.`
        : `${platform.name} supports automated submission once connected.`,
      ...(platform.launchRules.note ? [platform.launchRules.note] : []),
      "Replace every [bracketed prompt] with your own words before posting.",
    ],
  };
}

function productHunt(kit: LaunchKit, product: LaunchProduct, parts: Parts): LaunchKit {
  const intro = parts.bold
    ? pick([`Hey Product Hunt! 🚀 Today we're launching ${parts.name}.`, `Hello Hunters 👋 ${parts.name} is live today.`], parts.seed)
    : pick([`Hi Product Hunt 👋`, `Hey Hunters 👋`, `Hello Product Hunt community 👋`], parts.seed);
  const makerLine = parts.maker ? `I'm ${parts.maker}, and I built ${parts.name}: ${lowerFirst(parts.tagline)}.` : `${parts.name}: ${lowerFirst(parts.tagline)}.`;
  const bullets = bulletPoints(parts, 4);
  return {
    ...kit,
    tagline: truncate(parts.tagline, 60),
    shortDescription: leadingSentences(parts.description, 260),
    firstComment: [
      intro,
      makerLine,
      "**Why I built it**\n[The problem you kept running into — one or two honest sentences.]",
      `**What it does**\n${bullets.length > 0 ? bullets.join("\n") : leadingSentences(parts.description, 400)}`,
      parts.pricing,
      "I'd love your honest feedback — what would make this more useful for you? I'll be here all day answering questions.",
    ].filter(Boolean).join("\n\n"),
    submissionNotes: [
      "Create the post from your own Product Hunt account; Product Hunt's API does not allow apps to post for you.",
      "Upload a thumbnail and gallery images; a short demo video helps people understand it quickly.",
      "Post the maker comment as soon as you're live, and reply to every comment.",
      "Do not ask anyone for upvotes — Product Hunt penalises vote solicitation.",
      ...kit.submissionNotes.slice(1),
    ],
  };
}

function showHn(kit: LaunchKit, product: LaunchProduct, parts: Parts): LaunchKit {
  const plainTagline = lowerFirst(dehype(parts.tagline)) || lowerFirst(parts.tagline);
  const title = truncate(`Show HN: ${dehype(parts.name) || parts.name} – ${plainTagline}`, 80);
  const stack = product.techStack.map(cleanLine).filter(Boolean);
  const body = [
    `Hi HN, I built ${parts.name}. ${withoutTrailingPunctuation(dehype(leadingSentences(parts.description, 500)))}.`,
    stack.length > 0 ? `It's built with ${stack.join(", ")}.` : "[A sentence on how it works under the hood.]",
    product.githubUrl ? `The source is here: ${cleanLine(product.githubUrl)}` : "",
    parts.pricing.replace(/, with paid upgrades/, " (paid tiers exist)"),
    "[What you'd most like feedback on — a design decision, a trade-off, a known limitation.]",
  ].filter(Boolean).join("\n\n");
  return {
    ...kit,
    title,
    tagline: truncate(plainTagline, 80),
    shortDescription: truncate(dehype(kit.shortDescription), 260),
    firstComment: body,
    socialPost: truncate(`${title}\n\n${parts.link}`, 560),
    cta: "Try it",
    hashtags: [],
    submissionNotes: [
      "Submit the link to the thing itself, not a landing page or sign-up page.",
      "Keep the title as-is: Show HN titles start with \"Show HN:\" and avoid marketing language.",
      "Post the explanation as the first comment, then stay to answer technical questions.",
      "Never ask friends or colleagues to upvote or comment — HN treats that as abuse.",
    ],
  };
}

function reddit(kit: LaunchKit): LaunchKit {
  return {
    ...kit,
    title: kit.redditTitle,
    firstComment: [
      "A bit more context since people asked:",
      "[How long you've worked on it, what it's built with, and what you'd like feedback on.]",
    ].join("\n\n"),
    hashtags: [],
    submissionNotes: [
      "Read the subreddit's rules on self-promotion before posting.",
      "Say you're the maker, ask for feedback, and reply to comments.",
      "Post once. Cross-posting the same text to many subreddits looks like spam.",
    ],
  };
}

function peerlist(kit: LaunchKit, product: LaunchProduct, parts: Parts): LaunchKit {
  return {
    ...kit,
    socialPost: truncate(
      `${parts.bold ? "Launching today on Peerlist:" : "I launched"} ${parts.name} on Peerlist Launchpad — ${lowerFirst(parts.tagline)}.\n\n${parts.link}`,
      560,
    ),
    submissionNotes: [
      "Add the project to your Peerlist profile first; only complete projects can launch.",
      "Launch on a Monday (UTC). Keep your launch post text-only so the project widget shows.",
      ...kit.submissionNotes.slice(1),
    ],
  };
}

function communityStory(kit: LaunchKit, product: LaunchProduct, parts: Parts): LaunchKit {
  return {
    ...kit,
    title: `I launched ${parts.name} — here's what I've learned so far`,
    firstComment: kit.launchStory,
    submissionNotes: [
      "Indie Hackers readers respond to honest stories: what you tried, what didn't work, real numbers only if you have them.",
      "Fill in every [bracketed prompt] with your own experience — do not post it with the prompts in.",
      ...kit.submissionNotes.slice(1),
    ],
  };
}

function devtools(kit: LaunchKit, product: LaunchProduct, parts: Parts): LaunchKit {
  const stack = product.techStack.map(cleanLine).filter(Boolean);
  return {
    ...kit,
    tagline: truncate(dehype(parts.tagline), 60),
    longDescription: [
      dehype(parts.description),
      stack.length > 0 ? `Built with ${stack.join(", ")}.` : "",
      product.githubUrl ? `Source: ${cleanLine(product.githubUrl)}` : "",
      parts.pricing,
    ].filter(Boolean).join("\n\n"),
    submissionNotes: [
      "Sign in with GitHub to submit.",
      "Lead with what the tool does technically and how a developer gets started.",
      ...kit.submissionNotes.slice(1),
    ],
  };
}

export function generateLaunchKit(
  product: LaunchProduct,
  platform: LaunchPlatform,
  signals: ProductSignals,
  options: KitOptions = {},
): LaunchKit {
  const parts = baseParts(product, platform, signals, options);
  const kit = commonKit(product, platform, parts);
  let styled: LaunchKit;
  switch (platform.contentStyle) {
    case "producthunt":
      styled = productHunt(kit, product, parts);
      break;
    case "show_hn":
      styled = showHn(kit, product, parts);
      break;
    case "reddit":
      styled = reddit(kit);
      break;
    case "peerlist":
      styled = peerlist(kit, product, parts);
      break;
    case "community_story":
      styled = communityStory(kit, product, parts);
      break;
    case "devtools":
      styled = devtools(kit, product, parts);
      break;
    default:
      styled = kit;
  }
  // The same validator the UI reads through: caps, markup, list shapes.
  return validateKit(styled);
}

/** Human labels for kit fields, in display order. */
export const KIT_FIELD_LABELS: { field: keyof LaunchKit; label: string; multiline: boolean; list?: boolean }[] = [
  { field: "title", label: "Title", multiline: false },
  { field: "tagline", label: "Tagline", multiline: false },
  { field: "shortDescription", label: "Short description", multiline: true },
  { field: "longDescription", label: "Long description", multiline: true },
  { field: "founderDescription", label: "Founder description", multiline: true },
  { field: "firstComment", label: "First comment / maker comment", multiline: true },
  { field: "launchStory", label: "Launch story", multiline: true },
  { field: "socialPost", label: "Social post", multiline: true },
  { field: "xThread", label: "X thread", multiline: true, list: true },
  { field: "linkedinPost", label: "LinkedIn post", multiline: true },
  { field: "redditTitle", label: "Reddit title", multiline: false },
  { field: "redditBody", label: "Reddit draft", multiline: true },
  { field: "emailSubject", label: "Email subject", multiline: false },
  { field: "emailBody", label: "Email announcement", multiline: true },
  { field: "categories", label: "Category suggestions", multiline: false, list: true },
  { field: "keywords", label: "Keywords", multiline: false, list: true },
  { field: "hashtags", label: "Hashtags", multiline: false, list: true },
  { field: "cta", label: "Call to action", multiline: false },
  { field: "submissionNotes", label: "Submission notes", multiline: true, list: true },
];
