import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { H2, Numeric } from "@/components/ui/typography";
import type { Collection } from "@/lib/collections";

/**
 * The homepage's links into the collection pages.
 *
 * Not decoration. The collections were reachable from the footer and the
 * sitemap, and neither carries much weight: a sitemap entry tells a crawler a
 * URL exists, a footer link is on every page and is discounted accordingly.
 * A link in the body of the highest-authority page on the site is the one that
 * actually passes something, and it is what turns thirty generated pages from
 * "discovered" into "crawled".
 *
 * Server-rendered, no client JavaScript: this is a list of anchors, and making
 * it a carousel would put the site's most valuable internal links behind
 * hydration.
 */
export function CollectionRail({
  collections,
  counts,
}: {
  collections: Collection[];
  counts: Record<string, number>;
}) {
  if (collections.length === 0) return null;

  return (
    <Section className="border-t border-border py-14 md:py-20">
      <Container className="flex flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-2">
            <H2>Browse by what you need</H2>
            <p className="max-w-2xl text-sm text-body">
              Slices of the catalogue that stand on their own — by price, by topic, and by where the
              makers are building from.
            </p>
          </div>
          <Link
            href="/collections"
            className="inline-flex items-center gap-1 text-sm font-semibold text-primary transition-colors hover:text-primary-active"
          >
            All collections <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>

        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {collections.map((collection) => (
            <li key={collection.slug}>
              <Link
                href={`/collections/${collection.slug}`}
                className="flex h-full flex-col justify-between gap-2 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary"
              >
                <span className="text-sm font-semibold text-ink">{collection.title}</span>
                <span className="text-xs text-muted">
                  <Numeric>{counts[collection.slug] ?? 0}</Numeric> products
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </Section>
  );
}
