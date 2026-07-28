/* Design system: design.md (Claude.com editorial) · Long Document
 * Single-column reading flow; primary action row kept visible near the top.
 */

import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { UpvoteButton } from "@/components/products/upvote-button";
import { CommentForm } from "@/components/products/comment-form";
import { CommentItem, type CommentItemData } from "@/components/products/comment-item";
import { DeleteProductButton } from "@/components/products/delete-product-button";
import { ProductGallery } from "@/components/products/product-gallery";
import { ProductReach } from "@/components/products/product-reach";
import { H1, H2, Numeric } from "@/components/ui/typography";
import { FadeIn } from "@/components/ui/motion";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { userId } = await auth();
  const supabase = createClient();

  const { data: product, error } = await supabase
    .from("products")
    .select(
      "id, slug, creator_id, name, tagline, description, hero_image_url, screenshot_urls, website_url, github_url, category, pricing_type, tags, view_count, upvote_count, comment_count, creator:profiles!products_creator_id_fkey(display_name, username)",
    )
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load product: ${error.message}`);
  }
  if (!product) {
    notFound();
  }

  const [{ data: comments }, { data: upvote }] = await Promise.all([
    supabase
      .from("comments")
      .select("id, body, created_at, author:profiles!comments_user_id_fkey(display_name, username)")
      .eq("product_id", product.id)
      .order("created_at", { ascending: true }),
    userId
      ? supabase
          .from("upvotes")
          .select("product_id")
          .eq("product_id", product.id)
          .eq("user_id", userId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  await supabase.rpc("increment_view_count", { target_product_id: product.id });

  // Absolute URL for share links + the embeddable badge.
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "bharat-hunt.vercel.app";
  const proto =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  const productUrl = `${proto}://${host}/products/${product.slug}`;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-12 md:py-16">
      <FadeIn className="flex flex-col gap-6">
        <div className="flex gap-5">
          <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-cream-strong text-2xl font-semibold text-muted">
            {product.hero_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.hero_image_url} alt="" className="size-full object-cover" />
            ) : (
              product.name.slice(0, 1).toUpperCase()
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex items-start justify-between gap-3">
              <H1 className="text-3xl sm:text-4xl">{product.name}</H1>
              <span
                className={cn(
                  "mt-1 shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium",
                  PRICING_BADGE[product.pricing_type] ?? "bg-muted text-muted",
                )}
              >
                {PRICING_LABEL[product.pricing_type] ?? product.pricing_type}
              </span>
            </div>
            <p className="text-base text-body">{product.tagline}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className="rounded-full bg-secondary-bg px-2 py-0.5">{product.category}</span>
              {product.creator && <span>by {product.creator.display_name}</span>}
              <span>
                <Numeric>{product.view_count ?? 0}</Numeric> views
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <UpvoteButton
            productId={product.id}
            initialCount={product.upvote_count ?? 0}
            initialUpvoted={Boolean(upvote)}
            isLoggedIn={Boolean(userId)}
          />
          {product.website_url && (
            <a
              href={product.website_url}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Visit website
              <ExternalLink aria-hidden="true" />
            </a>
          )}
          {product.github_url && (
            <a
              href={product.github_url}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              GitHub
              <ExternalLink aria-hidden="true" />
            </a>
          )}
          {userId === product.creator_id && (
            <div className="ml-auto flex items-center gap-3">
              <Link
                href={`/products/${product.slug}/edit`}
                className="text-sm text-primary underline-offset-4 transition-colors duration-200 hover:underline"
              >
                Edit
              </Link>
              <DeleteProductButton productId={product.id} />
            </div>
          )}
        </div>

        <ProductGallery images={(product.screenshot_urls as string[] | null) ?? []} />

        {product.description && (
          <p className="max-w-[65ch] text-base leading-[1.65] whitespace-pre-wrap text-body">
            {product.description}
          </p>
        )}

        {product.tags && product.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {product.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-secondary-bg px-2.5 py-0.5 text-xs text-muted"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </FadeIn>

      <ProductReach
        productUrl={productUrl}
        name={product.name}
        isOwner={userId === product.creator_id}
      />

      <div className="flex flex-col gap-4 border-t border-border pt-8">
        <H2 className="text-2xl sm:text-2xl">
          Comments (<Numeric>{product.comment_count ?? 0}</Numeric>)
        </H2>
        {userId ? (
          <CommentForm productId={product.id} productSlug={product.slug} />
        ) : (
          <p className="text-sm text-muted">
            <Link
              href="/login"
              className="text-primary underline-offset-4 transition-colors duration-200 hover:underline"
            >
              Log in
            </Link>{" "}
            to leave a comment.
          </p>
        )}
        <div className="flex flex-col gap-2">
          {comments && comments.length > 0 ? (
            comments.map((comment) => (
              <CommentItem key={comment.id} comment={comment as CommentItemData} />
            ))
          ) : (
            <p className="text-sm text-muted">No comments yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
