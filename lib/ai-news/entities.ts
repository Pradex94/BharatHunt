/**
 * Who and what a story is about (section 17).
 *
 * Two mechanisms, on purpose:
 *
 *  1. A **curated gazetteer** — the companies, models, people and tools that
 *     dominate AI coverage. Matching against a fixed list is what makes
 *     "OpenAI", "Open AI" and "OpenAI's" the same entity, and it is the only
 *     way to know that "Gemini" is a model and "Demis Hassabis" is a person.
 *     Curated entities are the ones "AI Companies Making Noise" is allowed to
 *     surface, because a name a human vetted is a name we can print.
 *
 *  2. A **conservative discovery heuristic** for everything else, because the
 *     Indian half of this feature is largely about companies nobody has heard
 *     of yet — the whole point of section 20 is that a seed-stage Bengaluru
 *     startup should appear the day it is covered, not the day someone adds it
 *     to a list here. Discovery only fires on a specific headline shape
 *     ("<Proper Noun> raises/launches/unveils …"), which trades recall for
 *     precision deliberately: a wrong entity does not just mislabel a story, it
 *     merges it with the wrong one, because the entity is half of the grouping
 *     key.
 *
 * Pure and dependency-free, like normalize.ts, so the tests exercise it
 * directly.
 */

import { normalizeEntityName, normalizeTitle, slugify } from "./normalize.ts";

export type AiEntityType = "company" | "model" | "person" | "tool" | "topic";

export type CuratedEntity = {
  name: string;
  type: AiEntityType;
  /**
   * Extra surface forms. The canonical `name` is always matched too, so an
   * alias list only needs the ones that differ — abbreviations, spacings,
   * former names.
   */
  aliases?: string[];
  website?: string;
  /**
   * True when the name is also an ordinary English word or a much more common
   * non-AI proper noun ("Meta", "Anthropic" is not, "Claude" is a first name,
   * "Grok" is a verb). These only match when the surrounding text already looks
   * like AI coverage — which, by the time entities are extracted, it does,
   * because classification has already run. The flag is kept anyway so a future
   * caller extracting from arbitrary text has the information.
   */
  ambiguous?: boolean;
  /**
   * True when the company exists *because of* AI, so its name in a headline is
   * itself strong evidence that the headline is AI coverage.
   *
   * This is the distinction that lets "Sarvam AI raises $41M" and "Cursor ships
   * an agent" be classified correctly without either one containing a lexicon
   * phrase — and, just as importantly, lets "Zomato launches a delivery fee
   * change" and "Google announces a Pixel" stay rejected. Diversified companies
   * are in the gazetteer because we want to *link* them when they do appear in
   * AI coverage, not because their name means anything on its own.
   *
   * Models, tools and topics are AI-native by their type and do not set this.
   */
  aiNative?: boolean;
  /**
   * Set for entities that are Indian, which is the strongest region signal
   * there is: "Zoho ships an AI assistant" names no Indian place, no rupee
   * figure and no ministry, and is unambiguously India coverage.
   */
  region?: "india";
};

/**
 * The gazetteer.
 *
 * Deliberately not exhaustive and deliberately not generated. Every row is a
 * name someone decided was worth tracking; growing it is a two-line change and
 * a re-run of ingestion, which is the maintenance story documented in the
 * README section for this feature.
 */
export const CURATED_ENTITIES: CuratedEntity[] = [
  // ── Companies and labs ────────────────────────────────────────────────
  { name: "OpenAI", type: "company", aliases: ["open ai"], website: "https://openai.com", aiNative: true },
  { name: "Anthropic", type: "company", website: "https://www.anthropic.com", aiNative: true },
  { name: "Google DeepMind", type: "company", aliases: ["deepmind", "google ai"], website: "https://deepmind.google", aiNative: true },
  { name: "Google", type: "company", aliases: ["alphabet"], website: "https://about.google" },
  { name: "Meta", type: "company", aliases: ["meta ai", "facebook"], website: "https://ai.meta.com", ambiguous: true },
  { name: "Microsoft", type: "company", website: "https://microsoft.com" },
  { name: "NVIDIA", type: "company", website: "https://nvidia.com" },
  { name: "Amazon", type: "company", aliases: ["aws", "amazon web services"], website: "https://aws.amazon.com" },
  { name: "Apple", type: "company", website: "https://apple.com" },
  { name: "Mistral AI", type: "company", aliases: ["mistral"], website: "https://mistral.ai", aiNative: true },
  { name: "Cohere", type: "company", website: "https://cohere.com", aiNative: true },
  { name: "Hugging Face", type: "company", aliases: ["huggingface"], website: "https://huggingface.co", aiNative: true },
  { name: "Stability AI", type: "company", website: "https://stability.ai", aiNative: true },
  { name: "xAI", type: "company", website: "https://x.ai", aiNative: true },
  { name: "Perplexity", type: "company", aliases: ["perplexity ai"], website: "https://perplexity.ai", aiNative: true },
  { name: "Scale AI", type: "company", website: "https://scale.com", aiNative: true },
  { name: "Databricks", type: "company", website: "https://databricks.com" },
  { name: "Snowflake", type: "company", website: "https://snowflake.com" },
  { name: "Salesforce", type: "company", website: "https://salesforce.com" },
  { name: "IBM", type: "company", website: "https://ibm.com" },
  { name: "Intel", type: "company", website: "https://intel.com" },
  { name: "AMD", type: "company", website: "https://amd.com" },
  { name: "Qualcomm", type: "company", website: "https://qualcomm.com" },
  { name: "Broadcom", type: "company", website: "https://broadcom.com" },
  { name: "TSMC", type: "company", website: "https://tsmc.com" },
  { name: "Samsung", type: "company", website: "https://samsung.com" },
  { name: "Tesla", type: "company", website: "https://tesla.com" },
  { name: "Figure AI", type: "company", aliases: ["figure robotics"], website: "https://figure.ai", aiNative: true },
  { name: "Boston Dynamics", type: "company", website: "https://bostondynamics.com", aiNative: true },
  { name: "Waymo", type: "company", website: "https://waymo.com", aiNative: true },
  { name: "Runway", type: "company", aliases: ["runway ml", "runwayml"], website: "https://runwayml.com", aiNative: true },
  { name: "ElevenLabs", type: "company", aliases: ["eleven labs"], website: "https://elevenlabs.io", aiNative: true },
  { name: "Midjourney", type: "company", website: "https://midjourney.com", aiNative: true },
  { name: "Black Forest Labs", type: "company", website: "https://blackforestlabs.ai", aiNative: true },
  { name: "Groq", type: "company", website: "https://groq.com", aiNative: true },
  { name: "Cerebras", type: "company", website: "https://cerebras.net", aiNative: true },
  { name: "Together AI", type: "company", aliases: ["together ai"], website: "https://together.ai", aiNative: true },
  { name: "Replicate", type: "company", website: "https://replicate.com", aiNative: true },
  { name: "LangChain", type: "company", website: "https://langchain.com", aiNative: true },
  { name: "LlamaIndex", type: "company", aliases: ["llama index"], website: "https://llamaindex.ai", aiNative: true },
  { name: "Vercel", type: "company", website: "https://vercel.com" },
  { name: "GitHub", type: "company", website: "https://github.com" },
  { name: "Alibaba", type: "company", aliases: ["alibaba cloud"], website: "https://alibaba.com" },
  { name: "ByteDance", type: "company", website: "https://bytedance.com" },
  { name: "Baidu", type: "company", website: "https://baidu.com" },
  { name: "DeepSeek", type: "company", aliases: ["deep seek"], website: "https://deepseek.com", aiNative: true },
  { name: "Moonshot AI", type: "company", aliases: ["moonshot"], website: "https://moonshot.cn", aiNative: true },
  { name: "Z.ai", type: "company", aliases: ["zhipu", "zhipu ai"], website: "https://z.ai", aiNative: true },
  { name: "Nothing", type: "company", ambiguous: true },

  // Indian AI companies and institutions. The reason section 20 can be built
  // from the same pipeline as everything else.
  { name: "Sarvam AI", type: "company", aliases: ["sarvam"], website: "https://sarvam.ai", aiNative: true, region: "india" },
  { name: "Krutrim", type: "company", aliases: ["ola krutrim"], website: "https://olakrutrim.com", aiNative: true, region: "india" },
  { name: "Ola", type: "company", website: "https://olacabs.com", region: "india" },
  { name: "Reliance Jio", type: "company", aliases: ["jio", "reliance"], website: "https://jio.com", region: "india" },
  { name: "Tata Consultancy Services", type: "company", aliases: ["tcs"], website: "https://tcs.com", region: "india" },
  { name: "Infosys", type: "company", website: "https://infosys.com", region: "india" },
  { name: "Wipro", type: "company", website: "https://wipro.com", region: "india" },
  { name: "HCLTech", type: "company", aliases: ["hcl"], website: "https://hcltech.com", region: "india" },
  { name: "Zoho", type: "company", website: "https://zoho.com", region: "india" },
  { name: "Freshworks", type: "company", website: "https://freshworks.com", region: "india" },
  { name: "Zomato", type: "company", website: "https://zomato.com", region: "india" },
  { name: "Swiggy", type: "company", website: "https://swiggy.com", region: "india" },
  { name: "Flipkart", type: "company", website: "https://flipkart.com", region: "india" },
  { name: "Paytm", type: "company", website: "https://paytm.com", region: "india" },
  { name: "Razorpay", type: "company", website: "https://razorpay.com", region: "india" },
  { name: "CoRover", type: "company", website: "https://corover.ai", aiNative: true, region: "india" },
  { name: "Haptik", type: "company", website: "https://haptik.ai", aiNative: true, region: "india" },
  { name: "Fractal Analytics", type: "company", aliases: ["fractal"], website: "https://fractal.ai", aiNative: true, region: "india" },
  { name: "IIT Madras", type: "company", aliases: ["iit-madras"], website: "https://www.iitm.ac.in", region: "india" },
  { name: "IIT Bombay", type: "company", aliases: ["iit-bombay"], website: "https://www.iitb.ac.in", region: "india" },
  { name: "IISc", type: "company", aliases: ["indian institute of science"], website: "https://iisc.ac.in", region: "india" },
  { name: "AI4Bharat", type: "company", aliases: ["ai 4 bharat"], website: "https://ai4bharat.org", aiNative: true, region: "india" },
  { name: "IndiaAI Mission", type: "company", aliases: ["indiaai", "india ai mission"], website: "https://indiaai.gov.in", aiNative: true, region: "india" },
  { name: "MeitY", type: "company", aliases: ["ministry of electronics and information technology"], website: "https://www.meity.gov.in", region: "india" },
  { name: "NITI Aayog", type: "company", website: "https://niti.gov.in", region: "india" },

  // ── Models ────────────────────────────────────────────────────────────
  { name: "GPT", type: "model", aliases: ["gpt 4", "gpt 5", "gpt 4o", "chatgpt"] },
  { name: "Claude", type: "model", aliases: ["claude opus", "claude sonnet", "claude haiku"], ambiguous: true },
  { name: "Gemini", type: "model", aliases: ["gemini pro", "gemini flash"], ambiguous: true },
  { name: "Llama", type: "model", aliases: ["llama 3", "llama 4"] },
  { name: "Mistral", type: "model", aliases: ["mixtral"] },
  { name: "Qwen", type: "model" },
  { name: "Grok", type: "model", ambiguous: true },
  { name: "Phi", type: "model", ambiguous: true },
  { name: "Gemma", type: "model" },
  { name: "Sora", type: "model" },
  { name: "Veo", type: "model" },
  { name: "DALL-E", type: "model", aliases: ["dall e", "dalle"] },
  { name: "Stable Diffusion", type: "model" },
  { name: "Flux", type: "model", ambiguous: true },
  { name: "Whisper", type: "model", ambiguous: true },
  { name: "Nova", type: "model", ambiguous: true },
  { name: "Titan", type: "model", ambiguous: true },
  { name: "Command R", type: "model" },
  { name: "Falcon", type: "model", ambiguous: true },
  { name: "BharatGPT", type: "model", aliases: ["bharat gpt"], region: "india" },
  { name: "Hanooman", type: "model", region: "india" },
  { name: "IndicTrans", type: "model", region: "india" },

  // ── People ────────────────────────────────────────────────────────────
  { name: "Sam Altman", type: "person" },
  { name: "Dario Amodei", type: "person" },
  { name: "Demis Hassabis", type: "person" },
  { name: "Sundar Pichai", type: "person" },
  { name: "Satya Nadella", type: "person" },
  { name: "Mark Zuckerberg", type: "person" },
  { name: "Jensen Huang", type: "person" },
  { name: "Elon Musk", type: "person" },
  { name: "Yann LeCun", type: "person" },
  { name: "Geoffrey Hinton", type: "person" },
  { name: "Andrej Karpathy", type: "person" },
  { name: "Ilya Sutskever", type: "person" },
  { name: "Mira Murati", type: "person" },
  { name: "Fei-Fei Li", type: "person", aliases: ["fei fei li"] },
  { name: "Arvind Srinivas", type: "person", aliases: ["aravind srinivas"] },
  { name: "Vinod Khosla", type: "person" },
  { name: "Nandan Nilekani", type: "person", region: "india" },
  { name: "Ashwini Vaishnaw", type: "person", region: "india" },

  // ── Tools ─────────────────────────────────────────────────────────────
  { name: "ChatGPT", type: "tool", aliases: ["chat gpt"], website: "https://chatgpt.com" },
  { name: "Claude Code", type: "tool", website: "https://claude.com/claude-code" },
  { name: "GitHub Copilot", type: "tool", aliases: ["copilot"], website: "https://github.com/features/copilot" },
  { name: "Cursor", type: "tool", website: "https://cursor.com", ambiguous: true },
  { name: "Windsurf", type: "tool", website: "https://windsurf.com" },
  { name: "Devin", type: "tool" },
  { name: "Copilot Studio", type: "tool" },
  { name: "NotebookLM", type: "tool", aliases: ["notebook lm"] },
  { name: "Ollama", type: "tool", website: "https://ollama.com" },
  { name: "vLLM", type: "tool" },
  { name: "PyTorch", type: "tool", website: "https://pytorch.org" },
  { name: "TensorFlow", type: "tool", website: "https://tensorflow.org" },
  { name: "Model Context Protocol", type: "tool", aliases: ["mcp"] },

  // ── Topics ────────────────────────────────────────────────────────────
  // Cross-cutting subjects that are not categories. A story can be in "AI
  // Models" and still be *about* alignment.
  { name: "AGI", type: "topic", aliases: ["artificial general intelligence"] },
  { name: "AI Safety", type: "topic", aliases: ["ai alignment", "alignment"] },
  { name: "RAG", type: "topic", aliases: ["retrieval augmented generation"] },
  { name: "Fine-tuning", type: "topic", aliases: ["fine tuning", "finetuning"] },
  { name: "Multimodal", type: "topic" },
  { name: "Reasoning Models", type: "topic", aliases: ["reasoning model", "chain of thought"] },
  { name: "Inference", type: "topic" },
  { name: "Benchmarks", type: "topic", aliases: ["benchmark", "evals", "evaluation"] },
  { name: "Deepfakes", type: "topic", aliases: ["deepfake"] },
  { name: "Data Centers", type: "topic", aliases: ["data centre", "data center", "datacenter"] },
];

/**
 * The gazetteer flattened into (surface form → entity) pairs, built once.
 *
 * Surface forms are normalised with `normalizeTitle` so matching happens in one
 * space: a headline is normalised the same way, and then a match is a substring
 * test on word boundaries rather than a regex per entity per article.
 */
type SurfaceForm = { needle: string; entity: CuratedEntity };

const SURFACE_FORMS: SurfaceForm[] = (() => {
  const forms: SurfaceForm[] = [];
  for (const entity of CURATED_ENTITIES) {
    for (const raw of [entity.name, ...(entity.aliases ?? [])]) {
      const needle = normalizeTitle(raw);
      // A one-character needle would match inside everything.
      if (needle.length >= 2) forms.push({ needle, entity });
    }
  }
  // Longest first, so "Google DeepMind" is found before "Google" and the
  // shorter match is then skipped by the overlap check in `extractEntities`.
  return forms.sort((a, b) => b.needle.length - a.needle.length);
})();

export type ExtractedEntity = {
  name: string;
  type: AiEntityType;
  slug: string;
  normalizedName: string;
  website: string | null;
  /** True for a gazetteer hit, false for a discovered proper noun. */
  curated: boolean;
  /** See `CuratedEntity.aiNative`. Always false for a discovered name. */
  aiNative: boolean;
  /** See `CuratedEntity.region`. */
  region: "india" | null;
  /** Occurrences across the text given, at least 1. */
  mentions: number;
  /** Character offset of the first occurrence, used to pick the primary. */
  position: number;
};

/**
 * True when `needle` occurs in `haystack` at a word boundary.
 *
 * Both strings are already normalised to lower-case words separated by single
 * spaces, so "boundary" is just "preceded and followed by a space or an end".
 * This is what stops "ai" matching inside "said" and "meta" inside "metadata" —
 * the failure mode that makes naive gazetteer matching useless.
 */
function boundedIndexOf(haystack: string, needle: string, from = 0): number {
  let index = haystack.indexOf(needle, from);

  while (index !== -1) {
    const before = index === 0 ? " " : haystack[index - 1];
    const afterIndex = index + needle.length;
    const after = afterIndex >= haystack.length ? " " : haystack[afterIndex];
    if (before === " " && after === " ") return index;
    index = haystack.indexOf(needle, index + 1);
  }

  return -1;
}

/** Every position `needle` occurs at, on a word boundary. */
function boundedOccurrences(haystack: string, needle: string): number[] {
  const positions: number[] = [];
  let from = 0;
  for (;;) {
    const index = boundedIndexOf(haystack, needle, from);
    if (index === -1) break;
    positions.push(index);
    from = index + needle.length;
  }
  return positions;
}

/**
 * The curated entities named in `text`.
 *
 * Overlapping matches are resolved longest-first: a headline about "Google
 * DeepMind" yields DeepMind, not DeepMind *and* Google, because the shorter
 * needle's occurrence is inside a span already claimed. Two genuinely separate
 * mentions ("Google and Microsoft") are both kept, because their spans do not
 * overlap.
 */
export function extractCuratedEntities(text: string): ExtractedEntity[] {
  const haystack = normalizeTitle(text);
  if (!haystack) return [];

  const claimed: Array<[number, number]> = [];
  const found = new Map<string, ExtractedEntity>();

  const overlaps = (start: number, end: number) =>
    claimed.some(([from, to]) => start < to && end > from);

  for (const { needle, entity } of SURFACE_FORMS) {
    const positions = boundedOccurrences(haystack, needle).filter(
      (start) => !overlaps(start, start + needle.length),
    );
    if (positions.length === 0) continue;

    for (const start of positions) claimed.push([start, start + needle.length]);

    const key = `${entity.type}:${normalizeEntityName(entity.name)}`;
    const existing = found.get(key);
    if (existing) {
      existing.mentions += positions.length;
      existing.position = Math.min(existing.position, positions[0]);
    } else {
      found.set(key, {
        name: entity.name,
        type: entity.type,
        slug: slugify(entity.name),
        normalizedName: normalizeEntityName(entity.name),
        website: entity.website ?? null,
        curated: true,
        // Models, tools and topics are AI-native by their type; companies have
        // to be marked, because half of them are Google-shaped.
        aiNative:
          entity.aiNative === true ||
          entity.type === "model" ||
          entity.type === "tool" ||
          entity.type === "topic",
        region: entity.region ?? null,
        mentions: positions.length,
        position: positions[0],
      });
    }
  }

  return [...found.values()].sort((a, b) => a.position - b.position);
}

/**
 * Verbs that put a company at the front of a headline.
 *
 * This list is the discovery heuristic's entire precision budget. Every verb
 * here takes a named organisation as its subject in news style — "Sarvam AI
 * raises $41M", "Krutrim open-sources its model" — which is why a capitalised
 * phrase immediately before one of them is a company with high confidence.
 * Adding a vaguer verb ("says", "is", "has") would flood the entity table with
 * fragments of sentences.
 */
const SUBJECT_VERBS = [
  "raises",
  "raised",
  "secures",
  "secured",
  "bags",
  "launches",
  "launched",
  "unveils",
  "unveiled",
  "announces",
  "announced",
  "releases",
  "released",
  "ships",
  "shipped",
  "acquires",
  "acquired",
  "open sources",
  "open-sources",
  "introduces",
  "introduced",
  "debuts",
  "partners",
  "expands",
  "hits",
  "files",
  "valued",
];

/**
 * Words that end the backwards scan for a company name.
 *
 * These are never *part* of a company name in a headline, so hitting one means
 * the name has been fully collected (or that there was not one).
 */
const STOP_TOKENS = new Set([
  "The", "This", "That", "These", "Those", "A", "An", "It", "He", "She", "They", "We", "You",
  "New", "Now", "How", "Why", "What", "When", "Who", "After", "Before", "Report", "Exclusive",
  "Opinion", "Watch", "Video", "Also", "Meanwhile", "Here",
]);

/**
 * Candidates that are a real word rather than a company, once assembled.
 *
 * Kept separate from `STOP_TOKENS` because "AI" belongs in exactly one of them.
 * As a stop token it would truncate every "<Something> AI" company name in
 * existence — "Sarvam AI raises $41M" would yield nothing, which is the single
 * most common headline shape in Indian AI funding coverage. As a whole
 * candidate it is a category, not a company, so "AI launches…" is correctly
 * refused.
 */
const REJECT_WHOLE = new Set([
  "AI", "India", "US", "UK", "EU", "China", "Europe", "Report", "Video", "Watch", "Opinion",
  "Exclusive", "Government", "Startup", "Startups",
]);

/**
 * A company name discovered from the shape of the headline, or null.
 *
 * Runs on the *raw* headline, not the normalised one, because capitalisation is
 * the entire signal: "Sarvam AI raises" has it, "the startup raises" does not.
 * Returns at most one name — the subject of the sentence — because that is the
 * only position this heuristic can read reliably.
 */
export function discoverOrganisation(rawTitle: string): string | null {
  const title = (rawTitle ?? "").trim();
  if (!title) return null;

  const lower = title.toLowerCase();

  for (const verb of SUBJECT_VERBS) {
    const at = lower.indexOf(` ${verb} `);
    if (at <= 0) continue;

    // Up to three capitalised tokens immediately before the verb.
    const before = title.slice(0, at).trim().split(/\s+/).slice(-3);
    const name: string[] = [];

    for (let index = before.length - 1; index >= 0; index -= 1) {
      const token = before[index].replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9.&']+$/g, "");
      if (!token) break;
      // A capital, an all-caps acronym, or a name with a digit ("Cohere2").
      const capitalised = /^[A-Z][A-Za-z0-9.&'-]*$/.test(token);
      if (!capitalised || STOP_TOKENS.has(token)) break;
      name.unshift(token);
    }

    if (name.length === 0) continue;

    const candidate = name.join(" ");
    // Two characters is not a company; "AI" alone is a category.
    if (candidate.length < 3) continue;
    if (REJECT_WHOLE.has(candidate)) continue;
    return candidate;
  }

  return null;
}

/**
 * Everything an article names, curated first and discovery only as a fallback.
 *
 * Discovery is skipped entirely when the gazetteer already matched a company:
 * if the headline says "OpenAI", the subject-verb heuristic has nothing to add
 * and can only introduce noise.
 */
export function extractEntities(input: { title: string; excerpt?: string | null }): {
  entities: ExtractedEntity[];
  primary: ExtractedEntity | null;
} {
  // The title is weighted by being scanned on its own first: an entity named in
  // the headline is what the story is *about*, one named in the excerpt is
  // context. Concatenating them would lose that distinction.
  const fromTitle = extractCuratedEntities(input.title);
  const fromExcerpt = input.excerpt ? extractCuratedEntities(input.excerpt) : [];

  const merged = new Map<string, ExtractedEntity>();
  for (const entity of fromTitle) {
    merged.set(`${entity.type}:${entity.normalizedName}`, { ...entity });
  }
  for (const entity of fromExcerpt) {
    const key = `${entity.type}:${entity.normalizedName}`;
    const existing = merged.get(key);
    if (existing) {
      existing.mentions += entity.mentions;
    } else {
      // Pushed past every title match by an offset larger than any headline, so
      // the primary pick below never prefers an excerpt-only entity.
      merged.set(key, { ...entity, position: entity.position + 10_000 });
    }
  }

  const entities = [...merged.values()];
  const hasCompany = entities.some((entity) => entity.type === "company");

  if (!hasCompany) {
    const discovered = discoverOrganisation(input.title);
    const normalized = normalizeEntityName(discovered);
    // Guard against a discovery that duplicates a curated model or tool name
    // ("Claude launches …" would otherwise create a *company* called Claude).
    const alreadyKnown = entities.some((entity) => entity.normalizedName === normalized);

    if (discovered && normalized && slugify(discovered) && !alreadyKnown) {
      entities.push({
        name: discovered,
        type: "company",
        slug: slugify(discovered),
        normalizedName: normalized,
        website: null,
        curated: false,
        // A proper noun read out of a headline is a *name*, not evidence: we
        // know nothing about it, including whether it has anything to do with
        // AI. It contributes to grouping and to search, and nothing to the
        // relevance score.
        aiNative: false,
        region: null,
        mentions: 1,
        position: 0,
      });
    }
  }

  /*
   * The primary entity is what a story is filed under, and it is the half of
   * the grouping key that does the work — so the tie-breaks matter.
   *
   * Companies first: "OpenAI launches GPT-5" is a story about OpenAI that
   * mentions a model, not the other way round, and grouping on the model would
   * merge every OpenAI model story ever written. Then earliest position, which
   * in a headline is nearly always the subject.
   */
  const rank: Record<AiEntityType, number> = { company: 0, model: 1, tool: 2, person: 3, topic: 4 };
  const primary =
    [...entities].sort(
      (a, b) => rank[a.type] - rank[b.type] || a.position - b.position || b.mentions - a.mentions,
    )[0] ?? null;

  return { entities: entities.sort((a, b) => a.position - b.position), primary };
}
