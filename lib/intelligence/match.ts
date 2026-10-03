/**
 * Product Match: "tell BharatHunt what you need" → ranked products, each with
 * one or two sentences on why — built only from what the listing says.
 *
 * Pipeline (the expensive parts happen elsewhere, once):
 *   1. parseMatchQuery — what the request asks for: concepts, audience,
 *      budget words, AI, India. Budget words are removed before concept
 *      matching so "on a budget" never reads as personal finance.
 *   2. Retrieval (services/match.ts) — candidates whose precomputed concepts
 *      overlap the request (GIN index) plus the lexical search's top rows.
 *   3. rankMatches — a transparent weighted score, here, in code review:
 *
 *        concept fit   55%   how strongly the listing names what was asked
 *        text fit      22%   TF-IDF overlap with the request's own words
 *        audience fit   8%   the listing names the asked-for audience
 *        budget fit     7%   free / free plan / paid against what was asked
 *        engagement     5%   log-scaled votes and comments — capped, never dominant
 *        freshness      3%   launched in the last 30 days
 *
 *      A product with ten votes outranks one with a thousand if it fits
 *      better; engagement can only separate near-ties. Nothing is promoted:
 *      there is no paid input to this score.
 *
 * No model is called. "Strong / Good / Possible match" are bands of this score,
 * shown as labels rather than a percentage so a heuristic is never presented as
 * an objective measurement.
 */

import { conceptLabel, conceptsRelated, conceptWeight, matchAudiences, matchConcepts, audienceLabel } from "./concepts.ts";
import { isJobConcept, type EvidenceField, type KnowledgeInput, type ProductKnowledge } from "./knowledge.ts";
import { buildIdf, cosine, listingTokens, vectorize } from "./similarity.ts";
import { cleanText, tokenize } from "./text.ts";

export const MATCH_WEIGHTS = {
  concept: 0.55,
  text: 0.22,
  audience: 0.08,
  budget: 0.07,
  engagement: 0.05,
  freshness: 0.03,
} as const;

export type Budget = "any" | "free" | "free-plan";

/** Who the visitor says they are — the "User type" choice on /discover. */
export { MATCH_AUDIENCES } from "./match-options.ts";

export type MatchRequest = {
  query: string;
  /** Explicit filter: a hard constraint. Budget words in the query are a soft preference. */
  budget: Budget;
  audience: string | null;
  category: string | null;
};

export type ParsedQuery = {
  /** Job concepts, most specific first; "AI" is kept separately. */
  concepts: string[];
  /**
   * How much each concept counts in this request. A longer matching phrase is
   * a more specific ask — in "AI video editor for YouTube" the intent is
   * "video editor", and "YouTube" is context.
   */
  conceptWeights: Record<string, number>;
  wantsAi: boolean;
  wantsIndia: boolean;
  audiences: string[];
  /** From words like "free" or "cheap": a preference, not a filter. */
  budgetPreference: Exclude<Budget, "any"> | null;
  /** True when the request named a price we cannot check ("under ₹500"). */
  mentionedPrice: boolean;
  /** The request with budget words removed — what concepts and text match on. */
  text: string;
};

const STRICT_FREE = /\b(completely|totally|100%?|fully|entirely)\s+free\b|\bfree\s+(only|forever)\b/i;
const FREE_WORD = /\bfree\b/i;
const CHEAP = /\b(cheap|cheapest|affordable|inexpensive|low[\s-]?cost|budget|economical|pocket[\s-]?friendly)\b/i;
const PRICE = /(₹|\brs\.?\s?|\binr\s?|\$)\s?\d[\d,]*(\s?\/?\s?(month|mo|year|yr))?|\bunder\s+\d[\d,]*|\b\d[\d,]*\s?(rupees|rs)\b/gi;
const BUDGET_FILLER = /\b(on a|for a|with a|within)\s+(tight\s+)?budget\b/gi;

export function parseMatchQuery(raw: string): ParsedQuery {
  const query = cleanText(raw).slice(0, 300);
  const mentionedPrice = PRICE.test(query);
  PRICE.lastIndex = 0;

  const budgetPreference: ParsedQuery["budgetPreference"] = STRICT_FREE.test(query)
    ? "free"
    : FREE_WORD.test(query) || CHEAP.test(query) || mentionedPrice
      ? "free-plan"
      : null;

  const text = query
    .replace(BUDGET_FILLER, " ")
    .replace(PRICE, " ")
    .replace(STRICT_FREE, " ")
    .replace(new RegExp(CHEAP.source, "gi"), " ")
    .replace(/\bfree\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const hits = matchConcepts(text);
  const conceptWeights: Record<string, number> = {};
  for (const [key, phrases] of hits) {
    if (!isJobConcept(key) || key === "ai") continue;
    const specificity = Math.max(...phrases.map((phrase) => phrase.trim().split(/\s+/).length));
    conceptWeights[key] = Math.max(conceptWeight(key), 0.3) * (1 + 0.6 * (specificity - 1));
  }
  const concepts = Object.keys(conceptWeights).sort(
    (a, b) => conceptWeights[b] - conceptWeights[a] || a.localeCompare(b),
  );
  return {
    concepts,
    conceptWeights,
    wantsAi: hits.has("ai"),
    wantsIndia: hits.has("india-focus"),
    audiences: [...matchAudiences(text).keys()],
    budgetPreference,
    mentionedPrice,
    text,
  };
}

export type MatchCandidate = KnowledgeInput & {
  knowledge: ProductKnowledge;
  upvote_count?: number | null;
  comment_count?: number | null;
  published_at?: string | null;
};

export type MatchLevel = "strong" | "good" | "possible";

export type MatchResult<C extends MatchCandidate = MatchCandidate> = {
  product: C;
  score: number;
  level: MatchLevel;
  breakdown: Record<keyof typeof MATCH_WEIGHTS, number>;
  /** One or two sentences, every clause backed by the listing. */
  explanation: string;
  /** Which concepts of the request this product answered. */
  matched: string[];
};

const MIN_SCORE = 0.12;

function conceptFit(parsed: ParsedQuery, knowledge: ProductKnowledge): { fit: number; matched: string[] } {
  const asked = [...parsed.concepts, ...(parsed.wantsAi ? ["ai"] : [])];
  if (asked.length === 0) return { fit: 0, matched: [] };
  const strengths = new Map(knowledge.concepts.map((concept) => [concept.key, Math.min(1, concept.strength)]));

  let total = 0;
  let earned = 0;
  const matched: string[] = [];
  for (const key of asked) {
    const weight = key === "ai" ? 0.35 : (parsed.conceptWeights[key] ?? Math.max(conceptWeight(key), 0.3));
    total += weight;
    const direct = strengths.get(key);
    if (direct) {
      earned += weight * direct;
      matched.push(key);
      continue;
    }
    const neighbour = [...strengths.entries()].find(([other]) => conceptsRelated(key, other));
    if (neighbour) earned += weight * 0.35 * neighbour[1];
  }
  return { fit: total > 0 ? earned / total : 0, matched };
}

function budgetFit(preference: ParsedQuery["budgetPreference"], explicit: Budget, pricing: string): number {
  const wanted = explicit !== "any" ? explicit : preference;
  if (!wanted) return 0.5;
  if (wanted === "free") return pricing === "free" ? 1 : pricing === "freemium" ? 0.6 : 0;
  return pricing === "paid" ? 0.2 : 1;
}

function audienceFit(wanted: string[], knowledge: ProductKnowledge): number {
  if (wanted.length === 0) return 0.5;
  const named = knowledge.audiences.map((audience) => audience.key);
  if (named.some((key) => wanted.includes(key))) return 1;
  return named.length === 0 ? 0.4 : 0.1;
}

/** Hard filters from the explicit choices — never from words in the query. */
export function passesFilters(request: MatchRequest, candidate: MatchCandidate): boolean {
  if (request.budget === "free" && candidate.pricing_type !== "free") return false;
  if (request.budget === "free-plan" && candidate.pricing_type === "paid") return false;
  if (request.category === "ai") return candidate.knowledge.aiFirst;
  if (request.category && candidate.category !== request.category) return false;
  return true;
}

const FIELD_PHRASE: Record<EvidenceField, string> = {
  name: "its name",
  tagline: "its tagline",
  description: "its description",
  tags: "its tags",
  category: "its category",
};

function quoteClause(knowledge: ProductKnowledge, key: string): string | null {
  const evidence = knowledge.concepts.find((concept) => concept.key === key);
  if (!evidence) return null;
  if (evidence.field === "category") return `it is listed under ${evidence.quote}`;
  return `${FIELD_PHRASE[evidence.field]} ${evidence.field === "tags" ? "include" : "says"} “${evidence.quote}”`;
}

/**
 * "You asked for video editing — its tagline says “AI video editor”. It lists
 * a free plan." Each clause is either the listing's own words, quoted, or a
 * field the listing carries (pricing, audience). Nothing else is ever said.
 */
export function explainMatch(parsed: ParsedQuery, request: MatchRequest, candidate: MatchCandidate, matched: string[]): string {
  const knowledge = candidate.knowledge;
  const sentences: string[] = [];

  // The most specific thing asked for that this listing answers.
  const primary = parsed.concepts.find((key) => matched.includes(key)) ?? matched[0];
  const clause = primary ? quoteClause(knowledge, primary) : null;
  const usedQuote = primary ? knowledge.concepts.find((concept) => concept.key === primary)?.quote : undefined;
  if (primary && clause) {
    sentences.push(`You asked for ${conceptLabel(primary)} — ${clause}.`);
  } else {
    const askedKey = parsed.concepts[0];
    const neighbour = askedKey
      ? knowledge.concepts.find((concept) => isJobConcept(concept.key) && conceptsRelated(askedKey, concept.key))
      : undefined;
    if (askedKey && neighbour) {
      sentences.push(
        `Close to ${conceptLabel(askedKey)}: ${quoteClause(knowledge, neighbour.key)}.`,
      );
    } else {
      sentences.push("Its listing shares several words with your request.");
    }
  }

  const wantedBudget = request.budget !== "any" ? request.budget : parsed.budgetPreference;
  const wantedAudience = request.audience ? [request.audience] : parsed.audiences;
  const audienceHit = knowledge.audiences.find(
    (audience) => wantedAudience.includes(audience.key) && audience.quote !== usedQuote,
  );

  if (wantedBudget && candidate.pricing_type === "free") {
    sentences.push("It is listed as free.");
  } else if (wantedBudget && candidate.pricing_type === "freemium") {
    sentences.push("It lists a free plan.");
  } else if (audienceHit) {
    sentences.push(`Its listing mentions “${audienceHit.quote}”.`);
  } else if (parsed.wantsAi && knowledge.aiFirst && primary !== "ai") {
    sentences.push("It describes itself as AI-powered.");
  }

  return sentences.slice(0, 2).join(" ");
}

/**
 * Concepts are deliberately broad ("fitness and nutrition" covers a calorie
 * tracker and an activewear brand), so "strong" also needs the request's own
 * words in the listing. A concept-only fit tops out at "good".
 */
function levelFor(score: number, fit: number, text: number): MatchLevel {
  if (score >= 0.55 && fit >= 0.6 && text >= 0.08) return "strong";
  if (score >= 0.35) return "good";
  return "possible";
}

export function rankMatches<C extends MatchCandidate>(
  request: MatchRequest,
  candidates: C[],
  options: { now?: Date; limit?: number } = {},
): { parsed: ParsedQuery; results: MatchResult<C>[] } {
  const parsed = parseMatchQuery(request.query);
  const now = options.now ?? new Date();
  const eligible = candidates.filter((candidate) => passesFilters(request, candidate));
  if (eligible.length === 0 || (!parsed.text && parsed.concepts.length === 0)) return { parsed, results: [] };

  // IDF over the candidates only, with no common-term cutoff: the pool was
  // retrieved because it shares the request's words, so those words being
  // common here is the point, not noise.
  const idf = buildIdf(eligible);
  const queryVector = vectorize(tokenize(parsed.text), idf);
  const vectors = new Map(eligible.map((candidate) => [candidate.id, vectorize(listingTokens(candidate), idf)]));
  const wantedAudience = request.audience ? [request.audience] : parsed.audiences;
  const hasConcepts = parsed.concepts.length > 0 || parsed.wantsAi;

  const results: MatchResult<C>[] = [];
  for (const candidate of eligible) {
    const { fit, matched } = conceptFit(parsed, candidate.knowledge);
    const text = cosine(queryVector, vectors.get(candidate.id) ?? new Map());
    if (fit === 0 && text < 0.08) continue;

    const engagement = Math.min(1, Math.log10(1 + (candidate.upvote_count ?? 0) + (candidate.comment_count ?? 0)) / 3);
    const published = candidate.published_at ? new Date(candidate.published_at).getTime() : 0;
    const freshness = published && now.getTime() - published < 30 * 86_400_000 ? 1 : 0;
    const breakdown = {
      concept: fit,
      text,
      audience: audienceFit(wantedAudience, candidate.knowledge),
      budget: budgetFit(parsed.budgetPreference, request.budget, candidate.pricing_type),
      engagement,
      freshness,
    };

    // Without any concept in the request, its words carry the concept weight too.
    const score = hasConcepts
      ? Object.entries(MATCH_WEIGHTS).reduce((sum, [key, weight]) => sum + weight * breakdown[key as keyof typeof breakdown], 0)
      : (MATCH_WEIGHTS.concept + MATCH_WEIGHTS.text) * text +
        MATCH_WEIGHTS.audience * breakdown.audience +
        MATCH_WEIGHTS.budget * breakdown.budget +
        MATCH_WEIGHTS.engagement * engagement +
        MATCH_WEIGHTS.freshness * freshness;

    if (score < MIN_SCORE) continue;
    results.push({
      product: candidate,
      score: Math.round(score * 1000) / 1000,
      level: levelFor(score, hasConcepts ? fit : text, text),
      breakdown,
      explanation: explainMatch(parsed, request, candidate, matched),
      matched,
    });
  }

  results.sort((a, b) => b.score - a.score || a.product.id.localeCompare(b.product.id));
  return { parsed, results: results.slice(0, options.limit ?? 12) };
}

/** "video editing and social media" — what the request was read as, for the results header. */
export function describeRequest(parsed: ParsedQuery): string | null {
  const parts = parsed.concepts.slice(0, 3).map(conceptLabel);
  if (parsed.wantsAi && parts.length > 0) parts[0] = `AI ${parts[0]}`.replace("AI AI", "AI");
  if (parts.length === 0) return parsed.wantsAi ? "AI products" : null;
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

export function audienceName(key: string): string {
  return audienceLabel(key);
}
