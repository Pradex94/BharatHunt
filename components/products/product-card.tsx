import Link from "next/link";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { UpvoteButton } from "@/components/products/upvote-button";
import { Numeric } from "@/components/ui/typography";
import { cardInteractiveClassName } from "@/components/ui/card";

const PRICING_LABEL: Record<string, string> = {
  free: "Free",
  freemium: "Freemium",
  paid: "Paid",
};

// Pricing badges stay in the orange/neutral family — no green, no blue.
const PRICING_BADGE: Record<string, string> = {
  paid: "bg-primary/10 text-primary",
  free: "bg-secondary-bg text-muted",
  freemium: "bg-amber-100 text-amber-700",
};

export type ProductCardProduct = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  category: string;
  pricing_type: string;
  avg_rating?: number | null;
  upvote_count: number | null;
  comment_count: number | null;
  hero_image_url: string | null;
  creator: { display_name: string; username: string } | null;
};

export function ProductCard({
  product,
  isUpvoted,
  isLoggedIn,
  headingLevel: HeadingTag = "h2",
}: {
  product: ProductCardProduct;
  isUpvoted: boolean;
  isLoggedIn: boolean;
  headingLevel?: "h2" | "h3";
}) {
  return (
    <article
      className={cn(
        "group flex gap-4 rounded-lg border border-border bg-card p-5",
        cardInteractiveClassName,
      )}
    >
      <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-cream-strong text-lg font-semibold text-muted">
        {product.hero_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.hero_image_url}
            alt=""
            className="size-full object-cover"
          />
        ) : (
          product.name.slice(0, 1).toUpperCase()
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <HeadingTag className="truncate font-sans text-base font-semibold tracking-normal text-ink">
            <Link
              href={`/products/${product.slug}`}
              className="transition-colors duration-200 group-hover:text-primary"
            >
              {product.name}
            </Link>
          </HeadingTag>
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
              PRICING_BADGE[product.pricing_type] ?? "bg-muted text-muted",
            )}
          >
            {PRICING_LABEL[product.pricing_type] ?? product.pricing_type}
          </span>
        </div>
        <p className="truncate text-sm text-body">{product.tagline}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs text-muted">
          <span className="rounded-full bg-secondary-bg px-2 py-0.5 font-medium whitespace-nowrap">
            {product.category}
          </span>
          {product.creator && <span className="whitespace-nowrap">by {product.creator.display_name}</span>}
          {typeof product.avg_rating === "number" && (
            <span className="flex items-center gap-1 whitespace-nowrap">
              <Star className="size-3.5 fill-accent-amber text-accent-amber" />
              <Numeric>{product.avg_rating.toFixed(1)}</Numeric>
            </span>
          )}
          <span className="whitespace-nowrap">
            <Numeric>{product.comment_count ?? 0}</Numeric> comments
          </span>
        </div>
      </div>

      <UpvoteButton
        productId={product.id}
        initialCount={product.upvote_count ?? 0}
        initialUpvoted={isUpvoted}
        isLoggedIn={isLoggedIn}
        variant="boxed"
        className="self-center"
      />
    </article>
  );
}
