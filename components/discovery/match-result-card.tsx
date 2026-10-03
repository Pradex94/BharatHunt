import Link from "next/link";
import { ExternalLink, MapPin } from "lucide-react";

import { cn } from "@/lib/utils";
import { withReferral } from "@/lib/seo";
import { indiaStateName } from "@/lib/india-states";
import { ProductLogo } from "@/components/products/product-logo";
import { SaveButton } from "@/components/discovery/save-button";
import { CompareButton } from "@/components/discovery/compare-button";
import { SignalClickArea, TrackedExternalLink } from "@/components/discovery/signals";
import type { MatchLevel, MatchResult } from "@/lib/intelligence/match";
import type { MatchProduct } from "@/services/match";

const LEVEL: Record<MatchLevel, { label: string; className: string }> = {
  strong: { label: "Strong match", className: "bg-primary text-primary-foreground" },
  good: { label: "Good match", className: "bg-primary/10 text-primary" },
  possible: { label: "Possible match", className: "bg-secondary-bg text-muted" },
};

const PRICING: Record<string, string> = { free: "Free", freemium: "Freemium", paid: "Paid" };

/**
 * One Product Match result. The level is a band of a heuristic score, shown as
 * words with an explanation of what it means — never as a percentage. The
 * "why" line is labelled with where its words came from.
 */
export function MatchResultCard({ result }: { result: MatchResult<MatchProduct> }) {
  const { product } = result;
  const level = LEVEL[result.level];
  const state = indiaStateName(product.launch_state);
  const verified = product.knowledge.listingSource === "daily_agent";

  return (
    <SignalClickArea productId={product.id} event="match_click" surface="match">
      <article className="flex gap-3 rounded-xl border border-border bg-card p-4 sm:gap-4 sm:p-5">
        <Link href={`/products/${product.slug}`} className="self-start">
          <ProductLogo src={product.hero_image_url} name={product.name} size="md" className="size-12 sm:size-14" />
        </Link>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="min-w-0 truncate font-sans text-base font-semibold tracking-normal text-ink">
              <Link href={`/products/${product.slug}`} className="hover:text-primary">
                {product.name}
              </Link>
            </h3>
            <span
              className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold", level.className)}
              title="How closely this listing describes what you asked for — a guide, not a verdict."
            >
              {level.label}
            </span>
          </div>
          <p className="line-clamp-2 text-sm text-body">{product.tagline}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span>{product.category}</span>
            <span>{PRICING[product.pricing_type] ?? product.pricing_type}</span>
            {state && (
              <span className="flex items-center gap-1">
                <MapPin className="size-3" aria-hidden="true" />
                {state}
              </span>
            )}
          </div>

          <div className="rounded-lg bg-secondary-bg/60 px-3 py-2">
            <p className="text-sm text-ink">
              <span className="font-semibold">Why this matches: </span>
              {result.explanation}
            </p>
            <p className="mt-0.5 text-[11px] text-muted">
              {verified
                ? "Quoted from facts BharatHunt verified on the product's site."
                : "Quoted from the maker's own listing. Not AI-generated."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <SaveButton productId={product.id} productName={product.name} />
            <CompareButton item={{ id: product.id, slug: product.slug, name: product.name, logo: product.hero_image_url }} />
            {product.website_url && (
              <TrackedExternalLink
                productId={product.id}
                surface="match"
                href={withReferral(product.website_url)}
                target="_blank"
                rel="noopener"
                className="ml-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                Visit website
                <ExternalLink className="size-3" aria-hidden="true" />
              </TrackedExternalLink>
            )}
            <Link
              href={`/products/${product.slug}`}
              className="ml-auto text-xs font-semibold text-ink hover:text-primary"
            >
              Details &rarr;
            </Link>
          </div>
        </div>
      </article>
    </SignalClickArea>
  );
}
