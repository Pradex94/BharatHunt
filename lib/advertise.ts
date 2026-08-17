/**
 * Advertising packages offered on Bharat Hunt. Framework-agnostic data shared
 * by the /advertise page (the cards) and the inquiry form (the select), so the
 * two never drift apart.
 */

export type AdPackage = {
  id: string;
  name: string;
  tagline: string;
  features: string[];
};

export const AD_PACKAGES: AdPackage[] = [
  {
    id: "featured-listing",
    name: "Featured Listing",
    tagline: "Pin your product to the top of the marketplace and its category.",
    features: ["Top of marketplace + category", "“Promoted” badge", "7 days of placement"],
  },
  {
    id: "homepage-spotlight",
    name: "Homepage Spotlight",
    tagline: "A premium slot on the Bharat Hunt homepage, in front of every visitor.",
    features: ["Homepage hero placement", "Logo, tagline & CTA", "Weekly rotation"],
  },
  {
    id: "newsletter-feature",
    name: "Newsletter Feature",
    tagline: "Reach makers and founders directly in our community roundup.",
    features: ["Dedicated feature slot", "Link, blurb & image", "Sent to subscribers"],
  },
];
