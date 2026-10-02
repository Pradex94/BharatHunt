/**
 * The drafted BharatHunt listing, assembled from verified facts.
 *
 * Deterministic by design (see the "no LLM key" decision): every sentence in
 * the draft is either the product's own words, lifted from its site, or a
 * template filled only with facts the agent verified. Nothing is paraphrased
 * into a claim the site did not make, and nothing missing is filled in — an
 * unknown founder, price or city simply produces no sentence about it. So the
 * full description is as long as the evidence supports (often 80–200 words),
 * not the 300–600 a model would pad it to.
 *
 * Superlatives are filtered out even when the site uses them ("India's #1",
 * "revolutionary"): repeating a claim we have not verified would make it ours.
 *
 * Pure, so `tests/` can pin it. The category list is a parameter because
 * lib/constants.ts imports UI icons and cannot load in plain Node.
 */

import { indiaStateName } from "../india-states.ts";
import { HYPE } from "./safety.ts";
import { sourceLabel, type DraftContent, type Facts, type IndiaSignal } from "./types.ts";

export { sourceLabel };

export const TAGLINE_MAX = 80;
export const SHORT_MAX = 200;
export const SHORT_MIN = 120;

/** Public wording for each kind of India evidence (no raw registration numbers). */
const PUBLIC_EVIDENCE: Partial<Record<IndiaSignal["kind"], string>> = {
  cin: "is registered as an Indian company",
  gstin: "holds an Indian GST registration",
  dpiit: "is recognised under Startup India",
  address_with_pin: "lists an office address in India",
  legal_entity_india: "is run by an Indian legal entity",
  external_coverage: "has been covered as an Indian startup",
  stated_location: "says it is based in India",
  governing_law: "operates under Indian law",
};


/** Sentences, roughly: split on terminal punctuation followed by a space. */
export function sentences(text: string | null | undefined): string[] {
  return (text ?? "")
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'“])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 12);
}

/** Drops sentences that make claims we will not repeat. */
function plain(list: string[]): string[] {
  return list.filter((sentence) => !HYPE.test(sentence));
}

/** Cuts at a word boundary, with an ellipsis only when something was actually cut. */
export function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const boundary = cut.lastIndexOf(" ");
  return `${(boundary > max * 0.5 ? cut.slice(0, boundary) : cut).replace(/[\s,;:–—-]+$/, "")}…`;
}

/** A one-line tagline: the first plain sentence, shortened at a natural break if needed. */
function tagline(facts: Facts, fallback: string): string {
  for (const sentence of plain([...sentences(facts.siteDescription), ...sentences(facts.aboutText)])) {
    const bare = sentence.replace(/[.!]$/, "");
    if (bare.length <= TAGLINE_MAX) return bare;
    // "Acme helps teams ship faster, with fewer meetings" → "Acme helps teams ship faster"
    const clause = /^(.{24,80}?)(?:\s[—–-]\s|[,:;]\s)/.exec(bare)?.[1];
    if (clause) return clause;
    return clip(bare, TAGLINE_MAX);
  }
  return fallback;
}

function shortDescription(facts: Facts): string {
  const pool = plain([...sentences(facts.siteDescription), ...sentences(facts.aboutText)]);
  let text = "";
  for (const sentence of pool) {
    const next = text ? `${text} ${sentence}` : sentence;
    if (next.length > SHORT_MAX) {
      if (!text) text = clip(sentence, SHORT_MAX);
      break;
    }
    text = next;
    if (text.length >= SHORT_MIN) break;
  }
  return text;
}

function listJoin(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function placeLabel(facts: Facts): string | null {
  const state = indiaStateName(facts.stateCode);
  if (facts.city && state && facts.city.toLowerCase() !== state.toLowerCase()) return `${facts.city}, ${state}`;
  return facts.city ?? state ?? null;
}

function pricingSentence(facts: Facts): string | null {
  const trial = facts.freeTrial ? " It offers a free trial." : "";
  if (facts.pricingType === "free") return `It is free to use.${trial}`;
  if (facts.pricingType === "freemium") return `It has a free plan alongside paid plans.${trial}`;
  if (facts.pricingType === "paid") return `It is a paid product.${trial}`;
  return facts.freeTrial ? "It offers a free trial." : null;
}

const PLATFORM_NAMES: Record<string, string> = { android: "Android", ios: "iOS", chrome: "Chrome" };

const TAG_LEXICON: Array<[string, RegExp]> = [
  ["ai", /\b(ai|artificial intelligence|machine learning|llm|genai|gpt)\b/i],
  ["saas", /\b(saas|software as a service|subscription software)\b/i],
  ["fintech", /\b(fintech|payments?|lending|invoic\w*|accounting|upi|banking)\b/i],
  ["edtech", /\b(edtech|learning|courses?|students?|exam prep)\b/i],
  ["healthtech", /\b(healthtech|health ?care|patients?|clinic|doctors?|wellness)\b/i],
  ["developer-tools", /\b(developers?|api|sdk|devops|open[- ]source|cli)\b/i],
  ["open-source", /\b(open[- ]source)\b/i],
  ["b2b", /\b(b2b|for businesses|for teams|enterprises?|smbs?|msmes?)\b/i],
  ["d2c", /\b(d2c|direct[- ]to[- ]consumer)\b/i],
  ["no-code", /\b(no[- ]code|low[- ]code)\b/i],
  ["analytics", /\b(analytics|dashboards?|insights|reporting)\b/i],
  ["security", /\b(security|privacy|compliance|encryption)\b/i],
  ["hr-tech", /\b(hiring|recruit\w*|payroll|hrms|employees?)\b/i],
  ["logistics", /\b(logistics|delivery|shipping|fleet|supply chain)\b/i],
  ["agritech", /\b(agri\w*|farmers?|crops?)\b/i],
  ["legaltech", /\b(legal|contracts?|lawyers?)\b/i],
  ["productivity", /\b(productivity|workflow|tasks?|notes?|calendar)\b/i],
  ["marketing", /\b(marketing|seo|campaigns?|social media)\b/i],
  ["ecommerce", /\b(e-?commerce|online store|storefront|shopify)\b/i],
];

export function deriveTags(facts: Facts): string[] {
  const text = [facts.productName, facts.siteDescription, facts.aboutText].filter(Boolean).join(" ");
  const tags = TAG_LEXICON.filter(([, pattern]) => pattern.test(text)).map(([tag]) => tag);
  if (facts.platformLinks.android || facts.platformLinks.ios) tags.push("mobile-app");
  if (facts.platformLinks.chrome) tags.push("chrome-extension");
  return [...new Set(tags)].slice(0, 6);
}

export type ContentInput = {
  name: string;
  facts: Facts;
  signals: IndiaSignal[];
  indiaConfidence: number;
  minIndiaConfidence: number;
  sourceName: string;
  discoveredOn: string;
  categories: readonly string[];
};

export function buildContent(input: ContentInput): DraftContent {
  const { facts, name } = input;
  const category =
    facts.category && input.categories.includes(facts.category) ? facts.category : "Other";
  const indian = input.indiaConfidence >= input.minIndiaConfidence;
  const place = placeLabel(facts);
  const kind = category === "Other" ? "digital" : category.toLowerCase();

  const fallbackTagline = clip(
    `${indian ? "An Indian" : /^[aeiou]/i.test(kind) ? "An" : "A"} ${kind} product${indian && place ? ` from ${place}` : ""}`,
    TAGLINE_MAX,
  );

  const paragraphs: string[] = [];
  const own = plain(sentences(facts.siteDescription));
  if (own.length) paragraphs.push(own.join(" "));
  const about = plain(sentences(facts.aboutText)).filter((sentence) => !own.includes(sentence));
  if (about.length) paragraphs.push(about.join(" "));

  const maker: string[] = [];
  if (facts.companyName) maker.push(`${name} is built by ${facts.companyName}`);
  if (facts.founderNames.length) {
    maker.push(`${maker.length ? "founded" : `${name} was founded`} by ${listJoin(facts.founderNames)}`);
  }
  if (indian && place) maker.push(`${maker.length ? "based in" : `${name} is based in`} ${place}`);
  if (maker.length) paragraphs.push(`${maker.join(", ")}.`);

  const practical = [pricingSentence(facts)];
  const platforms = Object.keys(facts.platformLinks).map((key) => PLATFORM_NAMES[key]).filter(Boolean);
  if (platforms.length) practical.push(`It is available on ${listJoin(platforms)}, as well as the web.`);
  const practicalText = practical.filter(Boolean).join(" ");
  if (practicalText) paragraphs.push(practicalText);

  const evidence = input.signals
    .map((signal) => PUBLIC_EVIDENCE[signal.kind])
    .filter((phrase): phrase is string => Boolean(phrase))
    .filter((phrase, index, all) => all.indexOf(phrase) === index)
    .slice(0, 2);

  const why: string[] = [];
  why.push(`Found via ${sourceLabel(input.sourceName)} on ${input.discoveredOn}.`);
  if (indian && evidence.length) why.push(`${name} ${listJoin(evidence)}.`);
  const pricing = pricingSentence(facts);
  if (pricing) why.push(pricing.replace(/^It /, `${name} `));

  return {
    tagline: tagline(facts, fallbackTagline),
    shortDescription: shortDescription(facts),
    fullDescription: paragraphs.join("\n\n"),
    category,
    tags: deriveTags(facts),
    whyInteresting: why.join(" "),
    generatedBy: "template",
  };
}
