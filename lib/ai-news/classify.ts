/**
 * Is this article about AI, and if so, about what (sections 10 and 11).
 *
 * The classifier is a weighted lexicon, not a model call, and that is a
 * deliberate choice rather than a shortcut:
 *
 *  - It is **deterministic**. The same headline classifies the same way today
 *    and next month, so a category page does not silently reshuffle itself and
 *    a rejected article stays rejected on the next run instead of flapping.
 *  - It is **auditable**. `classifyArticle` returns the signals it fired on, so
 *    /admin/ai-news can show *why* something was filed under AI Hardware, and a
 *    mistake is fixed by editing a list in this file.
 *  - It is **free and instant**, which matters when a run classifies several
 *    hundred articles every ten minutes and must finish inside a request.
 *  - It never invents anything. Every field it returns is a consequence of text
 *    that was actually in the feed.
 *
 * Where an LLM would extend this
 * ------------------------------
 * The seam is `classifyArticle`'s return type. A model-backed classifier that
 * produced the same `ArticleClassification` could be dropped in behind an
 * environment flag and the rest of the pipeline would not change. That is not
 * implemented here and nothing in this feature claims it is — the code that
 * runs is the code in this file.
 *
 * Pure and dependency-free, so `tests/ai-news-classify.test.ts` exercises it
 * directly.
 */

import { AI_CATEGORIES, AI_RELEVANCE_MIN } from "./constants.ts";
import { extractEntities, type ExtractedEntity } from "./entities.ts";
import { normalizeTitle } from "./normalize.ts";

// ── The AI lexicon ───────────────────────────────────────────────────────

/**
 * Terms that make an article about AI, and how much each is worth.
 *
 * The weights are the judgement. "large language model" is unambiguous and
 * scores 1.0; "model" on its own appears in "business model" and "model year"
 * and scores 0.25, enough to push a borderline article over the line when
 * something else is already there and never enough on its own. That pairing is
 * exactly the case section 10 names: "New smartphone launched" must be
 * rejected, "New smartphone launches with on-device AI model" must not be.
 */
const AI_TERMS: Array<[term: string, weight: number]> = [
  // Unambiguous
  ["artificial intelligence", 1],
  ["large language model", 1],
  ["large language models", 1],
  ["generative ai", 1],
  ["machine learning", 1],
  ["deep learning", 1],
  ["neural network", 1],
  ["neural networks", 1],
  ["foundation model", 1],
  ["foundation models", 1],
  ["frontier model", 1],
  ["ai model", 1],
  ["ai models", 1],
  ["ai agent", 1],
  ["ai agents", 1],
  ["agentic", 1],
  ["chatbot", 0.9],
  ["llm", 0.9],
  ["llms", 0.9],
  ["genai", 0.9],
  ["transformer", 0.7],
  ["diffusion model", 0.9],
  ["computer vision", 0.9],
  ["natural language processing", 0.9],
  ["reinforcement learning", 0.9],
  ["fine tuning", 0.7],
  ["fine tune", 0.7],
  ["prompt engineering", 0.8],
  ["inference", 0.5],
  ["training run", 0.7],
  ["benchmark", 0.35],
  ["hallucination", 0.7],
  ["multimodal", 0.7],
  ["text to image", 0.8],
  ["text to video", 0.8],
  ["speech recognition", 0.7],
  ["autonomous agent", 0.9],
  ["copilot", 0.5],
  ["open weights", 0.8],
  ["open weight", 0.8],
  ["superintelligence", 0.9],
  ["agi", 0.9],
  // Embodied AI. Absent from the first draft of this list, which meant
  // "Figure's humanoid robot learns to fold laundry" scored exactly zero —
  // a whole category of the taxonomy that the relevance filter could not see.
  ["robotics", 0.8],
  ["humanoid", 0.8],
  ["autonomous vehicle", 0.8],
  ["self driving", 0.8],
  ["embodied", 0.7],
  ["robot", 0.5],
  ["robots", 0.5],
  ["drone", 0.3],

  // The bare token. Weighted below the phrases because it is also a Scrabble
  // word and a French preposition, and because a headline that says only "AI"
  // once is weak evidence on its own.
  ["ai", 0.55],

  // Contextual: worth something only next to the above.
  ["model", 0.25],
  ["models", 0.25],
  ["algorithm", 0.25],
  ["dataset", 0.3],
  ["training data", 0.6],
  ["on device", 0.35],
  ["gpu", 0.4],
  ["gpus", 0.4],
  ["accelerator", 0.3],
  ["neural", 0.4],
  ["automation", 0.2],
  ["assistant", 0.25],
  ["reasoning", 0.3],
  ["token", 0.2],
  ["tokens", 0.2],
  ["parameters", 0.25],
  ["embedding", 0.5],
  ["embeddings", 0.5],
  ["vector database", 0.7],
  ["rag", 0.5],
  ["mcp", 0.5],
];

/**
 * Terms whose presence argues *against* an article being AI coverage.
 *
 * A small, blunt list for the failure this classifier is most prone to: a
 * general tech feed's cryptocurrency, gadget-review and gaming posts, which
 * often mention "model" or "neural engine" in passing. Each subtracts, and the
 * subtraction can take an article below the threshold but never below zero.
 */
const NEGATIVE_TERMS: Array<[term: string, weight: number]> = [
  ["cryptocurrency", 0.5],
  ["bitcoin", 0.5],
  ["crypto", 0.4],
  ["nft", 0.4],
  ["deal of the day", 0.6],
  ["best deals", 0.6],
  ["discount", 0.3],
  ["coupon", 0.4],
  ["horoscope", 0.8],
  ["recipe", 0.5],
  ["box office", 0.6],
  ["cricket", 0.5],
  ["football", 0.5],
];

// ── Category lexicons ────────────────────────────────────────────────────
//
// One list per stored category, in the same order as AI_CATEGORIES. The
// highest-scoring list wins and the runner-up becomes `sub_category`, which is
// why a story about an open-weight coding model can be filed under AI Coding
// and still say "Open Source AI" underneath.

const CATEGORY_TERMS: Record<string, Array<[term: string, weight: number]>> = {
  "AI Models": [
    ["model", 0.6], ["models", 0.6], ["gpt", 1], ["claude", 1], ["gemini", 1], ["llama", 1],
    ["mistral", 0.9], ["qwen", 0.9], ["deepseek", 0.9], ["context window", 1],
    ["parameters", 0.7], ["benchmark", 0.6], ["frontier model", 1.2], ["reasoning model", 1.2],
    ["multimodal", 0.7], ["release", 0.3], ["version", 0.3],
  ],
  "Generative AI": [
    ["generative ai", 1.4], ["text to image", 1.2], ["text to video", 1.2], ["image generation", 1.2],
    ["video generation", 1.2], ["music generation", 1.2], ["diffusion", 1], ["midjourney", 1],
    ["stable diffusion", 1.2], ["sora", 1], ["veo", 1], ["deepfake", 0.9], ["synthetic media", 1],
    ["voice cloning", 1],
  ],
  "AI Agents": [
    ["ai agent", 1.4], ["ai agents", 1.4], ["agentic", 1.4], ["autonomous agent", 1.4],
    ["agent framework", 1.4], ["multi agent", 1.3], ["tool use", 0.9], ["mcp", 1],
    ["model context protocol", 1.4], ["workflow automation", 0.9], ["orchestration", 0.7],
    ["computer use", 1],
  ],
  "AI Startups": [
    ["startup", 1.2], ["startups", 1.2], ["founder", 0.9], ["founders", 0.9], ["launches", 0.4],
    ["stealth", 1], ["pivot", 0.8], ["shuts down", 0.9], ["acqui hire", 1.1], ["yc", 0.8],
    ["y combinator", 1.2], ["incubator", 0.9], ["hiring", 0.5],
  ],
  "AI Funding": [
    ["funding", 1.4], ["raises", 1.4], ["raised", 1.3], ["series a", 1.4], ["series b", 1.4],
    ["series c", 1.4], ["seed round", 1.4], ["valuation", 1.3], ["investors", 1],
    ["venture capital", 1.2], ["acquisition", 1.1], ["acquires", 1.1], ["ipo", 1.1],
    ["million", 0.5], ["billion", 0.6], ["crore", 0.7],
  ],
  "AI Tools": [
    ["app", 0.6], ["tool", 0.9], ["tools", 0.9], ["feature", 0.6], ["assistant", 0.9],
    ["chatbot", 0.9], ["plugin", 0.8], ["extension", 0.7], ["productivity", 0.9],
    ["search engine", 0.9], ["browser", 0.7], ["subscription", 0.6], ["users", 0.4],
  ],
  "AI Coding": [
    ["coding", 1.4], ["code", 1], ["developer", 1], ["developers", 1], ["programming", 1.2],
    ["software engineering", 1.2], ["copilot", 1.2], ["cursor", 1], ["ide", 1],
    ["pull request", 1.1], ["repository", 0.9], ["github", 0.9], ["debugging", 1],
  ],
  "AI Research": [
    ["research", 1.2], ["paper", 1.2], ["arxiv", 1.4], ["study", 1], ["researchers", 1.2],
    ["benchmark", 0.8], ["evaluation", 0.8], ["interpretability", 1.4], ["alignment", 1.2],
    ["scaling laws", 1.4], ["preprint", 1.4], ["peer review", 1.2], ["experiment", 0.8],
  ],
  Robotics: [
    ["robot", 1.4], ["robots", 1.4], ["robotics", 1.4], ["humanoid", 1.4], ["drone", 1.2],
    ["drones", 1.2], ["autonomous vehicle", 1.3], ["self driving", 1.3], ["warehouse", 0.7],
    ["manipulator", 1.2], ["embodied", 1.3], ["actuator", 1.2],
  ],
  "Computer Vision": [
    ["computer vision", 1.5], ["image recognition", 1.4], ["object detection", 1.4],
    ["facial recognition", 1.4], ["segmentation", 1.2], ["ocr", 1.2], ["video analysis", 1.2],
    ["surveillance", 0.9], ["camera", 0.6], ["visual", 0.5],
  ],
  "AI Regulation": [
    ["regulation", 1.4], ["regulator", 1.4], ["lawsuit", 1.3], ["copyright", 1.3],
    ["eu ai act", 1.5], ["ai act", 1.5], ["policy", 1], ["ban", 1], ["compliance", 1.1],
    ["privacy", 1], ["court", 1.2], ["antitrust", 1.3], ["legislation", 1.4], ["governance", 1.1],
    ["executive order", 1.3],
  ],
  "Open Source AI": [
    ["open source", 1.5], ["open sources", 1.5], ["open weights", 1.5], ["open weight", 1.5],
    ["apache 2", 1.3], ["mit license", 1.3], ["hugging face", 1.1], ["community model", 1.2],
    ["permissive license", 1.4], ["fork", 0.7],
  ],
  "Enterprise AI": [
    ["enterprise", 1.4], ["business", 0.7], ["adoption", 1], ["deployment", 1],
    ["productivity", 0.7], ["roi", 1.2], ["cio", 1.3], ["saas", 0.9], ["workforce", 1],
    ["customer service", 1], ["integration", 0.8], ["pilot", 0.8], ["enterprises", 1.4],
  ],
  "AI Hardware": [
    ["chip", 1.4], ["chips", 1.4], ["gpu", 1.3], ["gpus", 1.3], ["tpu", 1.4],
    ["semiconductor", 1.4], ["data center", 1.2], ["data centre", 1.2], ["nvidia", 0.9],
    ["tsmc", 1.3], ["wafer", 1.4], ["accelerator", 1.2], ["on device", 1.2], ["silicon", 1.2],
    ["foundry", 1.3], ["supply chain", 0.9],
  ],
  "AI in India": [
    ["india", 1.4], ["indian", 1.4], ["bengaluru", 1.2], ["bangalore", 1.2], ["delhi", 1],
    ["mumbai", 1], ["hyderabad", 1], ["indiaai", 1.5], ["meity", 1.5], ["niti aayog", 1.5],
    ["bharat", 1.2], ["crore", 1], ["upi", 0.9], ["digital india", 1.4], ["iit", 1.2],
  ],
};

/**
 * Terms that mark a story as belonging to the India half of the region filter.
 *
 * Separate from the "AI in India" *category* on purpose: a Series A for a
 * Bengaluru company is regionally Indian and categorically AI Funding, and
 * forcing it into one bucket would make the India/Global toggle useless.
 */
const INDIA_TERMS = [
  "india", "indian", "bharat", "bengaluru", "bangalore", "delhi", "mumbai", "hyderabad",
  "chennai", "pune", "gurugram", "gurgaon", "noida", "kolkata", "ahmedabad", "kerala",
  "karnataka", "maharashtra", "telangana", "tamil nadu", "crore", "lakh", "rupee", "rupees",
  "meity", "niti aayog", "indiaai", "upi", "aadhaar", "digital india", "iit", "iisc",
];

// ── Matching ─────────────────────────────────────────────────────────────

/**
 * How many times `term` appears in `haystack` on a word boundary.
 *
 * Both are normalised to single-spaced lower-case words, so the boundary test
 * is the presence of a space (or an end) on each side. Padding the haystack
 * lets the two ends be handled without a special case.
 */
function countTerm(paddedHaystack: string, term: string): number {
  const needle = ` ${term} `;
  let count = 0;
  let from = 0;
  for (;;) {
    const index = paddedHaystack.indexOf(needle, from);
    if (index === -1) return count;
    count += 1;
    // Overlapping matches are impossible for space-delimited needles, but
    // stepping past the leading space keeps adjacent repeats ("ai ai") counted.
    from = index + needle.length - 1;
  }
}

export type ClassificationSignal = { term: string; weight: number; inTitle: boolean };

export type ArticleClassification = {
  isAiRelated: boolean;
  /** 0..1. Never null: an article always has *some* verdict, even if it is 0. */
  relevanceScore: number;
  category: string | null;
  subCategory: string | null;
  region: "india" | "global";
  entities: ExtractedEntity[];
  primaryEntity: ExtractedEntity | null;
  keywords: string[];
  /** What fired, strongest first. Rendered in /admin/ai-news. */
  signals: ClassificationSignal[];
  /** Set when the verdict is a rejection, for the admin table and the log. */
  rejectedReason: string | null;
};

export type ClassifyInput = {
  title: string;
  excerpt?: string | null;
  /**
   * A 0..1 prior from the source. An article on OpenAI's own blog is about AI
   * whatever its headline says, and a paper in arXiv cs.AI is about AI by
   * definition — neither should have to argue for it in keywords.
   *
   * Combined as a probabilistic OR rather than added, so a prior can lift a
   * weak signal but can never on its own certify something the text contradicts,
   * and the result stays inside 0..1 without clamping.
   */
  sourcePrior?: number;
  /** The source's configured region, used as the tie-break for `region`. */
  sourceRegion?: "india" | "global";
};

/**
 * The saturation curve that turns an unbounded weight sum into a 0..1 score.
 *
 * Exponential rather than linear because the difference between "no AI terms"
 * and "one strong AI term" is the entire decision, while the difference between
 * six and nine is noise. `SATURATION` is set so a single unambiguous term
 * (weight 1.0, in the title, so 1.5 after the multiplier) lands near 0.5 —
 * comfortably relevant, and just under the auto-publish bar, which is the right
 * place for an article whose only evidence is one phrase.
 */
const SATURATION = 2.2;

function saturate(total: number): number {
  if (total <= 0) return 0;
  return 1 - Math.exp(-total / SATURATION);
}

/**
 * A term found in the headline counts for more than the same term buried in a
 * feed snippet, because a headline is what the article is *about*.
 */
const TITLE_MULTIPLIER = 1.5;

/**
 * Classify one article.
 *
 * Returns a verdict for every input, including the rejections — the caller
 * stores those too, which is what makes the second run over the same feed cheap
 * (section 9: an article already judged irrelevant is recognised by URL).
 */
export function classifyArticle(input: ClassifyInput): ArticleClassification {
  const title = normalizeTitle(input.title);
  const excerpt = normalizeTitle(input.excerpt ?? "").slice(0, 1200);
  const paddedTitle = ` ${title} `;
  const paddedExcerpt = ` ${excerpt} `;

  // ── Relevance ──────────────────────────────────────────────────────────
  const signals: ClassificationSignal[] = [];
  let total = 0;

  for (const [term, weight] of AI_TERMS) {
    const inTitle = countTerm(paddedTitle, term);
    const inExcerpt = countTerm(paddedExcerpt, term);
    if (inTitle === 0 && inExcerpt === 0) continue;

    // Repeats count, but with sharply diminishing returns: an article that says
    // "AI" eleven times is not eleven times more about AI than one that says it
    // once, and rewarding repetition is how a keyword-stuffed post outranks a
    // lab's own announcement.
    const occurrences = Math.min(inTitle, 2) * TITLE_MULTIPLIER + Math.min(inExcerpt, 2);
    total += weight * occurrences;
    signals.push({ term, weight, inTitle: inTitle > 0 });
  }

  for (const [term, weight] of NEGATIVE_TERMS) {
    const hits = countTerm(paddedTitle, term) * TITLE_MULTIPLIER + countTerm(paddedExcerpt, term);
    if (hits > 0) {
      total -= weight * Math.min(hits, 2);
      signals.push({ term: `-${term}`, weight: -weight, inTitle: countTerm(paddedTitle, term) > 0 });
    }
  }

  const { entities, primary } = extractEntities({ title: input.title, excerpt: input.excerpt });

  /*
   * Named entities as evidence.
   *
   * A great many real AI headlines contain no lexicon phrase at all — "Cursor
   * ships an agent that writes pull requests", "Claude Code ships checkpoints",
   * "Sarvam AI raises $41M". What they contain instead is a name that only
   * exists because of AI, and that is the strongest signal available.
   *
   * So the bonus is graded by what the name tells us, not by its type alone:
   *
   *   - **AI-native** (a model, a tool, a topic, or a company flagged
   *     `aiNative`): 1.0 — as much as "artificial intelligence" appearing once.
   *   - **A person from the gazetteer**: 0.6. Every one of them is an AI figure,
   *     but they appear in plenty of writing that is not about AI.
   *   - **A diversified company** (Google, Samsung, Zomato): 0.15. Their names
   *     carry almost no information — "Zomato launches a delivery fee change"
   *     must still be rejected — but they are worth a nudge when something else
   *     is already there.
   *   - **A discovered proper noun**: nothing. We know it is a name and nothing
   *     else, including whether it has anything to do with AI.
   */
  let entityEvidence = 0;
  let namedAiThings = 0;
  for (const entity of entities.slice(0, 4)) {
    if (!entity.curated) continue;
    if (entity.aiNative) {
      entityEvidence += 1;
      namedAiThings += 1;
    } else if (entity.type === "person") {
      entityEvidence += 0.6;
    } else {
      entityEvidence += 0.15;
    }
  }
  if (entityEvidence > 0) {
    total += Math.min(entityEvidence, 3);
    signals.push({
      term: `entity:${namedAiThings || entities.length}`,
      weight: Math.min(entityEvidence, 3),
      inTitle: true,
    });
  }

  const termScore = saturate(total);
  const prior = Math.min(Math.max(input.sourcePrior ?? 0, 0), 1);
  // Probabilistic OR: either the text says so, or the source does.
  const relevanceScore = Number((1 - (1 - termScore) * (1 - prior)).toFixed(3));
  const isAiRelated = relevanceScore >= AI_RELEVANCE_MIN;

  // ── Category ───────────────────────────────────────────────────────────
  const categoryScores: Array<{ category: string; score: number }> = [];

  for (const definition of AI_CATEGORIES) {
    const terms = CATEGORY_TERMS[definition.value] ?? [];
    let score = 0;
    for (const [term, weight] of terms) {
      const inTitle = countTerm(paddedTitle, term);
      const inExcerpt = countTerm(paddedExcerpt, term);
      if (inTitle === 0 && inExcerpt === 0) continue;
      score += weight * (Math.min(inTitle, 2) * TITLE_MULTIPLIER + Math.min(inExcerpt, 1));
    }
    if (score > 0) categoryScores.push({ category: definition.value, score });
  }

  categoryScores.sort((a, b) => b.score - a.score);

  /*
   * A category needs to be *argued for*. Below this, the evidence is a single
   * weak word and the honest answer is the general bucket rather than a
   * confident-looking wrong label. "AI Models" is that bucket because it is the
   * broadest of the fifteen, not because it is a guess.
   */
  const CATEGORY_MIN_SCORE = 0.9;
  const best = categoryScores[0];
  const category = isAiRelated
    ? best && best.score >= CATEGORY_MIN_SCORE
      ? best.category
      : "AI Models"
    : null;

  const runnerUp = categoryScores.find((entry) => entry.category !== category);
  const subCategory =
    isAiRelated && runnerUp && runnerUp.score >= CATEGORY_MIN_SCORE ? runnerUp.category : null;

  /*
   * ── Region ──────────────────────────────────────────────────────────────
   *
   * Content wins over configuration, in three tiers. TechCrunch reporting a
   * Bengaluru round is an Indian story; The Economic Times reporting OpenAI's
   * launch is a global one; and a source's configured region is the weakest
   * signal of the three, because a general Indian tech feed publishes far more
   * global AI news than Indian.
   *
   *   1. India in the text — a place, a rupee figure, a ministry.
   *   2. An entity we know to be Indian. "Zoho ships an AI assistant" names no
   *      Indian place and no rupee figure, and is unmistakably India coverage.
   *   3. A curated non-Indian entity, which settles it the other way: a story
   *      whose subject is OpenAI is global however it reached us.
   *   4. Only then, the source's own region.
   */
  let indiaHits = 0;
  for (const term of INDIA_TERMS) {
    indiaHits += countTerm(paddedTitle, term) * 2 + countTerm(paddedExcerpt, term);
  }

  const hasIndianEntity = entities.some((entity) => entity.region === "india");
  // Only a company, a person or a model can settle this. A topic or a tool has
  // no geography — "Benchmarks" and "RAG" appear in Indian and global coverage
  // alike — and letting one of those count as evidence of *global* would
  // override the source's own region for any story that merely mentioned one.
  const hasKnownGlobalEntity = entities.some(
    (entity) =>
      entity.curated &&
      entity.region !== "india" &&
      (entity.type === "company" || entity.type === "person" || entity.type === "model"),
  );

  const region: "india" | "global" =
    indiaHits > 0 || hasIndianEntity
      ? "india"
      : hasKnownGlobalEntity
        ? "global"
        : (input.sourceRegion ?? "global");

  // ── Keywords ───────────────────────────────────────────────────────────
  // The terms that actually fired, plus the entity names, deduplicated and
  // capped. These are stored on the row and folded into `search_text`, so a
  // search for "open source" reaches a story whose headline never said it.
  const keywords = [
    ...new Set([
      ...signals
        .filter((signal) => signal.weight > 0)
        .sort((a, b) => b.weight - a.weight)
        .map((signal) => signal.term),
      ...entities.map((entity) => entity.name.toLowerCase()),
      ...(category ? [category.toLowerCase()] : []),
    ]),
  ].slice(0, 12);

  return {
    isAiRelated,
    relevanceScore,
    category,
    subCategory,
    region,
    entities,
    primaryEntity: primary,
    keywords,
    signals: signals.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight)).slice(0, 10),
    rejectedReason: isAiRelated
      ? null
      : signals.length === 0
        ? "No AI signal in the headline or snippet"
        : `AI relevance ${relevanceScore.toFixed(2)} below the ${AI_RELEVANCE_MIN} threshold`,
  };
}
