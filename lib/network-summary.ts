/**
 * The homepage's intelligence network: six nodes, each a real destination with
 * a real number, built from reads the homepage already makes.
 *
 * Where every value comes from (all cached server reads, resolved when the
 * prerendered homepage is (re)validated — at most every 10 minutes — and
 * shipped inside its HTML, so the browser never asks for them):
 *
 *   AI              `ai_news_freshness()` → stories_24h: published AI stories
 *                   covered in the last 24 hours (services/ai-news.ts). Falls
 *                   back to the `ai` tag collection count when that is zero.
 *   Developer Tools `products.category` counts (getCategoryCounts)
 *   Fintech         the "Finance" category count
 *   Productivity    the "Productivity" category count
 *   SaaS            the `saas` tag collection count (getCollectionCounts)
 *   Startups        `funding_search` total — published rounds (getFundingFeed)
 *
 * That is deliberately not a `/api/home/network-summary` endpoint. The numbers
 * are already aggregated on the server and inlined into static HTML; an API
 * would add a client request, a loading state and a moment of empty chips to
 * show values the page already has.
 *
 * Routes come from the existing definitions (`slugForCategory`, the collection
 * slugs, /ai, /funding), never retyped.
 *
 * Pure: relative imports only, so tests/network-summary.test.ts runs it
 * without a database.
 */

import { slugForCategory } from "./constants.ts";

export type NetworkNodeKey = "ai" | "dev" | "fintech" | "startups" | "productivity" | "saas";

export type NetworkNode = {
  key: NetworkNodeKey;
  label: string;
  href: string;
  /** The count, or null when there is no true number to show. */
  value: number | null;
  /** Second line of the chip: "16 products". Null when `value` is. */
  meta: string | null;
  /** Sentence for the rotating status line: "16 developer tools listed". */
  ticker: string | null;
};

export type NetworkInputs = {
  categoryCounts: Record<string, number>;
  collectionCounts: Record<string, number>;
  aiStories24h: number;
  fundingRounds: number;
  totalProducts: number;
};

function plural(value: number, one: string, many: string): string {
  return `${value.toLocaleString("en-IN")} ${value === 1 ? one : many}`;
}

function positive(value: number | undefined | null): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function categoryHref(name: string, fallback = "/categories"): string {
  const slug = slugForCategory(name);
  return slug ? `/categories/${slug}` : fallback;
}

/**
 * The six nodes, in orbit order (clockwise from the top).
 *
 * A node whose number is missing keeps its link and loses its count — the
 * destination still exists; only the claim is dropped. SaaS is the exception:
 * a collection page 404s with no products behind it, so without any the slot
 * becomes "All products" rather than a dead link.
 */
export function buildNetworkNodes(input: NetworkInputs): NetworkNode[] {
  const ai24h = positive(input.aiStories24h);
  const aiTools = positive(input.collectionCounts["ai-tools"]);
  const dev = positive(input.categoryCounts["Developer Tools"]);
  const fin = positive(input.categoryCounts["Finance"]);
  const prod = positive(input.categoryCounts["Productivity"]);
  const saas = positive(input.collectionCounts["saas-products"]);
  const rounds = positive(input.fundingRounds);
  const all = positive(input.totalProducts);

  return [
    {
      key: "ai",
      label: "AI",
      href: "/ai",
      value: ai24h ?? aiTools,
      // "in 24h", not "today": the figure is a rolling 24-hour window.
      meta: ai24h
        ? plural(ai24h, "story in 24h", "stories in 24h")
        : aiTools
          ? plural(aiTools, "AI product", "AI products")
          : null,
      ticker: ai24h
        ? `${plural(ai24h, "AI story", "AI stories")} covered in the last 24 hours`
        : aiTools
          ? `${plural(aiTools, "AI product", "AI products")} launched`
          : null,
    },
    {
      key: "dev",
      label: "Developer Tools",
      href: categoryHref("Developer Tools"),
      value: dev,
      meta: dev ? plural(dev, "product", "products") : null,
      ticker: dev ? `${plural(dev, "developer tool", "developer tools")} listed` : null,
    },
    {
      key: "fintech",
      label: "Fintech",
      href: categoryHref("Finance"),
      value: fin,
      meta: fin ? plural(fin, "product", "products") : null,
      ticker: fin ? `${plural(fin, "fintech product", "fintech products")} listed` : null,
    },
    {
      key: "startups",
      label: "Startups",
      href: "/funding",
      value: rounds,
      meta: rounds ? plural(rounds, "round tracked", "rounds tracked") : null,
      ticker: rounds ? `${plural(rounds, "funding round", "funding rounds")} tracked` : null,
    },
    {
      key: "productivity",
      label: "Productivity",
      href: categoryHref("Productivity"),
      value: prod,
      meta: prod ? plural(prod, "product", "products") : null,
      ticker: prod ? `${plural(prod, "productivity tool", "productivity tools")} listed` : null,
    },
    saas
      ? {
          key: "saas",
          label: "SaaS",
          href: "/collections/saas-products",
          value: saas,
          meta: plural(saas, "product", "products"),
          ticker: `${plural(saas, "SaaS product", "SaaS products")} listed`,
        }
      : {
          key: "saas",
          label: "All products",
          href: "/marketplace",
          value: all,
          meta: all ? plural(all, "product", "products") : null,
          ticker: all ? `${plural(all, "product", "products")} on Bharat Hunt` : null,
        },
  ];
}
