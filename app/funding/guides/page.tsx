import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Numeric } from "@/components/ui/typography";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { JsonLd } from "@/components/seo/json-ld";
import { FundingRoadmap } from "@/components/funding/roadmap";
import { FUNDING_GUIDES } from "@/lib/funding/guides";
import { absoluteUrl, breadcrumbSchema } from "@/lib/seo";
import { SITE_NAME } from "@/lib/constants";

const TITLE = "How to raise startup funding in India";
const DESCRIPTION =
  "Ten practical guides on raising capital: pitch decks, how much to raise, stages, angels, VCs, valuation, due diligence, data rooms and the mistakes that cost the most time.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/funding/guides" },
  openGraph: {
    title: `${TITLE} — ${SITE_NAME}`,
    description: DESCRIPTION,
    url: absoluteUrl("/funding/guides"),
    siteName: SITE_NAME,
    type: "website",
  },
  twitter: { card: "summary", title: `${TITLE} — ${SITE_NAME}`, description: DESCRIPTION },
};

const CRUMBS = [
  { name: "Home", path: "/" },
  { name: "Funding", path: "/funding" },
  { name: "Guides", path: "/funding/guides" },
];

export default function FundingGuidesPage() {
  return (
    <main className="min-h-dvh bg-background">
      <JsonLd
        data={[
          breadcrumbSchema(CRUMBS),
          {
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: TITLE,
            url: absoluteUrl("/funding/guides"),
            numberOfItems: FUNDING_GUIDES.length,
            itemListElement: FUNDING_GUIDES.map((guide, index) => ({
              "@type": "ListItem",
              position: index + 1,
              name: guide.title,
              url: absoluteUrl(`/funding/guides/${guide.slug}`),
            })),
          },
        ]}
      />

      <Container className="flex flex-col gap-14 py-10 md:gap-20 md:py-14">
        <div className="flex flex-col gap-4">
          <Breadcrumbs items={CRUMBS} />
          <h1 className="max-w-3xl text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            {TITLE}
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-body">
            Written for founders raising their first or second round in India. Specific where
            specifics exist, and clear about the parts that are judgement calls.
          </p>
        </div>

        <FundingRoadmap />

        <section aria-labelledby="all-guides" className="flex flex-col gap-6">
          <h2 id="all-guides" className="text-2xl font-bold tracking-tight text-ink">
            All guides
          </h2>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FUNDING_GUIDES.map((guide) => (
              <Link
                key={guide.slug}
                href={`/funding/guides/${guide.slug}`}
                className="group/guide flex flex-col gap-2 rounded-2xl border border-border bg-card p-5 transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-hover"
              >
                <span className="text-[11px] font-medium tracking-[0.12em] text-muted uppercase">
                  Step {String(guide.step).padStart(2, "0")}
                </span>
                <h3 className="text-sm font-bold tracking-tight text-ink group-hover/guide:text-primary">
                  {guide.title}
                </h3>
                <p className="flex-1 text-sm leading-relaxed text-body">{guide.excerpt}</p>
                <span className="text-xs text-muted">
                  <Numeric>{guide.readingMinutes}</Numeric> min read
                </span>
              </Link>
            ))}
          </div>
        </section>

        <div>
          <Link
            href="/funding"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary-active"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to funding
          </Link>
        </div>
      </Container>
    </main>
  );
}
