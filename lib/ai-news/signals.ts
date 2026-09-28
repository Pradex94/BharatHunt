/**
 * What the AI hub says *about* stories, derived only from data the pipeline
 * holds: the brief, the weekly highlights, "Why it matters", and whether a
 * topic is rising.
 *
 * There is no language model behind any of this, and that is a standing
 * decision rather than a gap (no ANTHROPIC_API_KEY — see the note in
 * lib/ai-news/summarize.ts). So nothing here interprets an article. Every
 * sentence is either a count the reader could verify from the story page
 * ("covered by 6 publications"), a position in our own ranking, or the
 * audience a category serves. The UI labels all of it as automated context,
 * never as analysis.
 *
 * Pure and framework-agnostic: no `server-only`, no Supabase, so it is testable
 * under `node --test` and importable anywhere.
 */

import { AI_CATEGORIES } from "./constants.ts";

/** The fields these helpers read — a structural subset of `AiStoryCard`. */
export type SignalStory = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  category: string;
  region: string;
  trend_score: number | null;
  source_count: number;
  last_seen_at: string | null;
};

const HOUR = 60 * 60 * 1000;

function ageHours(value: string | null, now: Date): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return null;
  return (now.getTime() - time) / HOUR;
}

// ── Card summary ─────────────────────────────────────────────────────────

function looseText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Sentence boundaries: terminal punctuation, a space, then a capital or digit. */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=["“'‘(]?[\p{Lu}\p{N}])/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

/**
 * The part of a composed summary worth printing under its own headline.
 *
 * `composeSummary` opens with the headline restated as a sentence (right for a
 * detail page or a meta description, where it stands alone) and closes with how
 * Bharat Hunt filed the story. Under a card's headline the first is a
 * duplicate and the second is housekeeping, so a card keeps only the middle:
 * who the story involves and who is reporting it. Returns null when nothing is
 * left, and the card then shows its headline alone.
 */
export function cardSummary(summary: string | null | undefined, title: string): string | null {
  if (!summary) return null;

  const titleKey = looseText(title);
  const kept = sentences(summary).filter((sentence, index) => {
    if (index === 0) {
      const key = looseText(sentence);
      if (key && titleKey && (key.startsWith(titleKey) || titleKey.startsWith(key))) return false;
    }
    if (/^Bharat Hunt files it under\b/.test(sentence)) return false;
    if (/^Open the original report\b/.test(sentence)) return false;
    return true;
  });

  const text = kept.join(" ").trim();
  return text.length > 0 ? text : null;
}

// ── Why it matters ───────────────────────────────────────────────────────

/**
 * Who a category is most useful to. A classification of the *category*, not a
 * reading of any article — which is why it is phrased as "most relevant to"
 * rather than as a claim about consequences.
 */
const AUDIENCE: Record<string, string> = {
  "AI Models": "developers and founders building on foundation models",
  "Generative AI": "product teams and creators using generation tools",
  "AI Agents": "developers building agents and automation",
  "AI Startups": "founders and investors tracking the AI market",
  "AI Funding": "founders raising and investors deploying capital in AI",
  "AI Tools": "anyone choosing AI tools for their work",
  "AI Coding": "software engineers and engineering leaders",
  "AI Research": "researchers and technical teams",
  Robotics: "hardware founders and teams working on embodied AI",
  "Computer Vision": "teams building vision and multimodal products",
  "AI Regulation": "founders, compliance teams and anyone shipping AI to users",
  "Open Source AI": "developers who self-host or fine-tune models",
  "Enterprise AI": "enterprise buyers and B2B founders",
  "AI Hardware": "teams planning compute, inference cost and infrastructure",
  "AI in India": "Indian founders, students and policy watchers",
};

export function audienceFor(category: string | null | undefined): string | null {
  if (!category) return null;
  return AUDIENCE[category] ?? null;
}

export type WhyItMatters = {
  /** A verifiable fact about the story's coverage or ranking. */
  signal: string;
  /** Who the category serves, or null for a category outside the taxonomy. */
  audience: string | null;
};

/**
 * "Why it matters", built from coverage breadth and rank — or null.
 *
 * Null is the common answer and the right one: a story one outlet reported and
 * that sits mid-table has no signal worth a callout, and a callout on every card
 * would stop meaning anything. `rank` is the story's 1-based position in the
 * trend-ordered list it was drawn from, when the caller knows it.
 */
export function whyItMatters(
  story: Pick<SignalStory, "source_count" | "category" | "region" | "trend_score">,
  rank?: number,
): WhyItMatters | null {
  const sources = Number(story.source_count) || 0;
  const ranked = story.trend_score !== null && rank !== undefined && rank >= 1 && rank <= 3;

  let signal: string | null = null;
  if (sources >= 5) {
    signal = `Covered by ${sources} independent publications — one of the most widely reported AI stories right now.`;
  } else if (sources >= 3) {
    signal = `${sources} independent publications have reported it, so it is more than a single outlet's claim.`;
  } else if (ranked) {
    signal = `Ranked #${rank} on the BharatHunt Trend Score right now.`;
  } else if (sources === 2) {
    signal = "Reported by two independent publications.";
  }

  if (!signal) return null;

  if (story.region === "india" && story.category !== "AI in India") {
    signal = `${signal} An India-specific development.`;
  }

  return { signal, audience: audienceFor(story.category) };
}

// ── Momentum ─────────────────────────────────────────────────────────────

export type Momentum = "rising" | "steady" | "cooling";

/**
 * A topic's direction from its window-over-window change, or null.
 *
 * Null whenever `change_pct` is null — which the SQL returns when the earlier
 * window was too small to divide by. No arrow is drawn then, because a
 * direction the system cannot calculate is not one it may claim.
 */
export function momentum(changePct: number | null | undefined, threshold = 15): Momentum | null {
  if (changePct === null || changePct === undefined) return null;
  const value = Number(changePct);
  if (!Number.isFinite(value)) return null;
  if (value >= threshold) return "rising";
  if (value <= -threshold) return "cooling";
  return "steady";
}

// ── The daily brief ──────────────────────────────────────────────────────

export type Brief<T extends SignalStory> = {
  /** The window the stories were drawn from, in hours. */
  windowHours: number;
  stories: T[];
};

/**
 * "Today's AI Brief": the highest-ranked stories covered in the last day.
 *
 * `pool` must already be in trend order (it is the output of the trending
 * feed). If the last 24 hours hold fewer than `min` stories — a quiet day, or a
 * scheduled run that has not landed yet — the window widens to 72 hours and
 * says so, rather than padding a "today" brief with older news.
 */
export function buildBrief<T extends SignalStory>(
  pool: T[],
  now: Date,
  { max = 5, min = 3 }: { max?: number; min?: number } = {},
): Brief<T> {
  for (const windowHours of [24, 72]) {
    const stories = pool
      .filter((story) => {
        const age = ageHours(story.last_seen_at, now);
        return age !== null && age <= windowHours;
      })
      .slice(0, max);
    if (stories.length >= min || windowHours === 72) return { windowHours, stories };
  }
  return { windowHours: 72, stories: [] };
}

// ── Weekly highlights ────────────────────────────────────────────────────

export type Highlight<T extends SignalStory> = {
  key: string;
  title: string;
  description: string;
  href: string;
  stories: T[];
};

type HighlightDef = {
  key: string;
  title: string;
  description: string;
  href: string;
  pick: (story: SignalStory) => boolean;
  /** Most-covered first, instead of the pool's trend order. */
  byCoverage?: boolean;
};

const HIGHLIGHTS: HighlightDef[] = [
  {
    key: "most-covered",
    title: "The week's most-covered AI developments",
    description: "Stories the most independent publications reported this week.",
    href: "/ai?date=7d",
    pick: (story) => story.source_count >= 2,
    byCoverage: true,
  },
  {
    key: "models",
    title: "Model releases and updates",
    description: "New and updated models, open and closed.",
    href: "/ai?type=models&date=7d",
    pick: (story) => story.category === "AI Models" || story.category === "Open Source AI",
  },
  {
    key: "launches",
    title: "AI tools and launches",
    description: "Assistants, coding tools and generation products in the news.",
    href: "/ai?type=launches&date=7d",
    pick: (story) =>
      ["AI Tools", "AI Coding", "Generative AI", "AI Agents"].includes(story.category),
  },
  {
    key: "funding",
    title: "Funding, deals and companies",
    description: "Rounds, acquisitions and company moves in AI.",
    href: "/ai?type=funding&date=7d",
    pick: (story) =>
      ["AI Funding", "AI Startups", "Enterprise AI"].includes(story.category),
  },
  {
    key: "policy-research",
    title: "Research and policy",
    description: "Papers, benchmarks, safety results and regulation.",
    href: "/ai?type=research&date=7d",
    pick: (story) => story.category === "AI Research" || story.category === "AI Regulation",
  },
];

/**
 * Themed digests of the week, each built from the same trend-ordered pool so
 * the page makes one query for all of them.
 *
 * A story appears in at most one digest, and a digest with fewer than two
 * stories is dropped — a "roundup" of one story is just a card with a heading.
 */
export function buildHighlights<T extends SignalStory>(
  pool: T[],
  { perGroup = 4, exclude = [] }: { perGroup?: number; exclude?: string[] } = {},
): Highlight<T>[] {
  const used = new Set(exclude);
  const out: Highlight<T>[] = [];

  for (const def of HIGHLIGHTS) {
    const candidates = pool.filter((story) => !used.has(story.id) && def.pick(story));
    const ordered = def.byCoverage
      ? [...candidates].sort((a, b) => b.source_count - a.source_count)
      : candidates;
    const stories = ordered.slice(0, perGroup);
    if (stories.length < 2) continue;

    for (const story of stories) used.add(story.id);
    out.push({
      key: def.key,
      title: def.title,
      description: def.description,
      href: def.href,
      stories,
    });
  }

  return out;
}

/** Category label → the hint the classifier implements, for tooltips. */
export function categoryHint(category: string): string | undefined {
  return AI_CATEGORIES.find((entry) => entry.value === category)?.hint;
}
