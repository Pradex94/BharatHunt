import Link from "next/link";
import { ArrowUpRight, Building2, MapPin } from "lucide-react";

import { ProductLogo } from "@/components/products/product-logo";
import { Breadcrumbs, type Crumb } from "@/components/seo/breadcrumbs";
import { JsonLd } from "@/components/seo/json-ld";
import { Container } from "@/components/ui/container";
import { indiaStateName } from "@/lib/india-states";
import { absoluteUrl, itemListSchema, withReferral } from "@/lib/seo";
import { ShareMenu } from "@/components/products/share-menu";
import { SaveButton } from "@/components/discovery/save-button";
import { CompareButton } from "@/components/discovery/compare-button";
import { TrackedExternalLink } from "@/components/discovery/signals";
import type { Daily5Day } from "@/services/daily-agent";

/**
 * One day of BharatHunt Daily 5: the products the agent found and an admin
 * approved, in the agent's rank order, each linking to its BharatHunt launch
 * page and its own website.
 *
 * The copy under each product is the listing's own (drawn from its website and
 * verified facts) — no generated SEO filler. The page only exists for a day
 * that has published products; an empty day is a 404, never a thin page.
 */

/** "2026-10-02" → "2 October 2026", read as a calendar date (no timezone shift). */
export function formatDailyDate(date: string): string {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

export function dailyHeading(count: number): string {
  return `${count} Indian product${count === 1 ? "" : "s"} worth discovering`;
}

export function Daily5View({
  day,
  dates,
  path,
  crumbs,
}: {
  day: Daily5Day;
  dates: string[];
  path: string;
  crumbs: Crumb[];
}) {
  const heading = dailyHeading(day.products.length);
  const pretty = formatDailyDate(day.date);
  const archive = dates.filter((date) => date !== day.date).slice(0, 14);

  return (
    <main className="min-h-dvh bg-background pb-16 pt-8 md:pt-12">
      <JsonLd data={itemListSchema(day.products.map(({ name, slug }) => ({ name, slug })), { name: `${heading} — ${pretty}`, path })} />
      <Container>
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
          <Breadcrumbs items={crumbs} className="text-sm" />

          <header className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold uppercase tracking-wide text-primary">BharatHunt Daily 5 · {pretty}</p>
              <ShareMenu url={absoluteUrl(path)} name={`BharatHunt Daily 5 · ${pretty}`} tagline={heading} />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-ink md:text-5xl">{heading}</h1>
            <p className="max-w-2xl text-base text-body">
              Every day BharatHunt looks for products built by Indian teams, checks the India connection on each
              product&apos;s own website, and an editor approves the picks. Built one of these? Write to us and we will hand
              the listing over to you.
            </p>
          </header>

          <ol className="grid grid-cols-1 gap-4">
            {day.products.map((product) => {
              const place = product.city ?? indiaStateName(product.launch_state);
              return (
                <li key={product.id} className="rounded-3xl border border-border bg-card p-5 shadow-soft transition hover:-translate-y-0.5 hover:shadow-hover md:p-6">
                  <div className="flex items-start gap-4">
                    <span className="mt-1 w-6 shrink-0 font-mono text-lg font-bold tabular-nums text-primary">{product.rank}</span>
                    <ProductLogo src={product.hero_image_url} name={product.name} size="md" loading="lazy" />
                    <div className="min-w-0 flex-1">
                      <h2 className="text-xl font-bold text-ink">
                        <Link href={`/products/${product.slug}`} className="hover:text-primary">
                          {product.name}
                        </Link>
                      </h2>
                      <p className="mt-1 text-body">{product.tagline}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
                        <span className="rounded-full bg-secondary-bg px-2.5 py-0.5 text-xs font-semibold text-body-strong">{product.category}</span>
                        {place && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="size-3.5" aria-hidden="true" /> {place}
                          </span>
                        )}
                        {product.companyName && (
                          <span className="inline-flex min-w-0 items-center gap-1">
                            <Building2 className="size-3.5 shrink-0" aria-hidden="true" /> <span className="truncate">{product.companyName}</span>
                          </span>
                        )}
                        <span className="capitalize">{product.pricing_type}</span>
                      </div>
                      {product.whyInteresting && <p className="mt-3 text-sm text-body">{product.whyInteresting}</p>}
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Link
                          href={`/products/${product.slug}`}
                          className="btn-gradient inline-flex min-h-10 items-center rounded-md px-4 text-sm font-semibold text-white"
                        >
                          View on BharatHunt
                        </Link>
                        {product.website_url && (
                          <TrackedExternalLink
                            productId={product.id}
                            surface="daily5"
                            href={withReferral(product.website_url)}
                            target="_blank"
                            rel="noopener"
                            className="inline-flex min-h-10 items-center gap-1 rounded-md border border-border bg-card px-4 text-sm font-semibold text-ink hover:bg-secondary-bg"
                          >
                            Visit website <ArrowUpRight className="size-4" aria-hidden="true" />
                          </TrackedExternalLink>
                        )}
                        <span className="ml-auto flex items-center gap-0.5">
                          <SaveButton productId={product.id} productName={product.name} />
                          <CompareButton
                            item={{ id: product.id, slug: product.slug, name: product.name, logo: product.hero_image_url }}
                          />
                        </span>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>

          {/* Daily 5 picks are ordinary launches: they take part in matching. */}
          <Link
            href="/discover"
            className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/40 sm:flex-row sm:items-center sm:justify-between"
          >
            <span>
              <span className="block text-base font-bold text-ink">Looking for something specific?</span>
              <span className="text-sm text-body">Describe what you need and Product Match searches every launch, these included.</span>
            </span>
            <span className="text-sm font-semibold text-primary">Find the right product &rarr;</span>
          </Link>

          {archive.length > 0 && (
            <nav aria-label="Earlier Daily 5 lists" className="rounded-2xl bg-secondary-bg p-5">
              <h2 className="text-base font-bold text-ink">Earlier lists</h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {archive.map((date) => (
                  <li key={date}>
                    <Link href={`/daily-5/${date}`} className="inline-flex min-h-9 items-center rounded-full border border-border bg-card px-3 text-sm text-ink hover:border-primary/30">
                      {formatDailyDate(date)}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </div>
      </Container>
    </main>
  );
}
