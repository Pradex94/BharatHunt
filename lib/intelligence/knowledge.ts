/**
 * The product knowledge model: structured attributes derived from a listing.
 *
 * Every attribute here is *derived from fields the product already has* — name,
 * tagline, description, tags, category, pricing, links, launch location — and
 * every derived claim keeps the evidence that produced it (which field, which
 * phrase). Nothing is inferred that the listing does not say. That is what
 * lets the UI print "why this matches" or a comparison cell and stand behind
 * it: the sentence can always be traced back to the maker's own words, or to
 * the facts the Daily 5 agent verified on the product's site.
 *
 * Attributes the spec suggested but the data cannot support are deliberately
 * absent: there is no `pricingRange` (`products.pricing_amount` is empty on
 * every published row), no `integrations` and no `companySize` (nothing
 * records them). Add them when a field exists to derive them from.
 *
 * Pure and framework-agnostic; reached by `npm test` through relative imports.
 */

import {
  CONCEPTS,
  conceptByKey,
  matchAudiences,
  matchConcepts,
  type PhraseHits,
} from "./concepts.ts";
import { phraseKey, quoteSource } from "./text.ts";

/** Bump when derivation changes, so the indexer rewrites every row. */
export const KNOWLEDGE_VERSION = 4;

export type KnowledgeInput = {
  id: string;
  name: string;
  tagline: string | null;
  description: string | null;
  category: string;
  pricing_type: string;
  tags: string[] | null;
  website_url?: string | null;
  github_url?: string | null;
  launch_state?: string | null;
  /** 'detected' (geo-IP prefill), 'maker' (confirmed by the maker) or 'verified' (Daily 5 evidence). */
  launch_state_source?: string | null;
  /** 'maker' or 'daily_agent'. */
  source?: string | null;
  platform_links?: Record<string, string> | null;
};

export type EvidenceField = "name" | "tagline" | "description" | "tags" | "category";

export type ConceptEvidence = {
  key: string;
  /** 0.5–1.3: how prominently the listing says it (name/tagline beat tags). */
  strength: number;
  /** The most prominent field that named it, and the lexicon phrase that matched. */
  field: EvidenceField;
  phrase: string;
  /** The listing's own words for that phrase — what the UI quotes, never `phrase`. */
  quote: string;
};

export type AudienceEvidence = { key: string; field: EvidenceField; phrase: string; quote: string };

/** Where a fact about a product came from — shown to visitors, never hidden. */
export type Provenance = "maker" | "verified" | "derived" | "community";

export type ProductKnowledge = {
  version: number;
  concepts: ConceptEvidence[];
  audiences: AudienceEvidence[];
  /** True only when the name, tagline or description — not just a tag — says AI. */
  aiFirst: boolean;
  /** Its listing calls itself open source *and* links a code repository. */
  openSource: boolean;
  /** The phrase that makes it privacy-first, e.g. "runs entirely in your browser". */
  privacyPhrase: string | null;
  /** The phrase that makes it India-focused, e.g. "Indian students". */
  indiaPhrase: string | null;
  /** free/freemium → true, paid → false. Never null: pricing_type is required. */
  freePlan: boolean;
  /** Where it is available: "web", "code", plus app-store keys from platform_links. */
  platforms: string[];
  indiaConnection: {
    state: string | null;
    /** How the state is known. `null` when no state was recorded. */
    basis: "verified" | "maker" | "detected" | null;
  };
  /** Who wrote the listing: its maker, or BharatHunt's Daily 5 agent from verified facts. */
  listingSource: "maker" | "daily_agent";
};

const FIELD_WEIGHT: Record<EvidenceField, number> = {
  name: 1,
  tagline: 1,
  description: 0.8,
  // Maker-typed and noisy (a payments gateway tagged "education"), so a tag on
  // its own makes a weak claim.
  tags: 0.6,
  category: 0.5,
};

const FIELD_ORDER: EvidenceField[] = ["name", "tagline", "description", "tags", "category"];

function fieldTexts(product: KnowledgeInput): Record<EvidenceField, string> {
  return {
    name: product.name ?? "",
    tagline: product.tagline ?? "",
    description: product.description ?? "",
    // Joined with a separator token so a phrase cannot span two tags.
    tags: (product.tags ?? []).join(" | "),
    category: product.category ?? "",
  };
}

function hitsByField(
  product: KnowledgeInput,
  matcher: (text: string) => PhraseHits,
): Map<EvidenceField, PhraseHits> {
  const texts = fieldTexts(product);
  const result = new Map<EvidenceField, PhraseHits>();
  for (const field of FIELD_ORDER) result.set(field, matcher(texts[field]));
  return result;
}

/** The concepts a listing names, strongest first, each with its evidence. */
export function deriveConcepts(product: KnowledgeInput): ConceptEvidence[] {
  const byField = hitsByField(product, matchConcepts);
  const texts = fieldTexts(product);
  const evidence: ConceptEvidence[] = [];

  for (const concept of CONCEPTS) {
    const fields = FIELD_ORDER.filter((field) => byField.get(field)?.has(concept.key));
    if (fields.length === 0) continue;
    const top = fields[0];
    // Named in more than one place is a stronger claim, capped so a long
    // description cannot outshout a tagline.
    const strength = Math.min(1.3, FIELD_WEIGHT[top] + 0.15 * (fields.length - 1));
    const phrase = byField.get(top)!.get(concept.key)![0];
    evidence.push({
      key: concept.key,
      strength: Math.round(strength * 100) / 100,
      field: top,
      phrase,
      quote: quoteSource(texts[top], phrase),
    });
  }

  return evidence.sort((a, b) => b.strength - a.strength || a.key.localeCompare(b.key));
}

export function deriveAudiences(product: KnowledgeInput): AudienceEvidence[] {
  const byField = hitsByField(product, matchAudiences);
  const texts = fieldTexts(product);
  const seen = new Set<string>();
  const audiences: AudienceEvidence[] = [];
  // Category names never describe an audience.
  for (const field of FIELD_ORDER.filter((f) => f !== "category")) {
    for (const [key, phrases] of byField.get(field) ?? []) {
      if (seen.has(key)) continue;
      seen.add(key);
      audiences.push({ key, field, phrase: phrases[0], quote: quoteSource(texts[field], phrases[0]) });
    }
  }
  return audiences;
}

const OPEN_SOURCE = [phraseKey("open source"), phraseKey("open-source")];

export function deriveKnowledge(product: KnowledgeInput): ProductKnowledge {
  const concepts = deriveConcepts(product);
  const conceptOf = (key: string) => concepts.find((concept) => concept.key === key);

  const ai = conceptOf("ai");
  const privacy = conceptOf("privacy");
  const india = conceptOf("india-focus");

  const prose = phraseKey(`${product.name} ${product.tagline ?? ""} ${product.description ?? ""}`);
  const openSource =
    Boolean(product.github_url) && OPEN_SOURCE.some((needle) => needle && prose.includes(needle));

  const platforms: string[] = [];
  if (product.website_url) platforms.push("web");
  if (product.github_url) platforms.push("code");
  for (const [key, url] of Object.entries(product.platform_links ?? {})) {
    if (typeof url === "string" && url.trim()) platforms.push(key);
  }

  const basis = product.launch_state
    ? product.launch_state_source === "verified" ||
      product.launch_state_source === "maker" ||
      product.launch_state_source === "detected"
      ? product.launch_state_source
      : "maker"
    : null;

  return {
    version: KNOWLEDGE_VERSION,
    concepts,
    audiences: deriveAudiences(product),
    aiFirst: Boolean(ai && ai.field !== "tags" && ai.field !== "category"),
    openSource,
    // Attributes need the listing's prose, not a tag, to be stated as fact.
    privacyPhrase: privacy && privacy.field !== "tags" ? privacy.quote : null,
    indiaPhrase: india && india.field !== "tags" ? india.quote : null,
    freePlan: product.pricing_type === "free" || product.pricing_type === "freemium",
    platforms,
    indiaConnection: { state: product.launch_state ?? null, basis },
    listingSource: product.source === "daily_agent" ? "daily_agent" : "maker",
  };
}

/**
 * Filterable flags, for the GIN-indexed `product_intelligence.attributes`
 * column: the marketplace's "AI-first" filter and Product Match read these.
 */
export type KnowledgeAttribute = "ai-first" | "open-source" | "privacy" | "india-focus" | "free-plan" | "mobile";

export function knowledgeAttributes(knowledge: ProductKnowledge): KnowledgeAttribute[] {
  const attributes: KnowledgeAttribute[] = [];
  if (knowledge.aiFirst) attributes.push("ai-first");
  if (knowledge.openSource) attributes.push("open-source");
  if (knowledge.privacyPhrase) attributes.push("privacy");
  if (knowledge.indiaPhrase || knowledge.indiaConnection.state) attributes.push("india-focus");
  if (knowledge.freePlan) attributes.push("free-plan");
  if (knowledge.platforms.some((platform) => platform === "ios" || platform === "android")) attributes.push("mobile");
  return attributes;
}

/** Concept keys only, for the GIN-indexed `product_intelligence.concepts` column. */
export function conceptKeys(knowledge: ProductKnowledge): string[] {
  return knowledge.concepts.map((concept) => concept.key);
}

/**
 * A stable fingerprint of everything derivation reads. The indexer compares it
 * with the stored one and skips unchanged products — `products.updated_at`
 * cannot be used for this, because every view and upvote bumps it.
 *
 * FNV-1a rather than a crypto hash: this is change detection, not security,
 * and it has to run in Node, the edge and tests without imports.
 */
export function contentHash(product: KnowledgeInput): string {
  const material = JSON.stringify([
    KNOWLEDGE_VERSION,
    product.name,
    product.tagline,
    product.description,
    product.category,
    product.pricing_type,
    [...(product.tags ?? [])].sort(),
    product.website_url ?? null,
    product.github_url ?? null,
    product.launch_state ?? null,
    product.launch_state_source ?? null,
    product.source ?? null,
    Object.keys(product.platform_links ?? {}).sort(),
  ]);
  let hash = 0x811c9dc5;
  for (let index = 0; index < material.length; index += 1) {
    hash ^= material.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Whether a concept is one that describes what a product does (not an attribute). */
export function isJobConcept(key: string): boolean {
  return conceptByKey(key)?.group !== "attribute";
}
