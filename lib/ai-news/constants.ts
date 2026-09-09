/**
 * The AI Trending vocabulary.
 *
 * Framework-agnostic and safe to import from a client component — the same
 * contract as `lib/constants.ts`, and for the same reason: the category rail,
 * the sort control and the region toggle are all interactive, so they need this
 * list in the browser and must not drag a Supabase client along with it.
 *
 * Nothing here imports `next/*`, `server-only` or `@supabase/*`. Keep it that
 * way.
 */

// ── Categories ───────────────────────────────────────────────────────────

/**
 * The taxonomy an article is classified into, in the order the filter rail
 * shows them.
 *
 * `value` is what the database stores and what `ai_stories.category` holds;
 * `slug` is the URL token. They are separate because the URL should read
 * `?category=ai-agents` while the row should read "AI Agents" — the same split
 * `PRODUCT_CATEGORIES` makes, for the same reason.
 *
 * `hint` is not decoration: it is the plain-English definition
 * `lib/ai-news/classify.ts` implements, kept next to the label so the two
 * cannot drift into meaning different things.
 */
export type AiCategoryDef = {
  value: string;
  slug: string;
  label: string;
  hint: string;
};

export const AI_CATEGORIES: AiCategoryDef[] = [
  {
    value: "AI Models",
    slug: "ai-models",
    label: "AI Models",
    hint: "A new or updated model, its capabilities, benchmarks or availability.",
  },
  {
    value: "Generative AI",
    slug: "generative-ai",
    label: "Generative AI",
    hint: "Text, image, audio and video generation — products and their output.",
  },
  {
    value: "AI Agents",
    slug: "ai-agents",
    label: "AI Agents",
    hint: "Autonomous and tool-using systems, agent frameworks, MCP and orchestration.",
  },
  {
    value: "AI Startups",
    slug: "ai-startups",
    label: "AI Startups",
    hint: "Company launches, pivots, hires and shutdowns at AI companies.",
  },
  {
    value: "AI Funding",
    slug: "ai-funding",
    label: "AI Funding",
    hint: "Rounds, valuations, acquisitions and investor moves in AI.",
  },
  {
    value: "AI Tools",
    slug: "ai-tools",
    label: "AI Tools",
    hint: "Applications people use — assistants, editors, search, productivity.",
  },
  {
    value: "AI Coding",
    slug: "ai-coding",
    label: "AI Coding",
    hint: "Code generation, developer agents, IDEs and software engineering.",
  },
  {
    value: "AI Research",
    slug: "ai-research",
    label: "AI Research",
    hint: "Papers, benchmarks, evaluations, interpretability and safety results.",
  },
  {
    value: "Robotics",
    slug: "robotics",
    label: "Robotics",
    hint: "Embodied AI, humanoids, autonomous vehicles and drones.",
  },
  {
    value: "Computer Vision",
    slug: "computer-vision",
    label: "Computer Vision",
    hint: "Image and video understanding, detection, recognition, multimodal perception.",
  },
  {
    value: "AI Regulation",
    slug: "ai-regulation",
    label: "AI Regulation",
    hint: "Law, policy, courts, standards and government positions on AI.",
  },
  {
    value: "Open Source AI",
    slug: "open-source-ai",
    label: "Open Source AI",
    hint: "Open-weight models, permissive licences and community releases.",
  },
  {
    value: "Enterprise AI",
    slug: "enterprise-ai",
    label: "Enterprise AI",
    hint: "Deployment inside businesses — platforms, adoption, cost, integration.",
  },
  {
    value: "AI Hardware",
    slug: "ai-hardware",
    label: "AI Hardware",
    hint: "Chips, accelerators, data centres, on-device inference and supply.",
  },
  {
    value: "AI in India",
    slug: "ai-in-india",
    label: "AI in India",
    hint: "India's AI ecosystem — government programmes, institutions, national models.",
  },
];

export const AI_CATEGORY_VALUES = AI_CATEGORIES.map((category) => category.value);

/** URL token → stored value. Unknown tokens resolve to undefined, i.e. "All AI". */
export function categoryFromSlug(slug: string | null | undefined): string | undefined {
  if (!slug) return undefined;
  return AI_CATEGORIES.find((category) => category.slug === slug)?.value;
}

/** Stored value → URL token, for building links out of a row. */
export function slugFromCategory(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  return AI_CATEGORIES.find((category) => category.value === value)?.slug;
}

// ── Region ───────────────────────────────────────────────────────────────

export const AI_REGIONS = ["india", "global"] as const;
export type AiRegion = (typeof AI_REGIONS)[number];

export function regionFromParam(raw: string | null | undefined): AiRegion | undefined {
  return (AI_REGIONS as readonly string[]).includes(raw ?? "") ? (raw as AiRegion) : undefined;
}

// ── Sorting ──────────────────────────────────────────────────────────────

/**
 * `trending` ranks by the BharatHunt Trend Score, `latest` by when the story
 * was last covered, `relevance` by trigram similarity to the query.
 *
 * `relevance` is only meaningful with a `?q=`, which is why the page picks it
 * as the default the moment one is present — the same rule the marketplace
 * follows.
 */
export const AI_SORTS = ["trending", "latest", "relevance"] as const;
export type AiSort = (typeof AI_SORTS)[number];

export const AI_SORT_LABELS: Record<AiSort, string> = {
  trending: "Trending",
  latest: "Latest",
  relevance: "Best match",
};

// ── Paging ───────────────────────────────────────────────────────────────

/** Stories per page in the "Latest AI News" feed. Mirrors PRODUCTS_PAGE_SIZE. */
export const AI_STORIES_PAGE_SIZE = 12;

/** How many stories the "Trending Now" rail shows. Section 3 asks for 5-10. */
export const AI_TRENDING_LIMIT = 8;

// ── Pipeline thresholds ──────────────────────────────────────────────────
//
// These live here rather than in the ingestion module because the admin screen
// prints them: an operator looking at a rejected article needs to see the bar
// it failed to clear, and a number quoted in two places is a number that will
// eventually disagree with itself.

/**
 * Below this relevance an article is not about AI and is rejected.
 *
 * Tuned against the failure the brief names: "New smartphone launched" scores
 * near zero and is dropped, while "New smartphone launches with on-device AI
 * model" clears it on the strength of "on-device" and "model" appearing next to
 * an AI term. See `tests/ai-news-classify.test.ts`, which asserts exactly that
 * pair.
 */
export const AI_RELEVANCE_MIN = 0.35;

/**
 * Above this relevance a story from an `auto_publish` source goes live without
 * a human; between the two thresholds it waits in /admin/ai-news.
 *
 * The gap is the point. A news feature that required an admin for every story
 * would be empty most of the day, and one that published everything would have
 * no review step at all — so the confident middle publishes itself and the
 * uncertain tail becomes a queue a person can actually get through.
 */
export const AUTO_PUBLISH_RELEVANCE = 0.55;

/**
 * Jaccard headline overlap above which two articles are *candidates* for the
 * same story. Never sufficient on its own — `groupArticle` also requires a
 * shared primary entity and publication times inside `STORY_WINDOW_HOURS`.
 *
 * Set well below 1 deliberately: "OpenAI releases new model" and "OpenAI
 * launches latest AI model" share {openai, new/latest…} and score around 0.4,
 * which is the exact pair section 12 asks to be treated as one story.
 */
export const DUPLICATE_TITLE_THRESHOLD = 0.42;

/**
 * How far apart two articles may be published and still be the same event.
 *
 * Three days, not three hours: a US release is covered by Indian publications
 * the next morning, and treating that as a separate story is how an aggregator
 * ends up showing the same news twice.
 */
export const STORY_WINDOW_HOURS = 72;

/**
 * How old the last successful ingestion may be before the page stops claiming
 * to be up to date and shows the "ingestion temporarily unavailable" state.
 *
 * Three hours covers the slowest configured poll interval plus a missed run.
 * Past that, something is wrong and saying "Updated 4 hours ago" would be
 * technically true and practically misleading.
 */
export const FRESHNESS_STALE_MINUTES = 180;

/**
 * Stories older than this are not rescored at the end of an ingestion run.
 *
 * The score is a claim about *now*, and a story nothing has covered in a week
 * has a settled one. Bounding the rescore is also what keeps a run's cost
 * proportional to activity rather than to the size of the archive.
 */
export const RESCORE_WINDOW_HOURS = 168;

/** Trend snapshots older than this are pruned at the end of a run. */
export const SNAPSHOT_RETENTION_DAYS = 60;
