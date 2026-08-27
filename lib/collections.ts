/**
 * The programmatic SEO layer: every `/collections/[slug]` page, derived.
 *
 * Framework-agnostic (no `next/*`, no database client), the same contract as
 * `lib/constants.ts`, so the sitemap, the route, the index page and the admin
 * audit all read one definition instead of four that drift. The import below is
 * relative and extensioned for the same reason `lib/rate-limit-ip.ts` is: it
 * makes the generator reachable from `npm test`, where the `@/` alias does not
 * resolve, and duplicate slugs or titles here are an SEO bug worth a test.
 *
 * ## What generates a page, and what does not
 *
 * A collection exists only where the catalogue can answer a question a person
 * actually types. Two generators earn that today, both measured against the
 * live data rather than assumed:
 *
 *   - **pricing × category** — "free developer tools" is a real query, and the
 *     slice genuinely differs from its parent category: 11 of the 13 developer
 *     tools are free, but only 12 of 93 products overall are paid, so the paid
 *     slices are a different shortlist rather than a re-sort of the same one.
 *   - **topic tags**, from an explicit allowlist. Tags are maker-supplied and
 *     unbounded, so generating one page per tag would be exactly the doorway
 *     farm this is meant to avoid. `ai` is on the list because 26 products
 *     carry it *across* categories — a grouping the taxonomy cannot express.
 *     `productivity` is not, because it duplicates a category one-for-one.
 *
 *   - **launch state**, from the location a maker confirmed when submitting.
 *     This is the one axis no competitor can copy — it is data this platform
 *     collects and nobody else has — and it answers a query an India-first
 *     marketplace is uniquely placed to answer. The threshold does most of the
 *     work here: at three products a state page is a real shortlist, and the
 *     states that do not clear it simply do not exist as pages.
 *
 * Deliberately not generated: `/best/*` (nothing here ranks products by quality
 * — see RANKING_NOTE) and `alternatives/*` (the only competitor signal is
 * same-category, so every alternatives page in a category would list the same
 * products as every other).
 *
 * ## Thresholds
 *
 * `MIN_PRODUCTS_TO_EXIST` and `MIN_PRODUCTS_TO_INDEX` are separate on purpose. A
 * collection with one product is a real page that a real link may point at, so
 * it renders and stays crawlable; it just does not claim a place in the index or
 * appear in the sitemap. It becomes indexable by itself as the catalogue grows,
 * with no redeploy — the same self-healing rule `isIndexableProduct` uses.
 */

import {
  PRODUCT_CATEGORIES,
  PRICING_TYPE_LABELS,
  slugForCategory,
  type ProductCategory,
  type ProductPricingType,
} from "./constants.ts";
import { INDIA_STATES } from "./india-states.ts";

/** Below this a collection is not generated at all: the route 404s. */
export const MIN_PRODUCTS_TO_EXIST = 1;

/**
 * Below this the page renders but sets `noindex` and stays out of the sitemap.
 * Three is the point at which a list stops reading as an accident.
 */
export const MIN_PRODUCTS_TO_INDEX = 3;

/**
 * How every "top"/ordering claim on these pages is defined, in one place.
 *
 * There is no rating or review data in this database — `products.avg_rating` is
 * unpopulated for every published row and no reviews table exists — so nothing
 * here may say "best". Upvotes are real (79 of 93 products have at least one),
 * so community votes are the one ranking signal that can be stated honestly,
 * and every page that orders by them says so in visible text.
 */
export const RANKING_NOTE = "Ordered by community upvotes on Bharat Hunt.";

/**
 * "Other" never generates a collection. "Free Other Products" answers no query,
 * and a page that exists only because a URL could be formed is the definition of
 * a doorway page.
 */
const EXCLUDED_CATEGORIES: readonly string[] = ["Other"];

/**
 * Tags allowed to become a collection, with the wording each one gets.
 *
 * An allowlist rather than a threshold on tag frequency: frequency measures
 * whether makers type a word, not whether a page about it would be worth
 * reading. Adding an entry here is a deliberate editorial act.
 */
const TOPIC_TAGS: ReadonlyArray<{
  tag: string;
  slug: string;
  title: string;
  noun: string;
  intro: string;
}> = [
  {
    tag: "ai",
    slug: "ai-tools",
    title: "AI Tools",
    noun: "AI tools",
    intro:
      "AI products launched on Bharat Hunt, spanning every category — writing, support, analytics, developer tooling. Grouped by what they do rather than which section they were filed under.",
  },
  {
    tag: "saas",
    slug: "saas-products",
    title: "SaaS Products",
    noun: "SaaS products",
    intro: "Subscription software built by Indian makers, from solo side projects to funded teams.",
  },
];

export type CollectionFilter = {
  category?: ProductCategory;
  pricing?: ProductPricingType;
  tag?: string;
  /** ISO 3166-2:IN code, e.g. "IN-KA". */
  launchState?: string;
};

export type Collection = {
  /** URL segment: /collections/[slug]. */
  slug: string;
  /** Visible H1. */
  title: string;
  /** <title>, kept under ~60 characters so it is not truncated in results. */
  metaTitle: string;
  metaDescription: string;
  /** Lead paragraph above the grid — unique per collection, never templated alone. */
  intro: string;
  /** The database query this page resolves to. */
  filter: CollectionFilter;
  /** Parent for breadcrumbs and the "up" link. */
  parent: { name: string; path: string };
  /** Slugs of collections worth linking to from this one. */
  related: string[];
  /** Which generator produced this, for the admin audit. */
  kind: "pricing-category" | "topic" | "state";
};

/** "Design Tools" → "design tools", so it reads inside a sentence. */
function lower(name: string): string {
  return name.toLowerCase();
}

/**
 * Category names already ending in a noun ("Developer Tools") read wrong with
 * "Products" appended; the abstract ones ("Finance") need it.
 */
function categoryNoun(category: ProductCategory): string {
  return /tools|products/i.test(category) ? category : `${category} Products`;
}

function pricingCategoryCollections(): Collection[] {
  const collections: Collection[] = [];

  for (const category of PRODUCT_CATEGORIES) {
    if (EXCLUDED_CATEGORIES.includes(category)) continue;
    const categorySlug = slugForCategory(category);
    if (!categorySlug) continue;

    for (const pricing of Object.keys(PRICING_TYPE_LABELS) as ProductPricingType[]) {
      const label = PRICING_TYPE_LABELS[pricing];
      const noun = categoryNoun(category);
      const slug = `${pricing}-${categorySlug}`;

      collections.push({
        slug,
        title: `${label} ${noun}`,
        metaTitle: `${label} ${noun} in India`,
        metaDescription:
          pricing === "free"
            ? `${noun} you can use without paying, launched by Indian makers on Bharat Hunt. ${RANKING_NOTE}`
            : pricing === "freemium"
              ? `${noun} with a free tier and paid upgrades, from Indian makers on Bharat Hunt. ${RANKING_NOTE}`
              : `Paid ${lower(noun)} from Indian makers on Bharat Hunt, with links to pricing on each product's own site.`,
        intro:
          pricing === "free"
            ? `Every ${lower(category)} product on Bharat Hunt that its maker listed as free to use. No trials that expire into a paywall — those are filed under freemium.`
            : pricing === "freemium"
              ? `${noun} you can start using at no cost and pay for as you grow. Each maker sets their own limits, so the free tier is worth checking on the product's own page.`
              : `${noun} that charge from the start. Pricing lives on each maker's own site and is not restated here, so nothing on this page can go stale.`,
        filter: { category, pricing },
        parent: { name: category, path: `/categories/${categorySlug}` },
        related: [],
        kind: "pricing-category",
      });
    }
  }

  // Siblings first (the same category at a different price), then the same
  // price point in a neighbouring category. Computed rather than authored, so a
  // new category cannot leave a page with a dead "related" list.
  const bySlug = new Map(collections.map((c) => [c.slug, c]));
  for (const collection of collections) {
    const siblings = collections
      .filter(
        (other) =>
          other.slug !== collection.slug && other.filter.category === collection.filter.category,
      )
      .map((other) => other.slug);
    const samePrice = collections
      .filter(
        (other) =>
          other.filter.pricing === collection.filter.pricing &&
          other.filter.category !== collection.filter.category,
      )
      .slice(0, 3)
      .map((other) => other.slug);
    collection.related = [...siblings, ...samePrice].filter((slug) => bySlug.has(slug));
  }

  return collections;
}

function topicCollections(): Collection[] {
  return TOPIC_TAGS.map((topic) => ({
    slug: topic.slug,
    title: topic.title,
    metaTitle: `${topic.title} from Indian Makers`,
    metaDescription: `${topic.intro.split(".")[0]}. ${RANKING_NOTE}`,
    intro: topic.intro,
    filter: { tag: topic.tag },
    parent: { name: "Marketplace", path: "/marketplace" },
    related: TOPIC_TAGS.filter((other) => other.slug !== topic.slug).map((other) => other.slug),
    kind: "topic" as const,
  }));
}

/**
 * Collections by the state a maker launched from.
 *
 * The slug is the state name, not the ISO code: `/collections/made-in-karnataka`
 * is a URL a person can read and retype, `/collections/made-in-in-ka` is not.
 * Only full states and union territories that carry products end up as pages,
 * which the shared threshold handles without a second rule.
 */
function stateCollections(): Collection[] {
  return INDIA_STATES.map((state) => ({
    slug: `made-in-${state.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")}`,
    title: `Products Made in ${state.name}`,
    /*
     * Two of India's union territories have names long enough to push the
     * preferred title past the ~60 characters a result page shows ("Dadra &
     * Nagar Haveli and Daman & Diu" alone is 36). A truncated title loses its
     * end, which is where the state name is, so the shorter form is used
     * instead of letting the distinguishing part be the part that is cut.
     */
    metaTitle:
      `Startups & Tools Made in ${state.name}`.length <= 60
        ? `Startups & Tools Made in ${state.name}`
        : `Made in ${state.name}`,
    metaDescription: `Software and startups built by makers in ${state.name}, launched on Bharat Hunt. ${RANKING_NOTE}`,
    intro: `Products whose makers told us they are building from ${state.name}. The location is confirmed by the maker at launch, never inferred from an address or an IP — so this is where a team says it works, not where a server happens to sit.`,
    filter: { launchState: state.code },
    parent: { name: "Marketplace", path: "/marketplace" },
    related: [],
    kind: "state" as const,
  }));
}

/** Every collection this site can serve, generated once at module load. */
export const COLLECTIONS: readonly Collection[] = [
  ...topicCollections(),
  ...pricingCategoryCollections(),
  ...stateCollections(),
];

const BY_SLUG = new Map(COLLECTIONS.map((collection) => [collection.slug, collection]));

/**
 * Neighbouring state pages, filled in after the list is built.
 *
 * Which states have enough products is a database question, not a static one, so
 * the links here are simply the next few states in the list; the page itself
 * drops any that fall under the threshold before rendering them.
 */
{
  const states = COLLECTIONS.filter((collection) => collection.kind === "state");
  states.forEach((collection, index) => {
    collection.related = [...states.slice(index + 1), ...states.slice(0, index)]
      .slice(0, 6)
      .map((other) => other.slug);
  });
}

export function collectionBySlug(slug: string): Collection | undefined {
  return BY_SLUG.get(slug);
}

/** Collections whose parent is a given category page, for cross-linking down. */
export function collectionsForCategory(category: string): Collection[] {
  return COLLECTIONS.filter((collection) => collection.filter.category === category);
}

/** Collections a product belongs to, for cross-linking up from a product page. */
export function collectionsForProduct(product: {
  category: string;
  pricing_type: string;
  tags?: string[] | null;
  launch_state?: string | null;
}): Collection[] {
  const tags = (product.tags ?? []).map((tag) => tag.toLowerCase());
  return COLLECTIONS.filter((collection) => {
    const { category, pricing, tag, launchState } = collection.filter;
    if (tag) return tags.includes(tag);
    if (launchState) return Boolean(product.launch_state) && launchState === product.launch_state;
    return category === product.category && pricing === product.pricing_type;
  });
}
