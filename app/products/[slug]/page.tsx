/* Design system: design.md (Claude.com editorial) · Long Document
 * Single-column reading flow; primary action row kept visible near the top.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Briefcase, ChevronUp, ExternalLink, MapPin, Map as RoadmapIcon, ScrollText } from "lucide-react";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { getIsAdmin } from "@/lib/admin";
import { getCompetingProducts, getPublishedProductBySlug } from "@/services/products";
import { UpvoteButton } from "@/components/products/upvote-button";
import { CommentForm } from "@/components/products/comment-form";
import { CommentItem, type CommentItemData } from "@/components/products/comment-item";
import { DeleteProductButton } from "@/components/products/delete-product-button";
import { ProductGallery } from "@/components/products/product-gallery";
import { ProductLogo } from "@/components/products/product-logo";
import { ProductReach } from "@/components/products/product-reach";
import { ProductVideo } from "@/components/products/product-video";
import { OfferBox } from "@/components/products/offer-box";
import { JsonLd } from "@/components/seo/json-ld";
import { PRODUCT_PLATFORMS, SITE_URL, slugForCategory } from "@/lib/constants";
import { isIndexableProduct, productBreadcrumbs, productSchema, withReferral } from "@/lib/seo";
import { indiaStateName } from "@/lib/india-states";
import { H1, H2, Numeric } from "@/components/ui/typography";
import { FadeIn } from "@/components/ui/motion";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Pick the best available image for social cards (wide screenshot > icon). */
function ogImageFor(product: {
  screenshot_urls: string[] | null;
  hero_image_url: string | null;
}): string | null {
  const screenshot = Array.isArray(product.screenshot_urls) ? product.screenshot_urls[0] : null;
  return screenshot || product.hero_image_url || null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getPublishedProductBySlug(slug);

  if (!product) {
    return { title: "Product not found" };
  }

  const title = seoTitle(product.name, product.tagline);
  const description = seoDescription(product);
  const canonical = `/products/${product.slug}`;

  // Thin listings are kept out of the index rather than diluting the site with
  // near-empty pages. They stay publicly reachable and `follow`, so their links
  // still pass equity and they get indexed automatically once filled in.
  const indexable = isIndexableProduct(product);

  // og:image / twitter:image are supplied by the dynamic route
  // app/products/[slug]/opengraph-image.tsx (branded card with the live
  // upvote count), so we don't set `images` here.
  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    ...(indexable ? {} : { robots: { index: false, follow: true } }),
    openGraph: {
      title: `${product.name} — ${product.tagline}`,
      description,
      url: canonical,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${product.name} — ${product.tagline}`,
      description,
    },
  };
}

/**
 * Search-result title, built to a real budget.
 *
 * Returned as `absolute` so the layout's " · Bharat Hunt" template doesn't
 * push it past the ~60 characters Google renders — the earlier version forgot
 * the template and then dropped the tagline entirely whenever the combination
 * overflowed, which threw away every keyword. This trims the tagline at a word
 * boundary instead, and omits it only when too little room is left to say
 * anything useful.
 */
const TITLE_LIMIT = 60;
const TITLE_SUFFIX = " | Bharat Hunt";

function seoTitle(name: string, tagline: string): string {
  const clean = tagline.replace(/\s+/g, " ").trim().replace(/[.\s]+$/, "");
  const room = TITLE_LIMIT - TITLE_SUFFIX.length - name.length - 3; // 3 = " — "

  if (!clean || room < 15) return `${name}${TITLE_SUFFIX}`;
  if (clean.length <= room) return `${name} — ${clean}${TITLE_SUFFIX}`;

  const cut = clean.slice(0, room);
  const lastSpace = cut.lastIndexOf(" ");
  const trimmed = (lastSpace > room * 0.5 ? cut.slice(0, lastSpace) : cut).trimEnd();
  return `${name} — ${dropDanglingWord(trimmed)}${TITLE_SUFFIX}`;
}

/**
 * Truncating mid-phrase leaves titles ending on "and" or "with", which reads
 * like the page is broken. Drop trailing connectives and punctuation.
 */
const DANGLING = new Set([
  "and", "or", "with", "for", "to", "the", "a", "an", "in", "on", "of", "your",
  "that", "from", "by", "at", "is", "are", "&",
]);

function dropDanglingWord(value: string): string {
  let out = value.replace(/[\s,;:\-–—&]+$/, "");
  for (;;) {
    const match = /\s+([^\s]+)$/.exec(out);
    if (!match || !DANGLING.has(match[1].toLowerCase())) break;
    out = out.slice(0, match.index).replace(/[\s,;:\-–—&]+$/, "");
  }
  return out;
}

/** Meta description from the fullest text the listing has, capped for SERPs. */
function seoDescription(product: {
  name: string;
  tagline: string;
  description: string | null;
  category: string;
}): string {
  const body = (product.description || product.tagline).replace(/\s+/g, " ").trim();
  const suffix = ` ${product.category} on Bharat Hunt.`;
  const room = 158 - suffix.length;
  const head = body.length <= room ? body : `${body.slice(0, room - 1).trimEnd()}…`;
  return `${head}${suffix}`;
}

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

  // Shared (React-cached) with generateMetadata — one DB round-trip per request.
  const product = await getPublishedProductBySlug(slug);
  if (!product) {
    notFound();
  }

  // Only set once the maker has shared a location — never inferred at read time.
  const launchStateName = indiaStateName(product.launch_state);

  // Owners manage their own product; admins can moderate any product.
  const isOwner = userId === product.creator_id;
  const canManage = isOwner || (userId ? await getIsAdmin() : false);

  const [{ data: comments }, { data: upvote }, competitors] = await Promise.all([
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
    getCompetingProducts(product.category, product.id, 4),
  ]);

  await supabase.rpc("increment_view_count", { target_product_id: product.id });

  // Absolute URL for share links + the embeddable badge.
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? new URL(SITE_URL).host;
  const proto =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  const productUrl = `${proto}://${host}/products/${product.slug}`;

  // Phase 2 launch fields
  const platformLinks = (product.platform_links as Record<string, string> | null) ?? {};
  const availableOn: { label: string; url: string }[] = [];
  for (const platform of PRODUCT_PLATFORMS) {
    const url = platformLinks[platform.key];
    if (url) availableOn.push({ label: platform.label, url });
  }
  const techStack = product.tech_stack ?? [];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-12 md:py-16">
      <JsonLd
        data={[
          productSchema({
            name: product.name,
            description: product.description,
            tagline: product.tagline,
            slug: product.slug,
            category: product.category,
            pricingType: product.pricing_type,
            image: ogImageFor(product),
          }),
          productBreadcrumbs({
            name: product.name,
            slug: product.slug,
            category: product.category,
          }),
        ]}
      />
      <FadeIn className="flex flex-col gap-6">
        <div className="flex gap-4 sm:gap-5">
          <ProductLogo src={product.hero_image_url} name={product.name} size="lg" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex items-start justify-between gap-3">
              <H1 className="text-2xl break-words sm:text-4xl">{product.name}</H1>
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
              {launchStateName && (
                <span className="flex items-center gap-1">
                  <MapPin className="size-3.5" aria-hidden="true" />
                  {launchStateName}
                </span>
              )}
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
          {product.cta_url && (
            // Primary conversion CTA (gradient) — the maker's own call-to-action.
            <a
              href={withReferral(product.cta_url)}
              target="_blank"
              rel="noopener"
              className={buttonVariants({ size: "sm" })}
            >
              {product.cta_text || "Get it"}
              <ExternalLink aria-hidden="true" />
            </a>
          )}
          {product.website_url && (
            // Dofollow (no `nofollow`) so the maker earns a real backlink, and
            // no `noreferrer` so their analytics see us. `?ref=bharathunt` names
            // us explicitly — browsers strip or coarsen the Referer header often
            // enough that referral traffic otherwise lands under "direct".
            <a
              href={withReferral(product.website_url)}
              target="_blank"
              rel="noopener"
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
          {canManage && (
            <div className="ml-auto flex items-center gap-3">
              {!isOwner && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  Admin
                </span>
              )}
              <Link
                href={`/products/${product.slug}/edit`}
                className="text-sm text-primary underline-offset-4 transition-colors duration-200 hover:underline"
              >
                Edit
              </Link>
              <DeleteProductButton productId={product.id} productName={product.name} />
            </div>
          )}
        </div>

        <OfferBox
          code={product.coupon_code}
          description={product.offer_description}
          expiresAt={product.offer_expires_at}
        />

        <ProductVideo url={product.video_url} />

        <ProductGallery images={(product.screenshot_urls as string[] | null) ?? []} />

        {product.description && (
          <p className="max-w-[65ch] text-base leading-[1.65] break-words whitespace-pre-wrap text-body">
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

        {techStack.length > 0 && (
          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-ink">Built with</h2>
            <div className="flex flex-wrap gap-2">
              {techStack.map((tech) => (
                <span
                  key={tech}
                  className="rounded-md border border-border px-2 py-0.5 text-xs font-medium text-muted"
                >
                  {tech}
                </span>
              ))}
            </div>
          </div>
        )}

        {availableOn.length > 0 && (
          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-ink">Available on</h2>
            <div className="flex flex-wrap gap-2">
              {availableOn.map((platform) => (
                <a
                  key={platform.label}
                  href={platform.url}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-ink transition-colors duration-150 hover:border-primary/40 hover:text-primary"
                >
                  {platform.label}
                  <ExternalLink className="size-3" aria-hidden="true" />
                </a>
              ))}
            </div>
          </div>
        )}

        {(product.roadmap_url || product.changelog_url) && (
          <div className="flex flex-wrap items-center gap-4 text-sm">
            {product.roadmap_url && (
              <a
                href={product.roadmap_url}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-1.5 text-primary underline-offset-4 hover:underline"
              >
                <RoadmapIcon className="size-4" aria-hidden="true" /> Roadmap
              </a>
            )}
            {product.changelog_url && (
              <a
                href={product.changelog_url}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-1.5 text-primary underline-offset-4 hover:underline"
              >
                <ScrollText className="size-4" aria-hidden="true" /> Changelog
              </a>
            )}
          </div>
        )}

        {product.available_for_hire && (
          <div className="flex items-start gap-3 rounded-xl border border-border bg-secondary-bg/50 p-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Briefcase className="size-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink">Available for services</p>
              <p className="text-sm text-body">
                {product.hire_pitch ||
                  `${product.creator?.display_name ?? "This maker"} is available for consulting and custom work.`}
              </p>
            </div>
          </div>
        )}
      </FadeIn>

      <ProductReach
        productUrl={productUrl}
        name={product.name}
        tagline={product.tagline}
        websiteUrl={product.website_url}
        isOwner={userId === product.creator_id}
      />

      {competitors.length > 0 && (
        <section
          aria-labelledby="alternatives"
          className="flex flex-col gap-4 border-t border-border pt-8"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <H2 id="alternatives" className="text-2xl sm:text-2xl">
              {product.name} alternatives
            </H2>
            <Link
              href={`/categories/${slugForCategory(product.category) ?? ""}`}
              className="text-sm font-semibold text-primary transition-colors hover:text-primary-active"
            >
              All {product.category} &rarr;
            </Link>
          </div>
          <p className="text-sm text-body">
            Other {product.category.toLowerCase()} products on Bharat Hunt, most upvoted first.
          </p>
          <ul className="flex flex-col gap-3">
            {competitors.map((competitor) => (
              <li key={competitor.id}>
                <Link
                  href={`/products/${competitor.slug}`}
                  className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30"
                >
                  <ProductLogo
                    src={competitor.hero_image_url}
                    name={competitor.name}
                    size="sm"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-ink">
                      {competitor.name}
                    </span>
                    <span className="mt-0.5 line-clamp-1 block text-sm text-body">
                      {competitor.tagline}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-ink">
                    <ChevronUp className="size-4 text-primary" aria-hidden="true" />
                    <Numeric>{competitor.upvote_count ?? 0}</Numeric>
                    <span className="sr-only">upvotes</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div id="comments" className="flex scroll-mt-24 flex-col gap-4 border-t border-border pt-8">
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
