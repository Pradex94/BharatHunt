/* Design system: design.md (Claude.com editorial)
 * Categories index — real taxonomy, live per-category counts, editorial grid.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Display, Lead, Numeric } from "@/components/ui/typography";
import { FadeIn, FadeInStagger, FadeInItem } from "@/components/ui/motion";
import { CATEGORIES } from "@/lib/constants";
import { getCategoryCounts } from "@/services/products";

// Fetches auth-scoped data via the Clerk-token Supabase client (uses headers),
// so it must render dynamically, not be statically prerendered at build.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Categories",
  alternates: { canonical: "/categories" },
  description:
    "Browse every category on Bharat Hunt — developer tools, productivity, finance, design, and more, each filtered to real listings.",
};

export default async function CategoriesPage() {
  const counts = await getCategoryCounts();

  return (
    <Section className="py-16 md:py-24">
      <Container className="flex flex-col gap-12">
        <FadeIn className="flex max-w-2xl flex-col gap-4">
          <Display className="text-balance">Browse by category</Display>
          <Lead>
            Ten corners of the catalogue, from the tools that ship your code to the
            ones that keep your books. Every category filters to live listings.
          </Lead>
        </FadeIn>

        <FadeInStagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.map(({ name, slug, icon: Icon, blurb }) => {
            const count = counts[name] ?? 0;
            return (
              <FadeInItem key={slug}>
                <Link
                  href={`/categories/${slug}`}
                  className="group flex h-full flex-col gap-4 rounded-lg border border-border bg-card p-6 outline-none transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-hover focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <div className="flex items-center justify-between">
                    <span className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <span className="text-xs text-muted">
                      <Numeric>{count}</Numeric> {count === 1 ? "product" : "products"}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col gap-1.5">
                    <h2 className="font-sans text-lg font-semibold tracking-normal text-ink">
                      {name}
                    </h2>
                    <p className="text-sm leading-relaxed text-body">{blurb}</p>
                  </div>
                  <span className="flex items-center gap-1 text-sm font-medium text-primary">
                    Explore
                    <ArrowRight
                      className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </span>
                </Link>
              </FadeInItem>
            );
          })}
        </FadeInStagger>
      </Container>
    </Section>
  );
}
