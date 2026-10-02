/**
 * The shared vocabulary of the Daily 5 agent.
 *
 * Framework-agnostic and import-free so every pure module in lib/daily-agent —
 * and the tests that pin them — can share one set of types without dragging in
 * Next or Supabase.
 */

export type CandidateStatus =
  /** Found, not yet looked at. */
  | "discovered"
  /** Already on BharatHunt (domain or name match). */
  | "already_exists"
  /** Not processed: seen recently, no standalone site, robots.txt, or an admin's Skip. */
  | "skipped"
  /** Looked at and failed a hard check. */
  | "ineligible"
  /** Plausible, but something needs a human before it can go live. */
  | "needs_review"
  /** Passed every check; waiting for selection. */
  | "eligible"
  /** One of the day's picks. */
  | "selected"
  /** Transient: an approval is inserting the product right now. */
  | "publishing"
  | "published"
  | "rejected";

export type BatchStatus = "discovering" | "verifying" | "selecting" | "review" | "completed" | "failed";

export type IndiaSignalKind =
  | "cin"
  | "gstin"
  | "dpiit"
  | "address_with_pin"
  | "legal_entity_india"
  | "external_coverage"
  | "stated_location"
  | "governing_law"
  | "location_mention"
  | "self_declared"
  | "phone"
  /** The weak ones: real, but none of them makes a product Indian. */
  | "in_domain"
  | "inr_pricing"
  | "upi";

export type IndiaSignal = {
  kind: IndiaSignalKind;
  /** Human sentence for the dashboard: "Company website lists a Bengaluru office". */
  label: string;
  weight: number;
  /** The literal text that matched, trimmed — what an admin checks the claim against. */
  evidence: string;
  url: string | null;
};

/** One product as a discovery source handed it over, before anything is fetched. */
export type RawCandidate = {
  name: string;
  /** Null when the source named a product without linking it; resolved by domain probing. */
  websiteUrl: string | null;
  /** The adapter's key (`show_hn`, `funded_startups`, …). */
  sourceName: string;
  /** Where we found it: the HN thread, the news article, the funding report. */
  sourceUrls: string[];
  /** The discovery text itself (headline), kept as provenance. */
  snippet: string | null;
  publishedAt: string | null;
  /** India evidence visible in the discovery context — third-party, not self-declared. */
  discoverySignals: IndiaSignal[];
  /** Cheap pre-rank, so the expensive stages see the most promising first. */
  discoveryScore: number;
};

export type PricingType = "free" | "freemium" | "paid";

/**
 * What the agent could verify about a product. Every field that could not be
 * verified is null (or empty) — never a guess.
 */
export type Facts = {
  productName: string | null;
  companyName: string | null;
  founderNames: string[];
  /** The site's own description (meta / og), verbatim. */
  siteDescription: string | null;
  /** First substantial paragraph of the home or about page, verbatim. */
  aboutText: string | null;
  category: string | null;
  pricingType: PricingType | null;
  freeTrial: boolean | null;
  /** ISO 3166-2:IN code from a CIN, GSTIN or a registered address. */
  stateCode: string | null;
  /** The city the evidence names. */
  city: string | null;
  logoUrl: string | null;
  screenshotUrl: string | null;
  socialLinks: Record<string, string>;
  /** App store links, keyed like PRODUCT_PLATFORMS (`ios`, `android`, `chrome`). */
  platformLinks: Record<string, string>;
  /** Pages actually read, in order. */
  pagesRead: string[];
  waitlistOnly: boolean;
  /** "Product" vs "service" vocabulary — an app vs a dev shop. */
  productSignals: number;
  serviceSignals: number;
  https: boolean;
  responseMs: number | null;
};

export type Scores = {
  indiaScore: number;
  completenessScore: number;
  websiteScore: number;
  uniquenessScore: number;
  launchReadinessScore: number;
  bharatHuntRelevanceScore: number;
  overallScore: number;
};

export type ScoreWeights = {
  india: number;
  completeness: number;
  website: number;
  uniqueness: number;
  launchReadiness: number;
  relevance: number;
};

/** The drafted BharatHunt listing. */
export type DraftContent = {
  tagline: string;
  shortDescription: string;
  fullDescription: string;
  category: string;
  tags: string[];
  whyInteresting: string;
  /** "template" today; "model" only if the optional model pass rewrote it. */
  generatedBy: "template" | "model" | "admin";
  /** Set by an admin when the site's pricing could not be verified. */
  pricingType?: PricingType | null;
};

/** How each discovery source is named in copy ("Found via Show HN"). */
const SOURCE_LABELS: Record<string, string> = {
  manual: "a BharatHunt editor",
  show_hn: "Show HN",
  news_launches: "Indian startup news coverage",
  funded_startups: "Indian funding announcements",
  india_ai_gazetteer: "BharatHunt's AI company index",
};

export function sourceLabel(sourceName: string): string {
  return SOURCE_LABELS[sourceName] ?? sourceName.replace(/_/g, " ");
}

/** What the issue codes mean, for the dashboard. Codes are stored; words are not. */
export const ISSUE_LABELS: Record<string, string> = {
  website_inferred: "Website was found by probing domains for the name — confirm it is the right company",
  pricing_unknown: "Pricing could not be verified — choose it before approving",
  foreign_headquarters: "Site lists a non-Indian headquarters",
  waitlist_only: "Site looks like a waitlist / coming-soon page",
  similar_name: "A product with a similar name is already on BharatHunt",
  thin_description: "The site says very little about itself",
  no_logo: "No usable logo found",
  misleading_claims: "Site makes claims we cannot verify (guaranteed returns, #1, …)",
  low_india_confidence: "India connection is below the threshold",
  service_business: "Looks like an agency or service business, not a product",
  safety_body_text: "Sensitive terms appear in the site's body text",
};
