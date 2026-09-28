import Link from "next/link";
import { ArrowRight, ChevronUp, MapPin } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatDayMonth } from "@/lib/format-date";
import { indiaStateName } from "@/lib/india-states";
import { ProductLogo } from "@/components/products/product-logo";
import { Numeric } from "@/components/ui/typography";

/** Everything a homepage launch card reads. `PoolLaunch` satisfies it. */
export type LaunchCardProduct = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  category: string;
  upvote_count: number | null;
  hero_image_url: string | null;
  creator: { display_name: string; username: string } | null;
  published_at?: string | null;
  launch_state?: string | null;
};

/**
 * The homepage's product card — compact, scannable, one link.
 *
 * Deliberately not `ProductCard`. That one is the marketplace row: an upvote
 * button, a share menu and a comments link, each a client island with its own
 * auth state. On the homepage those are nine hydrated widgets per section doing
 * what the product page does better, so here the whole card is a single anchor
 * to the detail page and the vote count is a fact, not a control.
 *
 * Plain component (no "use client"), so the server sections and the client
 * "Load more" list render the identical markup.
 */
export function LaunchCard({
  product,
  headingLevel: Heading = "h3",
  className,
}: {
  product: LaunchCardProduct;
  headingLevel?: "h2" | "h3";
  className?: string;
}) {
  const state = indiaStateName(product.launch_state);
  const launched = formatDayMonth(product.published_at);

  return (
    <Link
      href={`/products/${product.slug}`}
      className={cn(
        "group flex h-full flex-col gap-4 rounded-3xl border border-border bg-card p-5 shadow-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-hover",
        className,
      )}
    >
      <div className="flex items-start gap-3.5">
        <ProductLogo src={product.hero_image_url} name={product.name} size="sm" loading="lazy" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Heading className="truncate font-sans text-base font-bold tracking-tight text-ink transition-colors group-hover:text-primary">
            {product.name}
          </Heading>
          <p className="line-clamp-2 text-sm leading-snug text-body">{product.tagline}</p>
        </div>
        <span className="flex shrink-0 flex-col items-center rounded-xl border border-border px-2 py-1 text-ink">
          <ChevronUp className="size-4 text-primary" aria-hidden="true" />
          <Numeric className="text-sm font-bold">{product.upvote_count ?? 0}</Numeric>
          <span className="sr-only">upvotes</span>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-secondary-bg px-2.5 py-0.5 text-xs font-medium text-body">
          {product.category}
        </span>
        {state && (
          <span className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-0.5 text-xs text-muted">
            <MapPin className="size-3" aria-hidden="true" />
            {state}
          </span>
        )}
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-3 text-xs text-muted">
        <span className="min-w-0 truncate">
          {product.creator?.display_name ? <>by {product.creator.display_name}</> : null}
          {product.creator?.display_name && launched ? " · " : null}
          {launched ? <time dateTime={product.published_at ?? undefined}>{launched}</time> : null}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-primary">
          View
          <ArrowRight
            className="size-3.5 transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </span>
      </div>
    </Link>
  );
}

/** Same footprint as `LaunchCard`, so a loading grid does not shift when it fills. */
export function LaunchCardSkeleton() {
  return (
    <div className="flex h-full flex-col gap-4 rounded-3xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start gap-3.5">
        <div className="size-12 shrink-0 animate-pulse rounded-full bg-secondary-bg" />
        <div className="flex flex-1 flex-col gap-2 pt-1">
          <div className="h-4 w-2/5 animate-pulse rounded bg-secondary-bg" />
          <div className="h-3.5 w-full animate-pulse rounded bg-secondary-bg" />
          <div className="h-3.5 w-3/4 animate-pulse rounded bg-secondary-bg" />
        </div>
        <div className="h-12 w-9 animate-pulse rounded-xl bg-secondary-bg" />
      </div>
      <div className="h-5 w-24 animate-pulse rounded-full bg-secondary-bg" />
      <div className="mt-auto h-4 w-full animate-pulse rounded border-t border-border bg-secondary-bg/60 pt-3" />
    </div>
  );
}
