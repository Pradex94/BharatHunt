import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { UpvoteButton } from "@/components/products/upvote-button";

const PRICING_LABEL: Record<string, string> = {
  free: "Free",
  freemium: "Freemium",
  paid: "Paid",
};

export type ProductCardProduct = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  category: string;
  pricing_type: string;
  upvote_count: number | null;
  comment_count: number | null;
  hero_image_url: string | null;
  creator: { display_name: string; username: string } | null;
};

export function ProductCard({
  product,
  isUpvoted,
  isLoggedIn,
}: {
  product: ProductCardProduct;
  isUpvoted: boolean;
  isLoggedIn: boolean;
}) {
  return (
    <article className="flex gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted text-lg font-semibold text-muted-foreground">
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
          <h2 className="truncate text-base font-semibold text-foreground">
            <Link href={`/products/${product.slug}`} className="hover:underline">
              {product.name}
            </Link>
          </h2>
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
              product.pricing_type === "paid"
                ? "bg-accent/10 text-accent"
                : "bg-success/10 text-success",
            )}
          >
            {PRICING_LABEL[product.pricing_type] ?? product.pricing_type}
          </span>
        </div>
        <p className="truncate text-sm text-muted-foreground">{product.tagline}</p>
        <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="rounded-full bg-muted px-2 py-0.5">{product.category}</span>
          {product.creator && <span>by {product.creator.display_name}</span>}
          <span className="ml-auto flex items-center gap-1">
            <UpvoteButton
              productId={product.id}
              initialCount={product.upvote_count ?? 0}
              initialUpvoted={isUpvoted}
              isLoggedIn={isLoggedIn}
            />
          </span>
          <span className="flex items-center gap-1">
            <MessageCircle className="size-3.5" />
            {product.comment_count ?? 0}
          </span>
        </div>
      </div>
    </article>
  );
}
