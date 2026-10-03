/* Design system: design.md · Product Intelligence — Product Match.
 * "Tell BharatHunt what you need": natural language in, ranked products with a
 * reason each, out. Rule-based matching over precomputed product knowledge.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { Radar } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Display, Lead } from "@/components/ui/typography";
import { buttonVariants } from "@/components/ui/button";
import { ProductCard } from "@/components/products/product-card";
import { MatchForm } from "@/components/discovery/match-form";
import { MatchResultCard } from "@/components/discovery/match-result-card";
import { ImpressionBeacon } from "@/components/discovery/signals";
import { describeRequest, MATCH_WEIGHTS } from "@/lib/intelligence/match";
import { checkRateLimitByIp } from "@/lib/rate-limit";
import { recordSearch } from "@/lib/search-analytics";
import { findMatches, normalizeMatchRequest, type MatchResponse } from "@/services/match";
import { getRecentlyDiscovered } from "@/services/intelligence";
import { getUpvotedProductIds } from "@/services/products";

type DiscoverSearchParams = Promise<{ q?: string; budget?: string; for?: string; category?: string }>;

/**
 * /discover itself is a real, indexable page. A query URL is a personal
 * result set — unbounded and a re-slice of the catalogue — so it is noindex
 * and canonicalises back here.
 */
export async function generateMetadata({ searchParams }: { searchParams: DiscoverSearchParams }): Promise<Metadata> {
  const { q } = await searchParams;
  return {
    title: q ? `Products for “${q.slice(0, 50)}”` : "Find the right product",
    description:
      "Describe what you need in your own words and BharatHunt matches it against what each Indian product says it does — with a reason for every result.",
    alternates: { canonical: "/discover" },
    ...(q ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title: "Find the right product · Bharat Hunt",
      description: "Tell BharatHunt what you need, and it finds the Indian products that fit.",
      url: "/discover",
    },
  };
}

const WEIGHT_LABELS: Record<keyof typeof MATCH_WEIGHTS, string> = {
  concept: "How strongly the listing describes what you asked for",
  text: "Words your request and the listing share",
  audience: "Whether the listing names who you are",
  budget: "Free, free plan or paid, against your budget",
  engagement: "Community votes and comments (capped)",
  freshness: "Launched in the last 30 days",
};

export default async function DiscoverPage({ searchParams }: { searchParams: DiscoverSearchParams }) {
  const params = await searchParams;
  const request = normalizeMatchRequest(params);

  let response: MatchResponse | null = null;
  let limited = false;
  if (request.query) {
    const limit = await checkRateLimitByIp("productMatch");
    if (limit.ok) {
      response = await findMatches(request);
      const count = response.results.length;
      after(() => recordSearch(request.query, count, "match"));
    } else {
      limited = true;
    }
  }

  const [{ userId }, recent] = await Promise.all([auth(), getRecentlyDiscovered(6)]);
  const upvoted = await getUpvotedProductIds(userId, recent.map((product) => product.id));
  const readAs = response ? describeRequest(response.parsed) : null;
  const results = response?.results ?? [];

  return (
    <Container className="flex max-w-3xl flex-col gap-8 py-10 md:py-14">
      <div className="flex flex-col gap-3">
        <Display className="text-3xl sm:text-5xl">Find the right product</Display>
        <Lead className="max-w-2xl">
          Describe what you need in your own words. BharatHunt matches it against what each Indian product says it
          does, and tells you why each one fits.
        </Lead>
      </div>

      <MatchForm
        initial={{
          q: request.query,
          budget: request.budget,
          audience: request.audience ?? "",
          category: request.category ?? "",
        }}
      />

      {limited && (
        <p role="status" className="rounded-lg bg-secondary-bg px-4 py-3 text-sm text-body">
          You&apos;ve searched a lot in the last minute. Give it a moment and try again.
        </p>
      )}

      {response && (
        <section aria-labelledby="match-results" className="flex flex-col gap-4">
          {results.length > 0 ? (
            <>
              <div className="flex flex-col gap-1">
                <h2 id="match-results" className="font-sans text-xl font-bold tracking-normal text-ink">
                  We found {results.length} {results.length === 1 ? "product" : "products"} for you
                </h2>
                {readAs && (
                  <p className="text-sm text-muted">
                    Read as: <span className="text-ink">{readAs}</span>
                    {response.parsed.budgetPreference && request.budget === "any" && ", preferring a free plan"}.
                  </p>
                )}
                {response.parsed.mentionedPrice && (
                  <p className="text-xs text-muted">
                    BharatHunt doesn&apos;t record monthly prices yet, so a price limit is read as &ldquo;prefer products
                    with a free plan&rdquo;. Check each product&apos;s own pricing.
                  </p>
                )}
              </div>
              <ImpressionBeacon
                productIds={results.slice(0, 6).map((result) => result.product.id)}
                event="match_impression"
                surface="match"
              />
              <div className="flex flex-col gap-3">
                {results.map((result) => (
                  <MatchResultCard key={result.product.id} result={result} />
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center">
              <h2 id="match-results" className="font-sans text-lg font-semibold tracking-normal text-ink">
                We couldn&apos;t find a strong match in BharatHunt yet.
              </h2>
              <p className="max-w-md text-sm text-body">
                Try describing the job in simpler words (&ldquo;invoicing&rdquo;, &ldquo;resume builder&rdquo;), drop a
                filter, or browse the marketplace. We&apos;d rather show nothing than pad this with products that
                don&apos;t fit.
              </p>
              <Link href="/marketplace" className={buttonVariants({ variant: "outline", size: "sm" })}>
                Browse the marketplace
              </Link>
            </div>
          )}

          <details className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-body">
            <summary className="cursor-pointer font-medium text-ink">How matching works</summary>
            <p className="mt-2">
              Matching reads each product&apos;s name, tagline, description and tags — the maker&apos;s own words, or
              facts BharatHunt verified for Daily 5 discoveries — and scores how well they answer your request. It is
              rule-based and runs on BharatHunt; no AI model writes the results, and no product can pay to appear.
            </p>
            <ul className="mt-2 flex flex-col gap-1">
              {(Object.keys(MATCH_WEIGHTS) as (keyof typeof MATCH_WEIGHTS)[]).map((key) => (
                <li key={key} className="flex justify-between gap-4">
                  <span>{WEIGHT_LABELS[key]}</span>
                  <span className="font-mono text-xs text-muted">{Math.round(MATCH_WEIGHTS[key] * 100)}%</span>
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}

      {recent.length > 0 && (
        <section aria-labelledby="recently-discovered" className="flex flex-col gap-3 border-t border-border pt-8">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="recently-discovered" className="flex items-center gap-2 font-sans text-lg font-semibold tracking-normal text-ink">
              <Radar className="size-4 text-primary" aria-hidden="true" />
              Recently discovered on BharatHunt
            </h2>
            <Link href="/daily-5" className="text-sm font-semibold text-primary hover:text-primary-active">
              Daily 5 &rarr;
            </Link>
          </div>
          <p className="text-sm text-muted">
            Indian products the Daily 5 agent found and verified. They take part in matching like every other launch.
          </p>
          <div className="flex flex-col gap-3">
            {recent.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                isUpvoted={upvoted.has(product.id)}
                isLoggedIn={Boolean(userId)}
                headingLevel="h3"
              />
            ))}
          </div>
        </section>
      )}
    </Container>
  );
}
