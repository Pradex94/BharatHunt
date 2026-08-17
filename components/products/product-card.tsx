import Link from "next/link";
import { Code2, Globe, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { absoluteUrl } from "@/lib/seo";
import { UpvoteButton } from "@/components/products/upvote-button";
import { ShareMenu } from "@/components/products/share-menu";
import { ProductLogo } from "@/components/products/product-logo";
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
  tags: string[] | null;
  website_url: string | null;
  github_url: string | null;
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
  const productPath = `/products/${product.slug}`;
  const platforms = [
    product.website_url ? { key: "web", label: "Web", Icon: Globe } : null,
    product.github_url ? { key: "code", label: "Code", Icon: Code2 } : null,
  ].filter((p): p is { key: string; label: string; Icon: typeof Globe } => p !== null);
  const tags = (product.tags ?? []).filter(Boolean).slice(0, 3);
  const makerInitial = product.creator?.display_name?.slice(0, 1).toUpperCase() ?? "?";

  return (
    <article
      className={cn(
        "group flex gap-4 rounded-xl border border-border bg-card p-4 sm:p-5",
        cardInteractiveClassName,
      )}
    >
      {/* Upvote pillar (left) */}
      <UpvoteButton
        productId={product.id}
        initialCount={product.upvote_count ?? 0}
        initialUpvoted={isUpvoted}
        isLoggedIn={isLoggedIn}
        variant="boxed"
        className="self-start"
      />

      {/* Logo — see components/products/product-logo.tsx for why it's a circle
          on white with this much padding. */}
      <Link href={productPath} className="self-start">
        <ProductLogo
          src={product.hero_image_url}
          name={product.name}
          size="md"
          loading="lazy"
        />
      </Link>

      {/* Content stack */}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            {/* The clip lives on the heading, not the link: `truncate` needs a
                block box, and on the inline <a> it let long names overrun the
                card on narrow screens. */}
            <HeadingTag className="min-w-0 truncate font-sans text-base font-semibold tracking-normal text-ink">
              <Link
                href={productPath}
                className="transition-colors duration-200 group-hover:text-primary"
              >
                {product.name}
              </Link>
            </HeadingTag>
            <span className="shrink-0 rounded-full bg-secondary-bg px-2 py-0.5 text-xs font-medium whitespace-nowrap text-muted">
              {product.category}
            </span>
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
                PRICING_BADGE[product.pricing_type] ?? "bg-muted text-muted",
              )}
            >
              {PRICING_LABEL[product.pricing_type] ?? product.pricing_type}
            </span>
          </div>
        </div>

        <p className="line-clamp-1 text-sm text-body">{product.tagline}</p>

        {/* Platforms + tech pills */}
        {(platforms.length > 0 || tags.length > 0) && (
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
            {platforms.map(({ key, label, Icon }) => (
              <span
                key={key}
                className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[11px] font-medium text-muted"
              >
                <Icon className="size-3" aria-hidden="true" />
                {label}
              </span>
            ))}
            {tags.map((tag) => (
              <span key={tag} className="rounded-md bg-secondary-bg px-1.5 py-0.5 text-[11px] text-muted">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Footer: maker · comments · share */}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted">
          {product.creator && (
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <span className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                {makerInitial}
              </span>
              {product.creator.display_name}
            </span>
          )}
          <Link
            href={`${productPath}#comments`}
            className="flex items-center gap-1 whitespace-nowrap transition-colors duration-150 hover:text-primary"
          >
            <MessageSquare className="size-3.5" aria-hidden="true" />
            <Numeric>{product.comment_count ?? 0}</Numeric> comments
          </Link>
          <div className="ml-auto">
            <ShareMenu
              url={absoluteUrl(productPath)}
              name={product.name}
              tagline={product.tagline}
            />
          </div>
        </div>
      </div>
    </article>
  );
}
