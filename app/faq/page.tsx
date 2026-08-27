/* Design system: design.md — a plain, readable answers page.
 *
 * The only page on the site whose primary purpose is to answer questions, which
 * is the only condition under which FAQPage schema is legitimate. The `Faq`
 * component renders the visible answers and the JSON-LD from the same array.
 */

import type { Metadata } from "next";
import Link from "next/link";

import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { Faq } from "@/components/seo/faq";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Display, Lead } from "@/components/ui/typography";
import { buttonVariants } from "@/components/ui/button";
import { SITE_FAQS } from "@/lib/faqs";

export const metadata: Metadata = {
  title: "FAQ — Launching on Bharat Hunt",
  description:
    "How launching on Bharat Hunt works: review times, what gets sent back, links to your site, launch limits, and how products are ranked.",
  alternates: { canonical: "/faq" },
  openGraph: {
    title: "FAQ — Launching on Bharat Hunt",
    description: "How launching on Bharat Hunt works, answered plainly.",
    url: "/faq",
    type: "website",
  },
};

export default function FaqPage() {
  return (
    <>
      <Section className="border-b border-border py-12 md:py-16">
        <Container className="flex flex-col gap-5">
          <Breadcrumbs
            items={[
              { name: "Home", path: "/" },
              { name: "FAQ", path: "/faq" },
            ]}
          />
          <Display className="max-w-3xl">Questions makers ask</Display>
          <Lead className="max-w-2xl">
            How launching works, what the review looks for, and what you get out of it. If something
            here is not answered, the answer is probably that we have not built it yet.
          </Lead>
        </Container>
      </Section>

      <Section className="py-12 md:py-16">
        <Container className="flex flex-col gap-10">
          <Faq items={SITE_FAQS} heading="Launching on Bharat Hunt" className="max-w-3xl" />

          <div className="flex flex-wrap items-center gap-3">
            <Link href="/submit" className={buttonVariants()}>
              Launch your product
            </Link>
            <Link href="/marketplace" className="text-sm font-medium text-primary hover:underline">
              Browse the marketplace
            </Link>
          </div>
        </Container>
      </Section>
    </>
  );
}
