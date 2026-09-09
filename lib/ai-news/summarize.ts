/**
 * The 50-80 word summary that appears on a card (section 11).
 *
 * The constraint that shapes this whole file: **the original article stays the
 * source of truth, and none of its prose may be reproduced here.** A news
 * aggregator that republishes a publisher's paragraphs is not an aggregator, and
 * "summarise it" is not a licence to copy a shorter version of it.
 *
 * So the summary is *composed*, from facts the pipeline established rather than
 * from sentences somebody else wrote:
 *
 *   - the headline, restated as a sentence (a headline is a fact about the
 *     story, and it is what every reader, feed and search engine already sees);
 *   - the entities extracted from it;
 *   - how many independent sources have covered it, and which;
 *   - the category and region this pipeline filed it under.
 *
 * Every one of those is either observable or our own classification, and none of
 * it is generated text about the article's *contents*. Notably absent: anything
 * derived from the feed's excerpt. That excerpt is stored (classification reads
 * it) and is never rendered, because it is the publisher's writing.
 *
 * Nothing here invents a detail. When there is not enough to say — no usable
 * headline — it returns null and the card renders the headline alone, which is
 * the honest degradation.
 *
 * Pure and dependency-free.
 */

import { AI_CATEGORIES } from "./constants.ts";
import { decodeEntities, splitPublisherSuffix } from "./normalize.ts";

/**
 * The word budget.
 *
 * `SUMMARY_MAX_WORDS` is a hard ceiling and is enforced by dropping whole
 * sentences — 80 words is the brief's limit and a summary that exceeded it
 * would be drifting towards republication.
 *
 * `SUMMARY_MIN_WORDS` is a *target*, not a floor, and that distinction is
 * deliberate. Reaching a word count by adding sentences that say nothing is
 * padding, and padding is the failure mode this feature is least able to
 * afford: every sentence here is supposed to be a fact. A story with one source
 * and one entity honestly has about thirty-five words in it, and thirty-five
 * true words beat sixty with filler in them. `SUMMARY_SHORT_WORDS` is where it
 * gets thin enough to be worth appending the pointer to the original.
 */
export const SUMMARY_MIN_WORDS = 45;
export const SUMMARY_SHORT_WORDS = 38;
export const SUMMARY_MAX_WORDS = 80;

export type SummaryInput = {
  headline: string;
  category?: string | null;
  subCategory?: string | null;
  region?: "india" | "global" | null;
  /** Display names, most important first. */
  entities?: string[];
  /** Publication names covering the story, best source first. */
  sources?: string[];
};

function words(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

/**
 * The headline as a sentence: publisher suffix removed, entities decoded, a
 * full stop added if it lacks terminal punctuation.
 *
 * Not rewritten beyond that. Paraphrasing a headline is how a summary acquires
 * a claim the article never made, and this pipeline has no way to check one.
 */
function headlineSentence(raw: string): string | null {
  const { headline } = splitPublisherSuffix(decodeEntities(raw ?? "").trim());
  const clean = headline.replace(/\s+/g, " ").trim();
  if (clean.length < 12) return null;
  return /[.!?]$/.test(clean) ? clean : `${clean}.`;
}

/** "A", "A and B", "A, B and C" — the list form English actually uses. */
function joinList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function entitySentence(entities: string[]): string | null {
  const named = entities.filter(Boolean).slice(0, 3);
  if (named.length === 0) return null;
  if (named.length === 1) return `The story centres on ${named[0]}.`;
  return `It centres on ${named[0]}, and also names ${joinList(named.slice(1))}.`;
}

/**
 * The coverage sentence — the one thing here a plain RSS reader cannot say, and
 * the reason the story/article split in the schema exists.
 *
 * Counts sources, never articles: three posts from one publication is one
 * source, and saying otherwise would inflate the same number the trend score
 * leans on.
 */
function coverageSentence(sources: string[]): string | null {
  const unique = [...new Set(sources.map((source) => source.trim()).filter(Boolean))];
  if (unique.length === 0) return null;
  if (unique.length === 1) return `Reported by ${unique[0]}.`;
  if (unique.length === 2) return `${unique[0]} and ${unique[1]} have both covered it.`;
  return `${unique.length} sources have covered it so far, including ${joinList(unique.slice(0, 3))}.`;
}

/**
 * How the story is filed, and — when the summary would otherwise be very short
 * — what that filing means.
 *
 * The category hint comes from `AI_CATEGORIES`, where it is the definition the
 * classifier implements. Including it is the one lever this composer has for
 * adding substance without adding a claim: it says something true about the
 * category rather than something invented about the article.
 *
 * It is only added when needed, because a definition repeated on every card in
 * a category is noise. A story with three entities and four sources has plenty
 * to say already.
 */
function filingSentence(
  category: string | null | undefined,
  subCategory: string | null | undefined,
  region: string | null | undefined,
  withHint: boolean,
): string | null {
  if (!category) return null;

  const filed = subCategory ? `${category} and ${subCategory}` : category;
  const india = region === "india" ? ", and tracks it as India coverage" : "";

  if (!withHint) return `Bharat Hunt files it under ${filed}${india}.`;

  const hint = AI_CATEGORIES.find((entry) => entry.value === category)?.hint;
  if (!hint) return `Bharat Hunt files it under ${filed}${india}.`;

  // The hint is written as a sentence; lower-casing its first letter turns it
  // into a clause without editing the source list.
  const clause = hint.charAt(0).toLowerCase() + hint.slice(1).replace(/\.$/, "");
  return `Bharat Hunt files it under ${filed}${india} — the section covering ${clause}.`;
}

/**
 * Drop whole sentences from the end until the summary fits the word ceiling.
 *
 * Sentences, not words: truncating mid-sentence produces "…covered it so far,
 * including TechCrunch, The" and an ellipsis, which reads like a bug. The
 * sentences are ordered by importance above, so the last one is always the most
 * expendable.
 */
function trimToBudget(sentences: string[]): string {
  const kept = [...sentences];
  while (kept.length > 1 && words(kept.join(" ")).length > SUMMARY_MAX_WORDS) {
    kept.pop();
  }

  const text = kept.join(" ");
  // A single sentence that is itself over budget can only be a very long
  // headline. Better an over-long first sentence than a truncated claim.
  return text;
}

/**
 * Compose the summary, or null when there is not enough to compose one from.
 *
 * The order of the sentences is the order of their value to a reader: what
 * happened, who it involves, who is reporting it, and how we filed it. The
 * closing pointer is added only when the result would otherwise fall short of
 * the 45-word floor, so it never displaces something substantive.
 */
export function composeSummary(input: SummaryInput): string | null {
  const opening = headlineSentence(input.headline);
  if (!opening) return null;

  const core = [opening, entitySentence(input.entities ?? []), coverageSentence(input.sources ?? [])]
    .filter((sentence): sentence is string => Boolean(sentence));

  // Two passes: compose without the category hint, and only reach for it if the
  // result is thin. `SUMMARY_MIN_WORDS` is a target, never a quota — padding a
  // summary to hit a word count is exactly the kind of filler this feature is
  // supposed not to produce, so the escalation stops at the hint and one
  // pointer sentence and then accepts whatever length it has.
  const withoutHint = [
    ...core,
    filingSentence(input.category, input.subCategory, input.region, false),
  ].filter((sentence): sentence is string => Boolean(sentence));

  if (words(withoutHint.join(" ")).length >= SUMMARY_MIN_WORDS) {
    return trimToBudget(withoutHint);
  }

  const withHint = [
    ...core,
    filingSentence(input.category, input.subCategory, input.region, true),
  ].filter((sentence): sentence is string => Boolean(sentence));

  if (words(withHint.join(" ")).length < SUMMARY_SHORT_WORDS) {
    // Not padding for its own sake: this line is the disclaimer the whole
    // feature rests on, and a summary this thin is exactly where a reader most
    // needs to be sent to the original.
    withHint.push("Open the original report for the full detail.");
  }

  return trimToBudget(withHint);
}

/** Word count of a composed summary, for tests and for the admin screen. */
export function summaryWordCount(summary: string | null | undefined): number {
  return summary ? words(summary).length : 0;
}
