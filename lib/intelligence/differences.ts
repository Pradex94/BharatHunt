/**
 * "How is this alternative different?" — one or two short, *verifiable* lines.
 *
 * Every difference is computed from a field both listings carry, and comes
 * with the basis it rests on, so the UI can say where it came from. What this
 * will never say: "cheaper" (no prices are recorded, only free/freemium/paid),
 * "better", "faster", "more popular", or anything a listing does not state.
 * When nothing verifiable separates two products, it returns nothing and the
 * card simply shows no difference — silence beats an invented claim.
 */

import { audienceLabel } from "./concepts.ts";
import type { KnowledgeInput, ProductKnowledge } from "./knowledge.ts";
import { indiaStateName } from "../india-states.ts";

export type Difference = {
  key: "pricing" | "open-source" | "ai-first" | "privacy" | "india" | "location" | "mobile" | "audience";
  /** The chip: "Free plan", "Open source", "Built in Kerala". */
  label: string;
  /** Where it comes from, for a tooltip or a footnote. */
  basis: string;
};

type Side = KnowledgeInput & { knowledge: ProductKnowledge };

const MOBILE = ["ios", "android"];

function listedBy(side: Side): string {
  return side.knowledge.listingSource === "daily_agent"
    ? "verified by BharatHunt on its website"
    : "listed by its maker";
}

/** Differences of `other` relative to `base`, most useful first. */
export function verifiedDifferences(base: Side, other: Side, max = 2): Difference[] {
  const found: Difference[] = [];
  const b = base.knowledge;
  const o = other.knowledge;

  if (other.pricing_type === "free" && base.pricing_type !== "free") {
    found.push({ key: "pricing", label: "Free to use", basis: `Pricing ${listedBy(other)} as free` });
  } else if (other.pricing_type === "freemium" && base.pricing_type === "paid") {
    found.push({ key: "pricing", label: "Free plan", basis: `Pricing ${listedBy(other)} as freemium` });
  }

  if (o.openSource && !b.openSource) {
    found.push({ key: "open-source", label: "Open source", basis: "Its listing says open source and links a code repository" });
  }

  if (o.aiFirst && !b.aiFirst) {
    found.push({ key: "ai-first", label: "AI-first", basis: "Its name, tagline or description describes it as AI" });
  }

  if (o.privacyPhrase && !b.privacyPhrase) {
    found.push({ key: "privacy", label: "Privacy-focused", basis: `Its listing says “${o.privacyPhrase}”` });
  }

  if (o.indiaPhrase && !b.indiaPhrase) {
    found.push({ key: "india", label: "India-focused", basis: `Its listing mentions “${o.indiaPhrase}”` });
  }

  const otherState = o.indiaConnection.state;
  if (otherState && otherState !== b.indiaConnection.state) {
    const name = indiaStateName(otherState);
    if (name) {
      found.push({
        key: "location",
        label: `Built in ${name}`,
        basis:
          o.indiaConnection.basis === "verified"
            ? "Location verified from company records on its website"
            : "Location confirmed by its maker",
      });
    }
  }

  const hasMobile = (k: ProductKnowledge) => k.platforms.some((p) => MOBILE.includes(p));
  if (hasMobile(o) && !hasMobile(b)) {
    found.push({ key: "mobile", label: "Mobile app", basis: "Links an App Store or Google Play listing" });
  }

  const baseAudiences = new Set(b.audiences.map((a) => a.key));
  const newAudience = o.audiences.find((a) => !baseAudiences.has(a.key));
  if (newAudience) {
    found.push({
      key: "audience",
      label: `For ${audienceLabel(newAudience.key).toLowerCase()}`,
      basis: `Its listing mentions “${newAudience.quote}”`,
    });
  }

  return found.slice(0, max);
}
