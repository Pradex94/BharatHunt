import Link from "next/link";
import { ChevronUp, Flame } from "lucide-react";

import { Numeric } from "@/components/ui/typography";
import { FadeIn, FadeInStagger, FadeInItem } from "@/components/ui/motion";
import { ProductLogo } from "@/components/products/product-logo";
import type { ProductCardProduct } from "@/components/products/product-card";

/** A product with its position on the board being rendered. */
export type RankedProduct = ProductCardProduct & { rank: number };

export type TopProductsProps = {
  /**
   * Cards in board order, each carrying its own rank. The rank travels with the
   * product rather than being counted from a starting offset because the caller
   * drops whichever product the hero is already showing, and that can be any
   * position — a card labelled "#4" has to mean the fourth most upvoted launch,
   * not the fourth card that survived the filter.
   */
  products: RankedProduct[];
  heading?: string;
};

export function TopProducts({ products, heading = "Most upvoted" }: TopProductsProps) {
  if (products.length === 0) return null;

  return (
    <section className="mx-auto w-full max-w-[1400px] px-4 py-14 sm:px-6 md:py-20 lg:px-8">
      <FadeIn className="mb-8 flex items-center justify-between gap-4">
        <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          <Flame className="size-6 text-primary" aria-hidden="true" />
          {heading}
        </h2>
        <Link
          href="/marketplace"
          className="shrink-0 text-sm font-semibold text-primary transition-colors hover:text-primary-active"
        >
          View all launches &rarr;
        </Link>
      </FadeIn>

      <FadeInStagger className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
        {products.map((product) => (
          <FadeInItem key={product.id}>
            <Link
              href={`/products/${product.slug}`}
              className="group flex h-full flex-col gap-3 rounded-3xl border border-border bg-card p-5 shadow-sm transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-hover"
            >
              <span className="w-fit rounded-full bg-secondary-bg px-2.5 py-1 text-xs font-bold text-body">
                #{product.rank}
              </span>
              <ProductLogo
                src={product.hero_image_url}
                name={product.name}
                size="sm"
                className="shadow-sm"
              />
              <div className="flex flex-1 flex-col gap-1">
                <h3 className="font-bold tracking-tight break-words text-ink transition-colors group-hover:text-primary">
                  {product.name}
                </h3>
                <p className="line-clamp-2 text-sm leading-snug text-body">{product.tagline}</p>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2 border-t border-border pt-3">
                <span className="truncate rounded-full bg-secondary-bg px-2.5 py-0.5 text-xs font-medium text-body">
                  {product.category}
                </span>
                <span className="flex shrink-0 items-center gap-1 text-sm font-bold text-ink">
                  <ChevronUp className="size-4 text-primary" aria-hidden="true" />
                  <Numeric>{product.upvote_count ?? 0}</Numeric>
                  <span className="sr-only">upvotes</span>
                </span>
              </div>
            </Link>
          </FadeInItem>
        ))}
      </FadeInStagger>
    </section>
  );
}
