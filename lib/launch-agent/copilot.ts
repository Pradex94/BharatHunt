/**
 * Launch Copilot: a chat-style assistant grounded in one campaign.
 *
 * It answers from the campaign it is handed — recommendations, checklists,
 * kits, dates — and from nothing else. Like the site's help chatbot
 * (lib/chatbot-knowledge.ts) it runs no model: the founder's message is matched
 * to an intent, and the reply is assembled from real rows. That is also why
 * prompt injection has nothing to grab — a message is only ever compared
 * against keyword lists, and product text only ever flows into replies as
 * quoted data.
 */

import { AUTOMATION_META, STATUS_META } from "./status.ts";
import { tagLabel } from "./signals.ts";
import type { LaunchAnalysis, LaunchKit, PlatformCampaignStatus, RequirementCheck, AutomationLevel } from "./types.ts";

export type CopilotPlatform = {
  slug: string;
  name: string;
  automationLevel: AutomationLevel;
  status: PlatformCampaignStatus;
  fitScore: number;
  recommended: boolean;
  reason: string;
  readiness: number;
  checks: RequirementCheck[];
  kit: LaunchKit | null;
  scheduledFor: string | null;
  submissionUrl: string | null;
};

export type CopilotContext = {
  productName: string;
  analysis: LaunchAnalysis | null;
  platforms: CopilotPlatform[];
  /** Listing gaps that affect every platform (no screenshots, short description…). */
  productGaps: string[];
  /** A bolder rewrite of a platform's kit, when the founder asks for one. */
  rewrite?: (slug: string) => LaunchKit | null;
};

export type CopilotReply = {
  text: string;
  blocks: { label: string; text: string }[];
  suggestions: string[];
};

export const COPILOT_MAX_MESSAGE = 500;

export const COPILOT_STARTERS = [
  "Where should I launch?",
  "What am I missing?",
  "Make my Product Hunt description more exciting",
  "What's my launch plan?",
  "Why is my score what it is?",
];

const ALIASES: Record<string, string[]> = {
  "product-hunt": ["product hunt", "producthunt", "ph"],
  "show-hn": ["hacker news", "hackernews", "show hn", "hn", "y combinator"],
  "reddit-sideproject": ["reddit", "sideproject", "r/sideproject"],
  "indie-hackers": ["indie hackers", "indiehackers", "ih"],
  peerlist: ["peerlist"],
  uneed: ["uneed"],
  betalist: ["betalist", "beta list"],
  "tiny-startups": ["tiny startups", "tinystartups"],
  devhunt: ["devhunt", "dev hunt"],
  "launching-next": ["launching next", "launchingnext"],
  alternativeto: ["alternativeto", "alternative to"],
};

function normalize(message: string): string {
  return ` ${message.toLowerCase().replace(/[^a-z0-9/ ]+/g, " ").replace(/\s+/g, " ").trim()} `;
}

function has(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(` ${word} `) || (word.includes(" ") && text.includes(word)));
}

export function findPlatform(message: string, platforms: CopilotPlatform[]): CopilotPlatform | null {
  const text = normalize(message);
  for (const platform of platforms) {
    const names = [normalize(platform.name).trim(), ...(ALIASES[platform.slug] ?? [])];
    if (names.some((name) => name && text.includes(` ${name} `))) return platform;
  }
  return null;
}

type Intent = "improve" | "missing" | "where" | "timeline" | "score" | "write" | "tracking" | "status" | "help";

export function classifyIntent(message: string): Intent {
  const text = normalize(message);
  if (has(text, ["exciting", "better", "improve", "rewrite", "punchier", "catchier", "stronger", "bolder", "more engaging", "polish"])) return "improve";
  if (has(text, ["missing", "ready", "checklist", "requirements", "what else", "left to do", "todo", "gaps", "need to"])) return "missing";
  if (has(text, ["utm", "traffic", "analytics", "track", "tracking", "clicks", "visitors"])) return "tracking";
  if (has(text, ["when", "timeline", "plan", "schedule", "date", "dates", "sequence", "order"])) return "timeline";
  if (has(text, ["score", "why", "fit", "rating"])) return "score";
  if (has(text, ["write", "draft", "post", "tweet", "thread", "linkedin", "email", "comment", "title", "tagline", "description", "copy"])) return "write";
  if (has(text, ["status", "progress", "submitted", "published", "done"])) return "status";
  if (has(text, ["where", "launch", "recommend", "platforms", "which", "best", "start"])) return "where";
  return "help";
}

function reply(text: string, blocks: CopilotReply["blocks"] = [], suggestions: string[] = []): CopilotReply {
  return { text, blocks, suggestions: suggestions.slice(0, 3) };
}

function recommended(context: CopilotContext): CopilotPlatform[] {
  return context.platforms.filter((platform) => platform.recommended).sort((a, b) => b.fitScore - a.fitScore);
}

function whereToLaunch(context: CopilotContext): CopilotReply {
  const top = recommended(context).slice(0, 4);
  if (top.length === 0) {
    return reply(
      "No platform is a strong match yet. A fuller description, a logo and a few screenshots are the quickest way to change that.",
      [],
      ["What am I missing?"],
    );
  }
  const names = top.map((platform) => platform.name);
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
  return reply(
    `Based on your listing, I recommend ${list}. ${top[0].name} is your strongest fit (${top[0].fitScore}/100).`,
    top.map((platform) => ({
      label: `${platform.name} · ${platform.fitScore}/100 · ${AUTOMATION_META[platform.automationLevel].label}`,
      text: platform.reason,
    })),
    [`Make my ${top[0].name} description more exciting`, "What's my launch plan?", "What am I missing?"],
  );
}

function whatsMissing(context: CopilotContext, platform: CopilotPlatform | null): CopilotReply {
  const targets = platform ? [platform] : recommended(context);
  const blocks: CopilotReply["blocks"] = [];
  const unprepared: string[] = [];

  for (const target of targets) {
    if (target.status === "NOT_STARTED") {
      unprepared.push(target.name);
      continue;
    }
    const missing = target.checks.filter((check) => check.status === "missing");
    const manual = target.checks.filter((check) => check.status === "manual");
    if (missing.length === 0 && manual.length === 0) continue;
    blocks.push({
      label: `${target.name} · ${target.readiness}% ready`,
      text: [
        ...missing.map((check) => `⚠ ${check.label}${check.hint ? ` — ${check.hint}` : ""}`),
        ...manual.map((check) => `☐ On ${target.name}: ${check.label}`),
      ].join("\n"),
    });
  }

  const parts: string[] = [];
  if (context.productGaps.length > 0) parts.push(`Across every platform, your listing would benefit from: ${context.productGaps.join("; ")}.`);
  if (unprepared.length > 0) parts.push(`Not prepared yet: ${unprepared.join(", ")} — press "Prepare" on those cards to get a checklist.`);
  if (blocks.length === 0 && parts.length === 0) {
    return reply(
      platform ? `${platform.name} has everything BharatHunt can check. The remaining steps happen on ${platform.name} itself.` : "Everything BharatHunt can check is in place. The remaining steps happen on each platform.",
      [],
      ["What's my launch plan?"],
    );
  }
  return reply(parts.join(" ") || "Here's what's left:", blocks, ["Where should I launch?", "What's my launch plan?"]);
}

function improve(context: CopilotContext, platform: CopilotPlatform | null): CopilotReply {
  const target = platform ?? recommended(context)[0] ?? null;
  if (!target) return reply("Tell me which platform — for example, \"Make my Product Hunt description more exciting\".");
  const kit = context.rewrite?.(target.slug) ?? null;
  if (!kit) {
    return reply(`I couldn't prepare a rewrite for ${target.name} right now. Try again, or use Regenerate on the card.`);
  }
  const blocks = [
    { label: `${target.name} tagline`, text: kit.tagline },
    { label: `${target.name} description`, text: kit.shortDescription },
    { label: `${target.name} first comment`, text: kit.firstComment },
  ].filter((block) => block.text);
  const note = target.slug === "show-hn"
    ? "Hacker News readers dislike hype, so this stays plain — punchier here means clearer, not louder."
    : `Here's a livelier version for ${target.name}, built only from what your listing says. Copy what you like, or paste it into the kit with Edit.`;
  return reply(note, blocks, ["What am I missing?", "What's my launch plan?"]);
}

function timeline(context: CopilotContext): CopilotReply {
  const dated = context.platforms.filter((platform) => platform.scheduledFor).sort((a, b) => (a.scheduledFor! < b.scheduledFor! ? -1 : 1));
  if (dated.length === 0) return reply("There's no launch plan yet. Open the timeline and I'll suggest dates once your campaign is analysed.");
  return reply(
    "Here's your suggested sequence. It's a recommendation — change any date in the timeline.",
    [{ label: "Launch plan", text: dated.map((platform) => `${platform.scheduledFor} — ${platform.name}`).join("\n") }],
    ["What am I missing?"],
  );
}

function score(context: CopilotContext): CopilotReply {
  const analysis = context.analysis;
  if (!analysis) return reply("Your campaign hasn't been analysed yet — open it once and the score appears.");
  const audience = analysis.matchedAudience.map(tagLabel).join(", ") || "general";
  return reply(
    `Your Distribution Score is ${analysis.productFit}/100. It's 60% how well your best platforms fit (${analysis.breakdown.platformFit}/100) and 40% how complete your listing is (${analysis.breakdown.listingCompleteness}/100). The audience that matched: ${audience}.`,
    [],
    analysis.breakdown.listingCompleteness < 80 ? ["What am I missing?"] : ["Where should I launch?"],
  );
}

const WRITE_FIELDS: [string[], keyof LaunchKit, string][] = [
  [["linkedin"], "linkedinPost", "LinkedIn post"],
  [["thread", "tweet", "twitter", "x"], "xThread", "X thread"],
  [["email", "newsletter"], "emailBody", "Email announcement"],
  [["reddit"], "redditBody", "Reddit draft"],
  [["comment", "maker comment"], "firstComment", "First comment"],
  [["story"], "launchStory", "Launch story"],
  [["title"], "title", "Title"],
  [["tagline"], "tagline", "Tagline"],
  [["description"], "longDescription", "Description"],
];

function write(context: CopilotContext, platform: CopilotPlatform | null, message: string): CopilotReply {
  const text = normalize(message);
  const target = platform ?? recommended(context)[0] ?? null;
  if (!target) return reply("Prepare a platform first, and I can pull any draft from its launch kit.");
  if (!target.kit) {
    return reply(`${target.name} isn't prepared yet. Press "Prepare" on its card, then ask me again.`, [], []);
  }
  const match = WRITE_FIELDS.find(([words]) => has(text, words));
  const [, field, label] = match ?? [[], "socialPost", "Social post"];
  const value = target.kit[field];
  const content = Array.isArray(value) ? value.join(field === "xThread" ? "\n\n" : ", ") : value;
  return reply(`From your ${target.name} launch kit:`, content ? [{ label, text: content }] : [], ["Make it more exciting", "What am I missing?"]);
}

function status(context: CopilotContext): CopilotReply {
  const rows = recommended(context).map((platform) => `${platform.name} — ${STATUS_META[platform.status].label}`);
  return reply(
    "Here's where each recommended platform stands. Submitted and published states are what you've marked — BharatHunt can't see other sites.",
    rows.length > 0 ? [{ label: "Launch progress", text: rows.join("\n") }] : [],
  );
}

function tracking(): CopilotReply {
  return reply(
    "Every link in your launch kits carries utm_source (for example utm_source=producthunt), so visits from each launch show up in your own website analytics. BharatHunt can't see traffic that lands on your site from other platforms, so we don't show numbers we haven't measured.",
  );
}

export function answerCopilot(rawMessage: string, context: CopilotContext): CopilotReply {
  const message = rawMessage.slice(0, COPILOT_MAX_MESSAGE);
  if (!message.trim()) return reply("Ask me about where to launch, what's missing, or your launch plan.", [], COPILOT_STARTERS);
  const platform = findPlatform(message, context.platforms);
  switch (classifyIntent(message)) {
    case "improve":
      return improve(context, platform);
    case "missing":
      return whatsMissing(context, platform);
    case "timeline":
      return timeline(context);
    case "score":
      return score(context);
    case "write":
      return write(context, platform, message);
    case "status":
      return status(context);
    case "tracking":
      return tracking();
    case "where":
      return whereToLaunch(context);
    default:
      return reply(
        `I can help ${context.productName} with where to launch, what's missing, rewriting a platform's copy, your launch plan and your score.`,
        [],
        COPILOT_STARTERS,
      );
  }
}
