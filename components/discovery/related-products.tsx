import Link from "next/link";
import { ChevronUp } from "lucide-react";

import { ProductLogo } from "@/components/products/product-logo";
import { Numeric } from "@/components/ui/typography";
import type { Difference } from "@/lib/intelligence/differences";

export type RelatedRow = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  hero_image_url: string | null;
  upvote_count: number | null;
  /** One line on why it is here, built only from what both listings say. */
  reason?: string | null;
  differences?: Difference[];
};

/**
 * A compact list of related products — used for "Alternatives to X" and
 * "Similar products" on the product page. Rows, not cards: these are
 * secondary, and a page of them must stay scannable on a phone.
 *
 * Difference chips carry their basis as a tooltip and in screen-reader text,
 * so every claim on the page says where it came from.
 */
export function RelatedProductList({ rows }: { rows: RelatedRow[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row) => (
        <li key={row.id}>
          <Link
            href={`/products/${row.slug}`}
            className="flex items-start gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30"
          >
            <ProductLogo src={row.hero_image_url} name={row.name} size="sm" />
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="block truncate font-semibold text-ink">{row.name}</span>
              <span className="line-clamp-1 block text-sm text-body">{row.tagline}</span>
              {row.reason && <span className="line-clamp-1 block text-xs text-muted">{row.reason}</span>}
              {row.differences && row.differences.length > 0 && (
                <span className="mt-0.5 flex flex-wrap gap-1.5">
                  {row.differences.map((difference) => (
                    <span
                      key={difference.key}
                      title={difference.basis}
                      className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                    >
                      {difference.label}
                      <span className="sr-only"> ({difference.basis})</span>
                    </span>
                  ))}
                </span>
              )}
            </span>
            <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-ink">
              <ChevronUp className="size-4 text-primary" aria-hidden="true" />
              <Numeric>{row.upvote_count ?? 0}</Numeric>
              <span className="sr-only">upvotes</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
