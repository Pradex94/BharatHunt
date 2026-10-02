import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { clip, SHORT_MAX, TAGLINE_MAX } from "./content";
import { HYPE } from "./safety";
import type { DraftContent, Facts } from "./types";

/**
 * The optional model pass over a drafted listing — off unless
 * `ANTHROPIC_API_KEY` is set, which this deployment deliberately does not do.
 *
 * Same contract as lib/funding/ai.ts: no key, no call, no error, and the
 * template draft is the answer. With a key, the model may only *rewrite* the
 * draft for readability from the same verified facts. Its output is then
 * re-checked here — lengths, no superlatives, and no number that is not in
 * the facts — and anything that fails falls back to the template, so the
 * model can make the copy read better but cannot add a claim.
 *
 * Only selected candidates reach this (Tier 3), and `max_ai_calls` caps it per
 * batch, so it never runs over the whole discovery pool.
 */

const MODEL = process.env.DAILY_AGENT_AI_MODEL?.trim() || "claude-opus-5-5";
const AI_TIMEOUT_MS = 30_000;

/** $ per million tokens for the default model; override with the env pair for another. */
const PRICE_IN = Number(process.env.DAILY_AGENT_AI_PRICE_IN_PER_MTOK ?? 4);
const PRICE_OUT = Number(process.env.DAILY_AGENT_AI_PRICE_OUT_PER_MTOK ?? 20);

let client: Anthropic | null | undefined;

function getClient(): Anthropic | null {
  if (client !== undefined) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  client = apiKey ? new Anthropic({ apiKey, timeout: AI_TIMEOUT_MS, maxRetries: 1 }) : null;
  return client;
}

export function isAiContentEnabled(): boolean {
  return getClient() !== null;
}

export type RefineResult = { content: DraftContent; called: boolean; costUsd: number };

const SCHEMA = {
  type: "object",
  properties: {
    tagline: { type: "string" },
    shortDescription: { type: "string" },
    fullDescription: { type: "string" },
  },
  required: ["tagline", "shortDescription", "fullDescription"],
  additionalProperties: false,
} as const;

const SYSTEM = `You edit product listings for BharatHunt, a discovery site for Indian products.
Rewrite the draft listing so it reads clearly, using ONLY the facts provided.
Rules:
- Do not add any fact, number, customer, award, integration, founder, price or location that is not in the facts.
- No superlatives or unverifiable claims ("#1", "best", "leading", "revolutionary", "world's first", "guaranteed").
- Tagline: one line, at most ${TAGLINE_MAX} characters, no trailing period.
- Short description: 120-${SHORT_MAX} characters.
- Full description: plain paragraphs, factual and specific. If the facts are thin, stay short — never pad.`;

/** Every number the model wrote must appear in the facts or the draft it was given. */
function numbersSupported(output: string, source: string): boolean {
  const numbers = output.match(/\d[\d,.]*/g) ?? [];
  return numbers.every((number) => source.includes(number.replace(/[.,]$/, "")));
}

export async function refineContent(draft: DraftContent, facts: Facts): Promise<RefineResult> {
  const anthropic = getClient();
  if (!anthropic) return { content: draft, called: false, costUsd: 0 };

  const factsJson = JSON.stringify({ facts, draft }, null, 2);
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM,
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: `Facts and current draft:\n${factsJson}` }],
    });
    const costUsd =
      (response.usage.input_tokens * PRICE_IN + response.usage.output_tokens * PRICE_OUT) / 1_000_000;

    if (response.stop_reason !== "end_turn") return { content: draft, called: true, costUsd };
    const text = response.content.find((block) => block.type === "text");
    if (!text || text.type !== "text") return { content: draft, called: true, costUsd };

    const parsed = JSON.parse(text.text) as { tagline?: string; shortDescription?: string; fullDescription?: string };
    const tagline = parsed.tagline?.trim() ?? "";
    const shortDescription = parsed.shortDescription?.trim() ?? "";
    const fullDescription = parsed.fullDescription?.trim() ?? "";
    const all = `${tagline}\n${shortDescription}\n${fullDescription}`;

    const valid =
      tagline.length > 0 &&
      tagline.length <= TAGLINE_MAX &&
      shortDescription.length > 0 &&
      fullDescription.length > 0 &&
      !HYPE.test(all) &&
      numbersSupported(all, factsJson);
    if (!valid) return { content: draft, called: true, costUsd };

    return {
      content: {
        ...draft,
        tagline,
        shortDescription: clip(shortDescription, SHORT_MAX),
        fullDescription,
        generatedBy: "model",
      },
      called: true,
      costUsd,
    };
  } catch (error) {
    // Every failure lands on the template draft — the same place "no key" does.
    console.error(`[daily-agent] model pass failed, keeping the template draft: ${String(error).slice(0, 200)}`);
    return { content: draft, called: true, costUsd: 0 };
  }
}
