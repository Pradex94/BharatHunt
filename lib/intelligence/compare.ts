/**
 * The comparison table, as data: one row per attribute, one cell per product,
 * and every cell labelled with where its value came from.
 *
 * Rules the table keeps, because the page makes them promises:
 *   - Only fields the listings carry. A value the data does not hold is shown
 *     as "Not stated" / "None listed", never filled in.
 *   - No verdicts. Nothing here ranks, scores or crowns a product; there is no
 *     "best" or "winner" row. The reader decides.
 *   - Provenance on every cell: the maker's own listing, facts BharatHunt
 *     verified on the product's site (Daily 5 listings), text derived from the
 *     listing by the concept lexicon, or community activity.
 */

import { audienceLabel, conceptLabel } from "./concepts.ts";
import { isJobConcept, type KnowledgeInput, type Provenance, type ProductKnowledge } from "./knowledge.ts";
import { formatDate } from "../format-date.ts";
import { indiaStateName } from "../india-states.ts";

export type CompareProduct = KnowledgeInput & {
  knowledge: ProductKnowledge;
  published_at?: string | null;
  upvote_count?: number | null;
  comment_count?: number | null;
};

export type CompareCell = {
  text: string;
  provenance: Provenance | null;
  /** True for "Not stated"-style cells, which render quieter. */
  empty?: boolean;
};

export type CompareRow = { key: string; label: string; cells: CompareCell[] };

const PRICING_LABEL: Record<string, string> = { free: "Free", freemium: "Freemium", paid: "Paid" };

/** Mirrors PRODUCT_PLATFORMS in lib/constants.ts, which cannot load here (it imports icons). */
const PLATFORM_LABEL: Record<string, string> = {
  web: "Web",
  code: "Source code",
  ios: "iOS",
  android: "Android",
  chrome: "Chrome extension",
  figma: "Figma Community",
  producthunt: "Product Hunt",
  appsumo: "AppSumo",
};

const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function listing(product: CompareProduct): Provenance {
  return product.knowledge.listingSource === "daily_agent" ? "verified" : "maker";
}

const notStated = (text = "Not stated"): CompareCell => ({ text, provenance: null, empty: true });

export const PROVENANCE_LABEL: Record<Provenance, string> = {
  maker: "From the maker's listing",
  verified: "Verified by BharatHunt on the product's site",
  derived: "Derived from the listing text",
  community: "BharatHunt community activity",
};

const PRICING_PHRASE: Record<string, string> = {
  free: "free to use",
  freemium: "free to start, with paid plans",
  paid: "a paid product",
};

/**
 * The lead paragraph of a curated "A vs B" page — every clause from a field
 * both listings carry (shared concepts, pricing, a confirmed or verified
 * state), so the page says something specific without saying anything the
 * data does not support. Never ranks.
 */
export function describePair(a: CompareProduct, b: CompareProduct, sharedConcepts: string[]): string {
  const shared = sharedConcepts
    .filter((key) => key !== "ai")
    .slice(0, 2)
    .map(conceptLabel);
  const sideText = (product: CompareProduct) => {
    const state = indiaStateName(product.knowledge.indiaConnection.state);
    const pricing = PRICING_PHRASE[product.pricing_type] ?? product.pricing_type;
    return `${product.name} is ${pricing}${state ? ` and based in ${state}` : ""}`;
  };
  const opening = shared.length
    ? `${a.name} and ${b.name} are both listed on Bharat Hunt for ${shared.join(" and ")}.`
    : `${a.name} and ${b.name} are listed on Bharat Hunt for similar work.`;
  return `${opening} ${sideText(a)}; ${sideText(b)}. The table lines up what each listing says — Bharat Hunt doesn't pick a winner.`;
}

export function buildCompareRows(products: CompareProduct[]): CompareRow[] {
  const row = (key: string, label: string, cell: (product: CompareProduct) => CompareCell): CompareRow => ({
    key,
    label,
    cells: products.map(cell),
  });

  return [
    row("category", "Category", (p) => ({ text: p.category, provenance: listing(p) })),
    row("pricing", "Pricing", (p) => ({
      text: PRICING_LABEL[p.pricing_type] ?? p.pricing_type,
      provenance: listing(p),
    })),
    row("free-plan", "Free plan", (p) =>
      p.pricing_type === "free"
        ? { text: "Yes — free to use", provenance: listing(p) }
        : p.pricing_type === "freemium"
          ? { text: "Yes — free tier with paid upgrades", provenance: listing(p) }
          : notStated("None listed"),
    ),
    row("ai", "AI", (p) => {
      if (p.knowledge.aiFirst) return { text: "Describes itself as AI-powered", provenance: "derived" };
      if (p.knowledge.concepts.some((concept) => concept.key === "ai")) {
        return { text: "Tagged AI by its maker", provenance: "maker" };
      }
      return notStated("Not mentioned");
    }),
    row("does", "What it does", (p) => {
      const labels = p.knowledge.concepts
        .filter((concept) => isJobConcept(concept.key) && concept.key !== "ai")
        .slice(0, 3)
        .map((concept) => conceptLabel(concept.key));
      return labels.length > 0
        ? { text: sentence(labels.join(", ")), provenance: "derived" }
        : notStated("Not enough detail in the listing");
    }),
    row("audience", "Who it's for", (p) => {
      const labels = p.knowledge.audiences.slice(0, 3).map((audience) => audienceLabel(audience.key));
      return labels.length > 0 ? { text: labels.join(", "), provenance: "derived" } : notStated();
    }),
    row("india", "India connection", (p) => {
      const state = indiaStateName(p.knowledge.indiaConnection.state);
      if (state) {
        return p.knowledge.indiaConnection.basis === "verified"
          ? { text: `Based in ${state} (verified from company records)`, provenance: "verified" }
          : { text: `Based in ${state} (confirmed by the maker)`, provenance: "maker" };
      }
      if (p.knowledge.indiaPhrase) {
        return { text: `Listing mentions “${p.knowledge.indiaPhrase}”`, provenance: "derived" };
      }
      return notStated();
    }),
    row("platforms", "Available on", (p) => {
      const labels = p.knowledge.platforms.map(
        (key) => PLATFORM_LABEL[key] ?? key.charAt(0).toUpperCase() + key.slice(1),
      );
      return labels.length > 0 ? { text: labels.join(", "), provenance: listing(p) } : notStated();
    }),
    row("privacy", "Privacy", (p) =>
      p.knowledge.privacyPhrase
        ? { text: `Listing says “${p.knowledge.privacyPhrase}”`, provenance: "derived" }
        : notStated(),
    ),
    row("launched", "Launched on BharatHunt", (p) => {
      const date = formatDate(p.published_at ?? null);
      return date ? { text: date, provenance: null } : notStated("Unknown");
    }),
    row("community", "Community", (p) => ({
      text: `${p.upvote_count ?? 0} upvotes · ${p.comment_count ?? 0} comments`,
      provenance: "community",
    })),
    row("listing", "Listing", (p) =>
      p.knowledge.listingSource === "daily_agent"
        ? { text: "Discovered and verified by BharatHunt Daily 5", provenance: "verified" }
        : { text: "Submitted by its maker", provenance: "maker" },
    ),
  ];
}
