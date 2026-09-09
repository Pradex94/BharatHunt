import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { FUNDING_CITIES, FUNDING_INDUSTRIES, FUNDING_STAGES } from "@/lib/funding/constants";
import {
  asFundingStage,
  clampWords,
  type ExtractedRound,
} from "@/lib/funding/extract";
import type { FundingCity, FundingIndustry } from "@/lib/funding/constants";

/**
 * The optional model pass over an article.
 *
 * What this layer is allowed to do
 * --------------------------------
 * Fill gaps. It runs *after* `extractRound`, and it may only supply fields the
 * deterministic pass left null — plus a better-written summary. It cannot
 * overwrite a fact that was read straight out of the text by a regex, because
 * between "a pattern matched the literal characters `Rs 22 Cr`" and "a language
 * model believes the amount is ₹22 crore", the first is evidence and the second
 * is testimony. When the two disagree the disagreement is recorded (confidence
 * drops, `needsReview` is set) rather than resolved in the model's favour.
 *
 * Why the whole thing is optional
 * -------------------------------
 * No `ANTHROPIC_API_KEY`, no model call, no error — `refineExtraction` returns
 * the input untouched. That is not a graceful-degradation nicety, it is what
 * makes the feature real on a fresh clone: ingestion, extraction, review and
 * the public page all work with zero external keys, and this improves the
 * output when it is configured. Every failure path (missing key, timeout, rate
 * limit, malformed JSON, a stage outside the vocabulary) lands in the same
 * place: return what the rules produced.
 *
 * Nothing here can invent a field either. The model's answer is re-validated
 * against exactly the constraints the database enforces, and anything that
 * fails validation is dropped — not coerced into something acceptable.
 */

/**
 * `claude-opus-5` by default, overridable because this is a high-volume,
 * low-difficulty call and the cost/quality trade is the operator's to make. A
 * deployment ingesting a few hundred articles a day may well prefer
 * `claude-haiku-4-5`; the validation below is identical either way.
 */
const MODEL = process.env.FUNDING_AI_MODEL?.trim() || "claude-opus-5";

/**
 * Milliseconds. The TypeScript SDK's timeout is in ms (Python's is in seconds —
 * an easy thing to get wrong in either direction).
 *
 * Twenty seconds because this runs inside an ingestion job that has a whole
 * feed to get through: one slow article must not be able to hold up the run,
 * and the deterministic extraction is already sitting there as the answer.
 */
const AI_TIMEOUT_MS = 20_000;

/** Bounded, because the tool's output is a short JSON object and nothing else. */
const MAX_TOKENS = 2_000;

let client: Anthropic | null | undefined; // undefined = not yet resolved

function getClient(): Anthropic | null {
  if (client !== undefined) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  client = apiKey ? new Anthropic({ apiKey }) : null;
  return client;
}

/** Whether the model pass is configured, for the admin diagnostics panel. */
export function isAiExtractionEnabled(): boolean {
  return getClient() !== null;
}

export type RefinedRound = ExtractedRound & {
  summary: string | null;
  /** 'rules' when this layer did not run or contributed nothing. */
  method: "rules" | "ai";
  /** Set when the model contradicted a fact the regex read directly. */
  needsReview: boolean;
};

/**
 * The tool the model must call.
 *
 * `strict: true` with `additionalProperties: false` is what makes the arguments
 * schema-valid on arrival, so the parsing below is checking *semantics* (is this
 * stage in our vocabulary? is this amount a plausible round?) rather than
 * shape.
 *
 * `tool_choice` is left at its default rather than forcing this tool. Forced
 * tool use is rejected outright by some current models, and this module's model
 * id is an environment variable — so the portable form is a schema-strict tool
 * plus a system prompt that names it, which works everywhere.
 */
const EXTRACTION_TOOL: Anthropic.Tool = {
  name: "record_funding_round",
  description:
    "Record the structured facts of a startup funding round, using only what the supplied article text states.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      startup_name: {
        type: ["string", "null"],
        description: "The company that raised. Null if the text does not name it.",
      },
      funding_amount: {
        type: ["number", "null"],
        description:
          "The size of the round as a number in whole major currency units (4000000 for $4 million). Null if the amount was not reported.",
      },
      currency: {
        type: ["string", "null"],
        enum: ["INR", "USD", "EUR", "GBP", "SGD", "AED", "JPY", "AUD", "CAD", null],
        description: "Currency of funding_amount. Null when funding_amount is null.",
      },
      funding_stage: {
        type: "string",
        enum: [...FUNDING_STAGES],
        description:
          "The stage, exactly as listed. Use 'Undisclosed' when the text does not state a stage, or states one not in this list (for example 'pre-Series A').",
      },
      lead_investor: {
        type: ["string", "null"],
        description: "The investor described as leading the round. Null if none is named.",
      },
      investors: {
        type: "array",
        items: { type: "string" },
        description:
          "Every investor named as participating, lead included. Empty array if none are named.",
      },
      industry: {
        type: ["string", "null"],
        enum: [...FUNDING_INDUSTRIES, null],
        description: "The company's sector, from this list. Null if the text does not make it clear.",
      },
      location: {
        type: ["string", "null"],
        description: "The city or region the company is based in, as the text writes it.",
      },
      city: {
        type: ["string", "null"],
        enum: [...FUNDING_CITIES, null],
        description: "Which bucket `location` falls into. Null if location is null.",
      },
      summary: {
        type: ["string", "null"],
        description:
          "An original 50-80 word summary of the funding event in your own words. Never copy sentences or distinctive phrases from the article.",
      },
      confidence: {
        type: "number",
        description:
          "0 to 1. How well-supported this record is by the text. Be strict: 0.5 or below when key facts are inferred rather than stated.",
      },
    },
    required: [
      "startup_name",
      "funding_amount",
      "currency",
      "funding_stage",
      "lead_investor",
      "investors",
      "industry",
      "location",
      "city",
      "summary",
      "confidence",
    ],
    additionalProperties: false,
  },
};

const SYSTEM_PROMPT = `You extract structured facts about startup funding rounds from Indian startup news articles.

Always respond by calling the record_funding_round tool exactly once. Do not write prose.

The rules, in order of importance:

1. Never invent information. If the article does not state a fact, the field is null (or an empty array for investors). A plausible guess is worse than a null, because a null is visibly missing and a guess is not.
2. The funding amount is the size of THIS round. It is not the company's valuation, its revenue, its total funding to date, or the size of a previous round. If the article mentions those figures, ignore them. If the round's size is not reported, funding_amount is null.
3. funding_stage must be one of the listed values. If the article says a stage that is not in the list - "pre-Series A", "bridge", "extension" - use "Undisclosed". Do not map it to the nearest listed stage.
4. investors contains only names the article actually gives. Phrases like "existing investors", "undisclosed investors" or "a family office" are not names; leave them out.
5. The summary must be your own sentences describing the funding event, built from the facts you extracted. Do not reproduce or lightly reword the article's sentences. 50-80 words.
6. confidence should reflect how much of this you read directly versus inferred. Be conservative.`;

/** Anything a caller might have that helps the model. */
export type RefineInput = {
  title: string;
  summary?: string | null;
  sourceName?: string | null;
};

/**
 * Improve a deterministic extraction with a model pass, if one is configured.
 *
 * Never throws, and never returns worse than its input.
 */
export async function refineExtraction(
  base: ExtractedRound,
  input: RefineInput,
  fallbackSummary: string,
): Promise<RefinedRound> {
  const anthropic = getClient();
  const untouched: RefinedRound = {
    ...base,
    summary: fallbackSummary,
    method: "rules",
    needsReview: false,
  };

  if (!anthropic) return untouched;

  // Nothing to send. Guard here rather than inside the try, so an empty article
  // does not cost a request.
  const article = [input.title, input.summary].filter(Boolean).join("\n\n").trim();
  if (!article) return untouched;

  let message: Anthropic.Message;
  try {
    message = await anthropic.messages.create(
      {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        // Extraction from a short text is not a reasoning-heavy task, and this
        // runs once per candidate article across a whole feed.
        output_config: { effort: "low" },
        tools: [EXTRACTION_TOOL],
        messages: [
          {
            role: "user",
            content: `Source: ${input.sourceName ?? "unknown"}\n\n${article.slice(0, 6000)}`,
          },
        ],
      },
      { timeout: AI_TIMEOUT_MS },
    );
  } catch (error) {
    logAiFailure(error);
    return untouched;
  }

  /*
   * A refusal is a valid, non-exceptional response, and it arrives as a 200 —
   * so `stop_reason` has to be checked before `content` is read. Funding news
   * is innocuous, but this runs unattended over whatever a stranger's RSS feed
   * contains, and a refused turn must degrade to the deterministic record like
   * any other miss.
   */
  if (message.stop_reason === "refusal") {
    console.warn(
      JSON.stringify({
        event: "funding_ai_refused",
        category: message.stop_details?.category ?? null,
        at: new Date().toISOString(),
      }),
    );
    return untouched;
  }

  const call = message.content.find(
    (block): block is Anthropic.ToolUseBlock =>
      block.type === "tool_use" && block.name === EXTRACTION_TOOL.name,
  );
  if (!call) return untouched;

  // Never string-match a serialized tool input; escaping varies by model.
  const raw = call.input as Record<string, unknown>;
  return merge(base, raw, fallbackSummary);
}

/**
 * Fold a validated model answer into the deterministic record.
 *
 * The asymmetry is the point: a null in `base` may be filled, a value in `base`
 * may not be replaced. What a disagreement buys is a flag, not an overwrite.
 */
function merge(
  base: ExtractedRound,
  raw: Record<string, unknown>,
  fallbackSummary: string,
): RefinedRound {
  let needsReview = false;
  let contributed = false;

  const fill = <T>(current: T | null, candidate: T | null): T | null => {
    if (current !== null && current !== undefined) return current;
    if (candidate === null || candidate === undefined) return current;
    contributed = true;
    return candidate;
  };

  const modelName = boundedString(raw.startup_name, 160);
  const startupName = fill(base.startupName, modelName);
  if (base.startupName && modelName && !namesAgree(base.startupName, modelName)) {
    needsReview = true;
  }

  const modelAmount = plausibleAmount(raw.funding_amount);
  const modelCurrency = enumValue(raw.currency, [
    "INR",
    "USD",
    "EUR",
    "GBP",
    "SGD",
    "AED",
    "JPY",
    "AUD",
    "CAD",
  ]);

  // Only adopt the pair together — an amount without its currency is a number
  // with no meaning, and the two must come from the same reading of the text.
  let amount = base.amount;
  let amountNumeric = base.amountNumeric;
  let currency = base.currency;
  if (base.amountNumeric === null && modelAmount !== null && modelCurrency !== null) {
    amountNumeric = modelAmount;
    currency = modelCurrency;
    // No `amount` display string: the model was not asked to quote the
    // article's exact wording, and putting a reconstructed one in a field whose
    // contract is "as reported" would break that contract. The formatter
    // renders the number instead.
    amount = null;
    contributed = true;
  } else if (
    base.amountNumeric !== null &&
    modelAmount !== null &&
    modelCurrency === base.currency &&
    Math.abs(modelAmount - base.amountNumeric) / base.amountNumeric > 0.02
  ) {
    // Same currency, materially different number: one of the two read a
    // different figure out of the same sentence. A human decides which.
    needsReview = true;
  }

  const modelStage = asFundingStage(raw.funding_stage);
  let fundingStage = base.fundingStage;
  if (base.fundingStage === "Undisclosed" && modelStage && modelStage !== "Undisclosed") {
    fundingStage = modelStage;
    contributed = true;
  } else if (modelStage && modelStage !== "Undisclosed" && modelStage !== base.fundingStage) {
    needsReview = true;
  }

  const modelInvestors = stringArray(raw.investors, 12, 70);
  const investors = base.investors.length > 0 ? base.investors : modelInvestors;
  if (base.investors.length === 0 && modelInvestors.length > 0) contributed = true;

  const modelLead = boundedString(raw.lead_investor, 70);
  const leadInvestor = fill(base.leadInvestor, modelLead);

  // A lead has to be in the list it leads.
  const finalInvestors =
    leadInvestor && !investors.some((name) => name.toLowerCase() === leadInvestor.toLowerCase())
      ? [leadInvestor, ...investors].slice(0, 12)
      : investors;

  const industry = fill(
    base.industry,
    enumValue(raw.industry, [...FUNDING_INDUSTRIES]) as FundingIndustry | null,
  );
  const location = fill(base.location, boundedString(raw.location, 120));
  const city = fill(base.city, enumValue(raw.city, [...FUNDING_CITIES]) as FundingCity | null);

  /*
   * Confidence is the lower of the two readings, not the model's own number.
   *
   * A model asked to score itself is being asked a question it has no way to
   * check, and the deterministic score is an audit of what was actually
   * matched. Taking the minimum means the model can never talk a weak record
   * up — only the review queue can.
   */
  const modelConfidence = typeof raw.confidence === "number" && Number.isFinite(raw.confidence)
    ? Math.max(0, Math.min(1, raw.confidence))
    : null;
  let confidence = modelConfidence === null ? base.confidence : Math.min(base.confidence, modelConfidence);
  if (needsReview) confidence = Math.min(confidence, 0.5);

  const modelSummary = boundedString(raw.summary, 900);

  return {
    startupName,
    amount,
    amountNumeric,
    currency,
    fundingStage,
    investors: finalInvestors,
    leadInvestor,
    industry,
    location,
    city,
    confidence: Math.round(confidence * 1000) / 1000,
    summary: modelSummary ? clampWords(modelSummary, 80) : fallbackSummary,
    method: contributed || modelSummary ? "ai" : "rules",
    needsReview,
  };
}

// ── Validators ───────────────────────────────────────────────────────────
// Every one of these returns null rather than a coerced value. A model answer
// that does not validate is a missing answer, not an answer to be repaired.

function boundedString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ").slice(0, max);
  return trimmed.length > 0 ? trimmed : null;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

function stringArray(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const name = boundedString(entry, maxLength);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= maxItems) break;
  }
  return out;
}

/** The same sanity bounds the regex path applies, for the same reasons. */
function plausibleAmount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded < 1_000 || rounded > 5_000_000_000_000) return null;
  return rounded;
}

/** Loose comparison, so "ABC" vs "ABC Technologies" is not treated as a conflict. */
function namesAgree(a: string, b: string): boolean {
  const left = a.toLowerCase().replace(/[^a-z0-9]/g, "");
  const right = b.toLowerCase().replace(/[^a-z0-9]/g, "");
  return left.includes(right) || right.includes(left);
}

function logAiFailure(error: unknown): void {
  // Typed classes, checked most-specific first — never a string match on the
  // message. Nothing about the article is logged; only why the call failed.
  let reason = "unknown";
  if (error instanceof Anthropic.AuthenticationError) reason = "auth";
  else if (error instanceof Anthropic.RateLimitError) reason = "rate_limit";
  else if (error instanceof Anthropic.BadRequestError) reason = "bad_request";
  else if (error instanceof Anthropic.APIConnectionTimeoutError) reason = "timeout";
  else if (error instanceof Anthropic.APIConnectionError) reason = "connection";
  else if (error instanceof Anthropic.APIError) reason = `api_${error.status ?? "error"}`;

  console.warn(
    JSON.stringify({
      event: "funding_ai_unavailable",
      reason,
      at: new Date().toISOString(),
    }),
  );
}
