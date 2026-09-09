import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Info } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Numeric } from "@/components/ui/typography";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { JsonLd } from "@/components/seo/json-ld";
import { FUNDING_GUIDES, getFundingGuide } from "@/lib/funding/guides";
import { absoluteUrl, breadcrumbSchema } from "@/lib/seo";
import { SITE_NAME, SITE_URL } from "@/lib/constants";

/**
 * One guide.
 *
 * `Article` structured data is emitted here and *not* on the funding cards, and
 * the difference is authorship: this is writing we produced, so we are the
 * publisher and the markup is a true statement. A round's card links out to
 * someone else's reporting, where the same markup would be a claim on their
 * work.
 *
 * Fully static: the content is a TypeScript array, so `generateStaticParams`
 * prerenders all ten at build time and none of them touches the database.
 */

type PageProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return FUNDING_GUIDES.map((guide) => ({ slug: guide.slug }));
}

/** Nothing outside the array is a guide, so an unknown slug 404s rather than rendering. */
export const dynamicParams = false;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const guide = getFundingGuide(slug);
  if (!guide) return { title: "Guide not found", robots: { index: false, follow: true } };

  return {
    title: guide.title,
    description: guide.excerpt,
    alternates: { canonical: `/funding/guides/${guide.slug}` },
    openGraph: {
      title: `${guide.title} — ${SITE_NAME}`,
      description: guide.excerpt,
      url: absoluteUrl(`/funding/guides/${guide.slug}`),
      siteName: SITE_NAME,
      type: "article",
    },
    twitter: { card: "summary", title: guide.title, description: guide.excerpt },
  };
}

export default async function FundingGuidePage({ params }: PageProps) {
  const { slug } = await params;
  const guide = getFundingGuide(slug);
  if (!guide) notFound();

  const index = FUNDING_GUIDES.findIndex((entry) => entry.slug === guide.slug);
  const next = FUNDING_GUIDES[index + 1];
  const previous = FUNDING_GUIDES[index - 1];

  const crumbs = [
    { name: "Home", path: "/" },
    { name: "Funding", path: "/funding" },
    { name: "Guides", path: "/funding/guides" },
    { name: guide.title, path: `/funding/guides/${guide.slug}` },
  ];

  return (
    <main className="min-h-dvh bg-background">
      <JsonLd
        data={[
          breadcrumbSchema(crumbs),
          {
            "@context": "https://schema.org",
            "@type": "Article",
            headline: guide.title,
            description: guide.excerpt,
            url: absoluteUrl(`/funding/guides/${guide.slug}`),
            author: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
            publisher: {
              "@type": "Organization",
              name: SITE_NAME,
              url: SITE_URL,
              logo: absoluteUrl("/icon"),
            },
            mainEntityOfPage: absoluteUrl(`/funding/guides/${guide.slug}`),
          },
        ]}
      />

      <Container className="flex max-w-3xl flex-col gap-8 py-10 md:py-14">
        <Breadcrumbs items={crumbs} />

        <header className="flex flex-col gap-3">
          <span className="text-[11px] font-medium tracking-[0.12em] text-muted uppercase">
            Step {String(guide.step).padStart(2, "0")} · Fundraising guide
          </span>
          <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">{guide.title}</h1>
          <p className="text-lg leading-relaxed text-body">{guide.excerpt}</p>
          <span className="text-xs text-muted">
            <Numeric>{guide.readingMinutes}</Numeric> min read
          </span>
        </header>

        {/* Long-measure prose, matching the blog's treatment of the same
            content type. */}
        <div className="flex flex-col gap-5">
          {guide.body.map((block, blockIndex) => {
            switch (block.type) {
              case "heading":
                return (
                  <h2
                    key={blockIndex}
                    className="mt-3 text-xl font-bold tracking-tight text-ink sm:text-2xl"
                  >
                    {block.text}
                  </h2>
                );

              case "list":
                return (
                  <ul key={blockIndex} className="flex flex-col gap-2.5 pl-1">
                    {block.items.map((item) => (
                      <li key={item} className="flex gap-3 text-base leading-relaxed text-body">
                        <span
                          aria-hidden="true"
                          className="mt-2.5 size-1.5 shrink-0 rounded-full bg-primary"
                        />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                );

              case "callout":
                return (
                  <p
                    key={blockIndex}
                    className="flex gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm leading-relaxed text-body"
                  >
                    <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                    <span>{block.text}</span>
                  </p>
                );

              default:
                return (
                  <p key={blockIndex} className="text-base leading-relaxed text-body">
                    {block.text}
                  </p>
                );
            }
          })}
        </div>

        {/* One standing disclaimer per guide. These pages discuss instruments,
            terms and Indian regulation, and a reader who acts on them without
            a lawyer is the person this line is for. */}
        <p className="rounded-xl border border-border bg-secondary-bg/60 p-4 text-xs leading-relaxed text-muted">
          General information for founders, not legal, tax or financial advice. Fundraising
          documents are binding in ways that are not obvious from reading them — take professional
          advice on anything you are about to sign.
        </p>

        <nav className="flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
          {previous ? (
            <Link
              href={`/funding/guides/${previous.slug}`}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary-active"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              {previous.title}
            </Link>
          ) : (
            <Link
              href="/funding/guides"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary-active"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              All guides
            </Link>
          )}

          {next && (
            <Link
              href={`/funding/guides/${next.slug}`}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary-active sm:text-right"
            >
              {next.title}
              <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
            </Link>
          )}
        </nav>
      </Container>
    </main>
  );
}
