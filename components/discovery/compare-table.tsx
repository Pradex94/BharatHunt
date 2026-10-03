import Link from "next/link";
import { ExternalLink, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { withReferral } from "@/lib/seo";
import { compareHref } from "@/lib/compare-links";
import { buildCompareRows, PROVENANCE_LABEL } from "@/lib/intelligence/compare";
import type { Provenance } from "@/lib/intelligence/knowledge";
import { ProductLogo } from "@/components/products/product-logo";
import { TrackedExternalLink } from "@/components/discovery/signals";
import type { IntelProductWithKnowledge } from "@/services/intelligence";

/*
 * Told apart by shape as well as tone — the palette is orange and neutrals
 * only, and "verified" and "derived" must not read as the same mark.
 */
const PROVENANCE_DOT: Record<Provenance, string> = {
  maker: "bg-ink/60",
  verified: "bg-primary",
  derived: "border border-primary bg-transparent",
  community: "bg-muted/60",
};

/**
 * The side-by-side table — shared by the /compare tool and the curated
 * /compare/a-vs-b pages so both render one truth. No verdict row; every cell
 * carries its provenance (lib/intelligence/compare.ts).
 */
export function CompareTable({
  products,
  removable = false,
}: {
  products: IntelProductWithKnowledge[];
  /** Show × links that drop a product from /compare?products=… */
  removable?: boolean;
}) {
  const rows = buildCompareRows(products);
  const slugs = products.map((product) => product.slug);

  return (
    <>
      {/* Horizontal scroll on phones; the attribute column stays pinned.
          `relative` is load-bearing: the sr-only provenance spans are
          absolutely positioned, and without a positioned ancestor here
          they escape the scroller and widen the whole page on a phone. */}
      <div className="relative -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[640px] border-separate border-spacing-0 text-left text-sm">
          <caption className="sr-only">Product comparison</caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 w-36 bg-background p-3 align-bottom text-xs font-medium text-muted">
                <span className="sr-only">Attribute</span>
              </th>
              {products.map((product) => (
                <th key={product.id} scope="col" className="min-w-44 border-b border-border p-3 align-top">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <ProductLogo src={product.hero_image_url} name={product.name} size="sm" />
                      {removable && (
                        <Link
                          href={compareHref(slugs.filter((slug) => slug !== product.slug))}
                          aria-label={`Remove ${product.name} from the comparison`}
                          className="flex size-7 items-center justify-center rounded text-muted hover:bg-secondary-bg hover:text-ink pointer-coarse:size-10"
                        >
                          <X className="size-4" aria-hidden="true" />
                        </Link>
                      )}
                    </div>
                    <Link href={`/products/${product.slug}`} className="font-semibold text-ink hover:text-primary">
                      {product.name}
                    </Link>
                    <span className="line-clamp-2 text-xs font-normal text-body">{product.tagline}</span>
                    {product.website_url && (
                      <TrackedExternalLink
                        productId={product.id}
                        surface="compare"
                        href={withReferral(product.website_url)}
                        target="_blank"
                        rel="noopener"
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        Visit website
                        <ExternalLink className="size-3" aria-hidden="true" />
                      </TrackedExternalLink>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 border-b border-border bg-background p-3 align-top text-xs font-semibold text-ink"
                >
                  {row.label}
                </th>
                {row.cells.map((cell, index) => (
                  <td key={`${row.key}-${products[index].id}`} className="border-b border-border p-3 align-top">
                    <span className={cn("flex items-start gap-2", cell.empty ? "text-muted" : "text-body")}>
                      {cell.provenance && (
                        <span
                          className={cn("mt-1.5 size-2 shrink-0 rounded-full", PROVENANCE_DOT[cell.provenance])}
                          title={PROVENANCE_LABEL[cell.provenance]}
                          aria-hidden="true"
                        />
                      )}
                      <span>
                        {cell.text}
                        {cell.provenance && <span className="sr-only"> ({PROVENANCE_LABEL[cell.provenance]})</span>}
                      </span>
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted" aria-label="Where each value comes from">
        {(Object.keys(PROVENANCE_LABEL) as Provenance[]).map((key) => (
          <li key={key} className="flex items-center gap-1.5">
            <span className={cn("size-2 rounded-full", PROVENANCE_DOT[key])} aria-hidden="true" />
            {PROVENANCE_LABEL[key]}
          </li>
        ))}
      </ul>
    </>
  );
}

/** Links to curated comparison pages — the internal links that make them crawlable. */
export function ComparisonLinks({
  pairs,
  className,
}: {
  pairs: { slug: string; path: string; a: { name: string }; b: { name: string } }[];
  className?: string;
}) {
  if (pairs.length === 0) return null;
  return (
    <ul className={cn("flex flex-wrap gap-2", className)}>
      {pairs.map((pair) => (
        <li key={pair.slug}>
          <Link
            href={pair.path}
            className="inline-flex rounded-full border border-border bg-card px-3.5 py-1.5 text-sm text-body transition-colors hover:border-primary hover:text-primary"
          >
            {pair.a.name} vs {pair.b.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}
