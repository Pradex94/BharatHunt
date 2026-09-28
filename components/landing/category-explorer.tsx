import Link from "next/link";
import { Layers, Sparkles, type LucideIcon } from "lucide-react";

import { CATEGORIES } from "@/lib/constants";
import { MIN_PRODUCTS_TO_INDEX, type Collection } from "@/lib/collections";
import { Numeric } from "@/components/ui/typography";
import { FadeIn } from "@/components/ui/motion";
import { SECTION_SHELL, SectionHeader } from "@/components/landing/section-header";

type Tile = { key: string; label: string; href: string; count: number; icon: LucideIcon };

/** The two cross-category topics a visitor thinks in, when they hold enough products. */
const TOPIC_TILES: { slug: string; label: string; icon: LucideIcon }[] = [
  { slug: "ai-tools", label: "AI", icon: Sparkles },
  { slug: "saas-products", label: "SaaS", icon: Layers },
];

/**
 * "Explore by Category" — the category taxonomy with live counts, then the
 * collection pages as a second row of links.
 *
 * Categories with no products are left out rather than shown as "0 products";
 * an empty tile is a dead end on the most-visited page of the site. The topic
 * tiles (AI, SaaS) are tag collections, not categories — products are filed
 * under one category but tagged freely — and appear only once their collection
 * is big enough to be indexed.
 *
 * The collection links below are not decoration. They are the body links from
 * the highest-authority page on the site into the generated collection pages —
 * what turns them from "discovered" into "crawled" (see the SEO memory on
 * crawlable pagination). Server-rendered anchors, no carousel, no hydration.
 */
export function CategoryExplorer({
  categoryCounts,
  collectionCounts,
  collections,
}: {
  categoryCounts: Record<string, number>;
  collectionCounts: Record<string, number>;
  collections: Collection[];
}) {
  const topics: Tile[] = TOPIC_TILES.filter(
    (topic) => (collectionCounts[topic.slug] ?? 0) >= MIN_PRODUCTS_TO_INDEX,
  ).map((topic) => ({
    key: topic.slug,
    label: topic.label,
    href: `/collections/${topic.slug}`,
    count: collectionCounts[topic.slug] ?? 0,
    icon: topic.icon,
  }));

  const categories: Tile[] = CATEGORIES.filter((category) => (categoryCounts[category.name] ?? 0) > 0)
    .map((category) => ({
      key: category.slug,
      label: category.name,
      href: `/categories/${category.slug}`,
      count: categoryCounts[category.name] ?? 0,
      icon: category.icon,
    }))
    // "Other" is last whatever its size — it is the least useful thing to browse.
    .sort((a, b) => Number(a.label === "Other") - Number(b.label === "Other") || b.count - a.count);

  const tiles = [...topics, ...categories];
  const topicSlugs = new Set(topics.map((topic) => topic.key));
  const rail = collections.filter((collection) => !topicSlugs.has(collection.slug));

  if (tiles.length === 0 && rail.length === 0) return null;

  return (
    <section className={`${SECTION_SHELL} py-12 md:py-16`}>
      <FadeIn>
        <SectionHeader
          eyebrow="Browse"
          title="Explore by Category"
          subtitle="Jump straight to the kind of product you’re looking for."
          action={{ label: "All categories", href: "/categories" }}
        />
      </FadeIn>

      {tiles.length > 0 && (
        <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {tiles.map((tile) => (
            <li key={tile.key}>
              <Link
                href={tile.href}
                className="group flex h-full items-center gap-3 rounded-2xl border border-border bg-card p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-hover"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-white">
                  <tile.icon className="size-5" aria-hidden="true" />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-semibold text-ink">{tile.label}</span>
                  <span className="text-xs text-muted">
                    <Numeric>{tile.count}</Numeric> {tile.count === 1 ? "product" : "products"}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {rail.length > 0 && (
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <span className="shrink-0 text-sm font-medium text-muted">Popular collections:</span>
          <ul className="flex flex-wrap gap-2">
            {rail.map((collection) => (
              <li key={collection.slug}>
                <Link
                  href={`/collections/${collection.slug}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm text-body transition-colors hover:border-primary/40 hover:text-primary"
                >
                  {collection.title}
                  <Numeric className="text-xs text-muted">{collectionCounts[collection.slug] ?? 0}</Numeric>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
