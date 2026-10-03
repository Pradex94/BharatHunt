/* Design system: design.md (Claude.com editorial) · Long Document
 * Single-column reading flow; primary action row kept visible near the top.
 */

import type { Metadata } from "next";
import { CURATOR_PROFILE_ID } from "@/lib/daily-agent/config";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import {
  Briefcase,
  ExternalLink,
  MapPin,
  Map as RoadmapIcon,
  ScrollText,
} from "lucide-react";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { getIsAdmin } from "@/lib/admin";
import { getCompetingProducts, getPublishedProductBySlug } from "@/services/products";
import { getSimilarProducts } from "@/services/intelligence";
import { getComparePairsFor } from "@/services/compare-pairs";
import { ComparisonLinks } from "@/components/discovery/compare-table";
import { deriveKnowledge } from "@/lib/intelligence/knowledge";
import { splitRelated } from "@/lib/intelligence/related";
import { compareHref } from "@/lib/compare-links";
import { SaveButton } from "@/components/discovery/save-button";
import { CompareButton } from "@/components/discovery/compare-button";
import { RelatedProductList } from "@/components/discovery/related-products";
import { AddToListButton } from "@/components/discovery/add-to-list";
import { ProductViewBeacon, TrackedExternalLink } from "@/components/discovery/signals";
import { UpvoteButton } from "@/components/products/upvote-button";
import { CommentForm } from "@/components/products/comment-form";
import { CommentItem, type CommentItemData } from "@/components/products/comment-item";
import { DeleteProductButton } from "@/components/products/delete-product-button";
import { ProductGallery } from "@/components/products/product-gallery";
import { ProductLogo } from "@/components/products/product-logo";
import { ProductReach } from "@/components/products/product-reach";
import { LaunchAgentOwnerCta } from "@/components/launch-agent/owner-cta";
import { ProductVideo } from "@/components/products/product-video";
import { OfferBox } from "@/components/products/offer-box";
import { JsonLd } from "@/components/seo/json-ld";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { collectionsForProduct } from "@/lib/collections";
import { RatingStars } from "@/components/products/rating-stars";
import { PRODUCT_PLATFORMS, SITE_URL, slugForCategory } from "@/lib/constants";
import { isIndexableProduct, productCrumbs, productSchema, withReferral } from "@/lib/seo";
import { indiaStateName } from "@/lib/india-states";
import { H1, H2, Numeric } from "@/components/ui/typography";
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
  const clean = tagline
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.\s]+$/, "");
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
  "and",
  "or",
  "with",
  "for",
  "to",
  "the",
  "a",
  "an",
  "in",
  "on",
  "of",
  "your",
  "that",
  "from",
  "by",
  "at",
  "is",
  "are",
  "&",
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

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
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
  // A Daily 5 pick is owned by the system curator profile (lib/daily-agent/config.ts).
  const curated = product.creator_id === CURATOR_PROFILE_ID;
  const isAdmin = userId ? await getIsAdmin() : false;
  const canManage = isOwner || isAdmin;

  const [{ data: comments }, { data: upvote }, { data: myRating }, competitors, similarProducts, comparisons] = await Promise.all(
    [
      supabase
        .from("comments")
        .select(
          "id, body, created_at, user_id, author:profiles!comments_user_id_fkey(display_name, username)",
        )
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
      // The caller's own star, joined into the same parallel group rather than
      // fetched after it — one more round trip, not one more waterfall.
      userId
        ? supabase
            .from("product_ratings")
            .select("rating")
            .eq("product_id", product.id)
            .eq("user_id", userId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      // Over-fetched so "More from this category" still has something left
      // after the alternatives and similar products take their share.
      getCompetingProducts(product.category, product.id, 8),
      // Precomputed by the background indexer — a read, never a computation.
      // `null` until this product has been indexed; the sections below fall
      // back to same-category products in that case.
      getSimilarProducts(product.id, 12),
      // Curated "A vs B" pages that include this product (cached list).
      getComparePairsFor(product.id, 4),
    ],
  );

  const baseForComparison = {
    ...product,
    tags: product.tags ?? [],
    source: curated ? "daily_agent" : "maker",
    platform_links: (product.platform_links as Record<string, string> | null) ?? null,
  };
  const { alternatives, similar } = similarProducts
    ? splitRelated(
        { ...baseForComparison, knowledge: deriveKnowledge(baseForComparison) },
        similarProducts,
      )
    : { alternatives: [], similar: [] };
  const shownIds = new Set([...alternatives, ...similar].map((entry) => entry.product.id));
  // Before indexing (or with nothing similar enough), the category list is the
  // alternatives section, exactly as the page worked before.
  const fallbackAlternatives = alternatives.length === 0 ? competitors.slice(0, 4) : [];
  for (const competitor of fallbackAlternatives) shownIds.add(competitor.id);
  const moreFromCategory = competitors.filter((competitor) => !shownIds.has(competitor.id)).slice(0, 4);
  const compareWith = alternatives.slice(0, 2).map((entry) => entry.product);
  // Prefer a curated comparison page over the working tool when one exists.
  const compareLink = comparisons[0]?.path ?? compareHref([product.slug, ...compareWith.map((other) => other.slug)]);

  // Views are counted by the browser beacon (<ProductViewBeacon />) through
  // /api/signals — once per visitor per hour, bots filtered — not on render.

  /*
   * Absolute URL for share links + the embeddable badge. Both leave the site —
   * a badge lives on the maker's own page, a share link in someone's feed — so
   * they name the canonical origin rather than whichever host answered this
   * request. Built from the request before, which meant a page served on the
   * .vercel.app deployment URL minted badges pointing there. Only a dev server,
   * which SITE_URL cannot describe, still uses the request's own host.
   */
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "";
  const isLocal = host.startsWith("localhost") || host.startsWith("127.");
  const productUrl = `${isLocal ? `http://${host}` : SITE_URL}/products/${product.slug}`;

  // Phase 2 launch fields
  const productCollections = collectionsForProduct(product);

  const platformLinks = (product.platform_links as Record<string, string> | null) ?? {};
  const availableOn: { label: string; url: string }[] = [];
  for (const platform of PRODUCT_PLATFORMS) {
    const url = platformLinks[platform.key];
    if (url) availableOn.push({ label: platform.label, url });
  }
  const techStack = product.tech_stack ?? [];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-12 md:py-16">
      <ProductViewBeacon productId={product.id} />
      <JsonLd
        data={productSchema({
          name: product.name,
          description: product.description,
          tagline: product.tagline,
          slug: product.slug,
          category: product.category,
          pricingType: product.pricing_type,
          image: ogImageFor(product),
          // Emitted only above the threshold in lib/seo.ts, and never from
          // upvotes — an upvote is not a rating.
          avgRating: product.avg_rating,
          ratingCount: product.rating_count,
        })}
      />
      {/* Renders the trail and its BreadcrumbList from one array, so the markup
          can never describe a hierarchy the page does not show. */}
      <Breadcrumbs
        items={productCrumbs({
          name: product.name,
          slug: product.slug,
          category: product.category,
        })}
        className="mb-6"
      />
      {/* Not faded in. This block is the entire launch — logo, name, tagline,
          CTA, description, gallery — so wrapping it in <FadeIn> put the whole
          above-the-fold page behind `opacity:0` until framer-motion hydrated.
          See the note in components/ui/motion.tsx. */}
      <div className="flex flex-col gap-6">
        <div className="flex gap-4 sm:gap-5">
          <ProductLogo src={product.hero_image_url} name={product.name} size="lg" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex items-start justify-between gap-3">
              <H1 className="text-2xl break-words sm:text-4xl">{product.name}</H1>
              <span
                className={cn(
                  "mt-1 shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium",
                  PRICING_BADGE[product.pricing_type] ?? "bg-secondary-bg text-muted",
                )}
              >
                {PRICING_LABEL[product.pricing_type] ?? product.pricing_type}
              </span>
            </div>
            <p className="text-base text-body">{product.tagline}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className="rounded-full bg-secondary-bg px-2 py-0.5">{product.category}</span>
              {curated ? (
                <Link href="/daily-5" className="font-medium text-primary hover:underline">
                  Discovered by BharatHunt Daily 5
                </Link>
              ) : (
                product.creator && <span>by {product.creator.display_name}</span>
              )}
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
            {curated && (
              <p className="mt-2 text-xs text-muted">
                BharatHunt found and verified this product; its makers did not submit it. Built it?{" "}
                <a href={`mailto:info@bharathunt.org?subject=${encodeURIComponent(`Claim ${product.name} on BharatHunt`)}`} className="text-primary underline-offset-2 hover:underline">
                  Claim this listing
                </a>
                .
              </p>
            )}
          </div>
        </div>

        {/*
         * Ratings sit above the actions, not beside the upvote: they answer a
         * different question. An upvote says "this deserves attention today";
         * a rating says "this was good to use". Only the second can back an
         * aggregateRating, which is why they are not the same control.
         */}
        <RatingStars
          productId={product.id}
          productSlug={product.slug}
          average={product.avg_rating}
          count={product.rating_count ?? 0}
          myRating={myRating?.rating ?? null}
          canRate={Boolean(userId) && !isOwner}
        />

        <div className="flex flex-wrap items-center gap-3">
          <UpvoteButton
            productId={product.id}
            initialCount={product.upvote_count ?? 0}
            initialUpvoted={Boolean(upvote)}
            isLoggedIn={Boolean(userId)}
          />
          <SaveButton productId={product.id} productName={product.name} variant="labeled" />
          <CompareButton
            variant="labeled"
            item={{
              id: product.id,
              slug: product.slug,
              name: product.name,
              logo: product.hero_image_url,
            }}
          />
          <AddToListButton productId={product.id} productName={product.name} />
          {product.cta_url && (
            // Primary conversion CTA (gradient) — the maker's own call-to-action.
            <TrackedExternalLink
              productId={product.id}
              surface="product-cta"
              href={withReferral(product.cta_url)}
              target="_blank"
              rel="noopener"
              className={buttonVariants({ size: "sm" })}
            >
              {product.cta_text || "Get it"}
              <ExternalLink aria-hidden="true" />
            </TrackedExternalLink>
          )}
          {product.website_url && (
            // Dofollow (no `nofollow`) so the maker earns a real backlink, and
            // no `noreferrer` so their analytics see us. `?ref=bharathunt` names
            // us explicitly — browsers strip or coarsen the Referer header often
            // enough that referral traffic otherwise lands under "direct".
            <TrackedExternalLink
              productId={product.id}
              surface="product"
              href={withReferral(product.website_url)}
              target="_blank"
              rel="noopener"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Visit website
              <ExternalLink aria-hidden="true" />
            </TrackedExternalLink>
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
      </div>

      {/* Owner-only: the page is published by construction, so the campaign exists or is one click away. */}
      {isOwner && <LaunchAgentOwnerCta slug={product.slug} />}

      <ProductReach
        productUrl={productUrl}
        name={product.name}
        tagline={product.tagline}
        websiteUrl={product.website_url}
        isOwner={userId === product.creator_id}
      />

      {/*
       * Up into the collections this product belongs to. Computed from the
       * product's own category, pricing and tags rather than queried, so it
       * adds no database work to a page that already makes several round
       * trips — and it is what stops collection pages being reachable only
       * from the sitemap.
       */}
      {productCollections.length > 0 && (
        <nav
          aria-label="Collections featuring this product"
          className="flex flex-col gap-3 border-t border-border pt-8"
        >
          <h2 className="text-sm font-semibold text-ink">Featured in</h2>
          <div className="flex flex-wrap gap-2">
            {productCollections.map((collection) => (
              <Link
                key={collection.slug}
                href={`/collections/${collection.slug}`}
                className="rounded-full border border-border bg-card px-3.5 py-1.5 text-sm text-body transition-colors hover:border-primary hover:text-primary"
              >
                {collection.title}
              </Link>
            ))}
          </div>
        </nav>
      )}

      {/*
       * Alternatives, similar products and the rest of the category. The first
       * two come from the background indexer (lib/intelligence/reindex.ts) —
       * matched on what each listing says it does, never on popularity — and
       * every difference chip is computed from fields both listings carry.
       */}
      {(alternatives.length > 0 || fallbackAlternatives.length > 0) && (
        <section
          aria-labelledby="alternatives"
          className="flex flex-col gap-4 border-t border-border pt-8"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <H2 id="alternatives" className="text-2xl sm:text-2xl">
              Alternatives to {product.name}
            </H2>
            {(compareWith.length > 0 || comparisons.length > 0) && (
              <Link
                href={compareLink}
                className="text-sm font-semibold text-primary transition-colors hover:text-primary-active"
              >
                Compare side by side &rarr;
              </Link>
            )}
          </div>
          <p className="text-sm text-body">
            {alternatives.length > 0
              ? "Products whose listings describe the same job. Differences come from each listing's own pricing, links and description."
              : `Other ${product.category.toLowerCase()} products on Bharat Hunt, most upvoted first.`}
          </p>
          <RelatedProductList
            rows={
              alternatives.length > 0
                ? alternatives.map((entry) => ({
                    ...entry.product,
                    reason: entry.reason,
                    differences: entry.differences,
                  }))
                : fallbackAlternatives
            }
          />
        </section>
      )}

      {comparisons.length > 0 && (
        <nav aria-label={`Comparisons with ${product.name}`} className="flex flex-col gap-3 border-t border-border pt-8">
          <h2 className="text-sm font-semibold text-ink">Compare {product.name}</h2>
          <ComparisonLinks pairs={comparisons} />
        </nav>
      )}

      {similar.length > 0 && (
        <section aria-labelledby="similar" className="flex flex-col gap-4 border-t border-border pt-8">
          <H2 id="similar" className="text-2xl sm:text-2xl">
            Similar products
          </H2>
          <p className="text-sm text-body">
            Related work, often from other categories — matched on listing text, not on votes.
          </p>
          <RelatedProductList
            rows={similar.map((entry) => ({ ...entry.product, reason: entry.reason }))}
          />
        </section>
      )}

      {moreFromCategory.length > 0 && (
        <section aria-labelledby="more-in-category" className="flex flex-col gap-4 border-t border-border pt-8">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <H2 id="more-in-category" className="text-2xl sm:text-2xl">
              More in {product.category}
            </H2>
            <Link
              href={`/categories/${slugForCategory(product.category) ?? ""}`}
              className="text-sm font-semibold text-primary transition-colors hover:text-primary-active"
            >
              All {product.category} &rarr;
            </Link>
          </div>
          <RelatedProductList rows={moreFromCategory} />
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
              <CommentItem
                key={comment.id}
                comment={comment as CommentItemData}
                productId={product.id}
                productSlug={product.slug}
                /*
                 * Authors and admins, deliberately not the product's owner: a
                 * maker who can delete criticism of their own launch turns the
                 * comment thread into a testimonial page.
                 */
                canDelete={isAdmin || (userId != null && comment.user_id === userId)}
              />
            ))
          ) : (
            <p className="text-sm text-muted">No comments yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
