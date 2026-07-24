import type { ProductCategory, ProductSort } from "@/lib/constants";

/**
 * Collections are hand-curated editorial groupings. Each one is a lens on the
 * catalogue — a theme with a point of view — that resolves to a live product
 * query (category + sort + pricing) so the detail page shows real listings.
 *
 * These are intentionally editorial (not auto-generated): a human decided that
 * "Ship your MVP this weekend" is a story worth telling, and picked the filter
 * that best tells it.
 */
export type Collection = {
  slug: string;
  title: string;
  /** Short tagline shown on the index card. */
  tagline: string;
  /** Longer editorial intro shown on the detail hero. */
  intro: string;
  /** Accent surface for the index card — one of the trinity's warm tones. */
  accent: "coral" | "teal" | "amber" | "dark";
  /** The live query this collection resolves to. */
  query: {
    category?: ProductCategory;
    pricing?: Array<"free" | "freemium" | "paid">;
    sort?: ProductSort;
  };
};

export const COLLECTIONS: Collection[] = [
  {
    slug: "ship-your-mvp",
    title: "Ship your MVP this weekend",
    tagline: "Developer tools that get you from idea to deployed.",
    intro:
      "You don't need a bigger team — you need the right five tools. This is the developer stack founders reach for when the goal is a working product by Sunday night, not a perfect one.",
    accent: "coral",
    query: { category: "Developer Tools", sort: "trending" },
  },
  {
    slug: "founder-finance",
    title: "Founder finance, sorted",
    tagline: "Invoicing, books, and money tools for lean teams.",
    intro:
      "Money is the least glamorous part of building a company and the fastest way to sink one. These finance tools handle invoicing, reconciliation, and reporting so you can spend your attention on the product instead.",
    accent: "teal",
    query: { category: "Finance", sort: "top-rated" },
  },
  {
    slug: "free-to-start",
    title: "Free to start",
    tagline: "Genuinely useful tools with a real free tier.",
    intro:
      "Not a trial. Not a teaser. These products give you something real for free — the kind of free tier you can build a habit on before you ever reach for a card.",
    accent: "amber",
    query: { pricing: ["free", "freemium"], sort: "trending" },
  },
  {
    slug: "creator-toolkit",
    title: "The creator toolkit",
    tagline: "Design and marketing tools for people who publish.",
    intro:
      "Whether you're shipping a newsletter, a course, or a brand, making the thing is only half the work — the other half is making it look and land right. These design and marketing tools cover that second half.",
    accent: "dark",
    query: { category: "Design Tools", sort: "trending" },
  },
  {
    slug: "focus-and-flow",
    title: "Focus & flow",
    tagline: "Productivity apps that give you hours back.",
    intro:
      "The best productivity tool is the one you actually keep open. These are the planners, focus timers, and automations that quietly compound — an hour saved here, a context-switch avoided there.",
    accent: "coral",
    query: { category: "Productivity", sort: "top-rated" },
  },
  {
    slug: "top-of-the-charts",
    title: "Top of the charts",
    tagline: "The highest-rated products on Bharat Hunt right now.",
    intro:
      "Sorted purely by what the community rates highest. No editorializing here — this is the crowd's verdict, updated as the votes come in.",
    accent: "teal",
    query: { sort: "top-rated" },
  },
];

const COLLECTION_BY_SLUG = new Map(COLLECTIONS.map((c) => [c.slug, c]));

export function collectionFromSlug(slug: string): Collection | undefined {
  return COLLECTION_BY_SLUG.get(slug);
}
