/* Design system: design.md (Bharat Hunt — orange) · Advertise business page.
 * Marketing page for the ad business model: real platform stats, ad packages,
 * how-it-works, and a lead-capture inquiry form (→ lib/actions/ad-inquiry). */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Check, Code2, IndianRupee, MessageSquare, Palette } from "lucide-react";

import { cn } from "@/lib/utils";
import { Container } from "@/components/ui/container";
import { Display, H2, Lead, Numeric } from "@/components/ui/typography";
import { FadeIn } from "@/components/ui/motion";
import { buttonVariants } from "@/components/ui/button";
import { AD_PACKAGES } from "@/lib/advertise";
import { PRODUCT_CATEGORIES } from "@/lib/constants";
import { getPlatformStats } from "@/services/products";
import { AdvertiseInquiryForm } from "@/components/advertise/advertise-inquiry-form";

// Reads live Supabase stats via the Clerk-scoped client → dynamic, not prebuilt.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Advertise",
  alternates: { canonical: "/advertise" },
  description:
    "Put your product in front of India's most curious early adopters — founders, makers and developers. Explore advertising options on Bharat Hunt.",
};

const AUDIENCE = [
  { label: "Founders & indie makers", Icon: IndianRupee },
  { label: "Developers & engineers", Icon: Code2 },
  { label: "Designers & marketers", Icon: Palette },
  { label: "Early adopters & techies", Icon: MessageSquare },
];

const STEPS = [
  { title: "Tell us about your product", body: "Share what you're launching, your goals and your budget." },
  { title: "We recommend a package", body: "We suggest the placement that best fits your audience and timeline." },
  { title: "Go live", body: "Your campaign ships and you start reaching Bharat Hunt's community." },
];

export default async function AdvertisePage() {
  notFound();

  const stats = await getPlatformStats();

  const statCards = [
    { value: stats.products, suffix: "+", label: "Products launched" },
    { value: stats.makers, suffix: "+", label: "Makers on board" },
    { value: stats.upvotes, suffix: "+", label: "Community upvotes" },
    { value: PRODUCT_CATEGORIES.length, suffix: "", label: "Categories to target" },
  ];

  return (
    <div className="flex flex-col">
      {/* ── Hero ── */}
      <section className="border-b border-border">
        <Container className="grid items-center gap-12 py-16 md:py-24 lg:grid-cols-[1.1fr_1fr]">
          <FadeIn className="flex flex-col items-start gap-6">
            <span className="flex items-center gap-3 text-xs font-semibold tracking-[0.22em] text-primary uppercase">
              <span className="h-px w-8 bg-primary" />
              Advertise
            </span>
            <Display className="max-w-[14ch] text-balance md:text-6xl">
              Reach India&rsquo;s early adopters on{" "}
              <span className="text-primary">Bharat Hunt</span>.
            </Display>
            <Lead className="max-w-lg">
              Put your product in front of the founders, makers and developers who love discovering
              what&rsquo;s new — and build real traction with the people most likely to try it.
            </Lead>
            <Link href="#inquire" className={buttonVariants({ size: "lg" })}>
              Get started
            </Link>
          </FadeIn>

          {/* Who's on the other side of the ad. Named segments rather than
              stock faces — this page asks advertisers for money, so the
              illustration shouldn't imply members we can't point to. */}
          <FadeIn delay={0.1} className="relative mx-auto hidden w-full max-w-md lg:block">
            <div
              aria-hidden
              className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(255,138,61,0.14),transparent_65%)]"
            />
            <ul className="relative grid gap-3 sm:grid-cols-2">
              {AUDIENCE.map(({ label, Icon }, i) => (
                <li
                  key={label}
                  className={cn(
                    "flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm",
                    i % 2 === 1 && "sm:mt-8",
                  )}
                >
                  <span className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-[#ff6b1a] to-[#ff8a3d] text-white shadow-sm">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <span className="text-sm font-semibold text-ink">{label}</span>
                </li>
              ))}
            </ul>
          </FadeIn>
        </Container>
      </section>

      {/* ── Stats ── */}
      <section className="border-b border-border bg-secondary-bg/40">
        <Container className="py-14 md:py-16">
          <FadeIn className="mx-auto mb-10 max-w-2xl text-center">
            <H2 className="text-3xl sm:text-4xl">Find new customers</H2>
            <p className="mt-3 text-body">
              Advertising on Bharat Hunt grows awareness, trials and usage of your product by
              reaching a focused, high-intent Indian audience.
            </p>
          </FadeIn>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {statCards.map((card) => (
              <div key={card.label} className="rounded-2xl border border-border bg-card p-6">
                <p className="text-3xl font-bold text-primary sm:text-4xl">
                  <Numeric>{card.value}</Numeric>
                  {card.suffix}
                </p>
                <p className="mt-1 text-sm text-muted">{card.label}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {AUDIENCE.map(({ label, Icon }) => (
              <span
                key={label}
                className="flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-sm text-body"
              >
                <Icon className="size-4 text-primary" />
                {label}
              </span>
            ))}
          </div>
        </Container>
      </section>

      {/* ── Packages ── */}
      <section className="border-b border-border">
        <Container className="py-16 md:py-20">
          <FadeIn className="mx-auto mb-10 max-w-2xl text-center">
            <H2 className="text-3xl sm:text-4xl">Ways to advertise</H2>
            <p className="mt-3 text-body">
              Pick the placement that fits your goals. Custom pricing — we&rsquo;ll tailor it to your
              product and budget.
            </p>
          </FadeIn>
          <div className="grid gap-5 md:grid-cols-3">
            {AD_PACKAGES.map((pkg) => (
              <div
                key={pkg.id}
                className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 transition-colors hover:border-primary/30"
              >
                <div>
                  <h3 className="text-lg font-bold text-ink">{pkg.name}</h3>
                  <p className="mt-1 text-sm text-body">{pkg.tagline}</p>
                </div>
                <ul className="flex flex-col gap-2">
                  {pkg.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-body">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link
                  href="#inquire"
                  className="mt-auto flex items-center gap-1 text-sm font-semibold text-primary transition-colors hover:text-primary-active"
                >
                  Get started <ArrowRight className="size-4" />
                </Link>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* ── How it works ── */}
      <section className="border-b border-border bg-secondary-bg/40">
        <Container className="py-16 md:py-20">
          <FadeIn className="mx-auto mb-10 max-w-2xl text-center">
            <H2 className="text-3xl sm:text-4xl">How it works</H2>
          </FadeIn>
          <div className="grid gap-6 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <div key={step.title} className="flex flex-col gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-lg font-bold text-primary">
                  <Numeric>{i + 1}</Numeric>
                </span>
                <h3 className="text-base font-bold text-ink">{step.title}</h3>
                <p className="text-sm text-body">{step.body}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* ── Inquiry form ── */}
      <section id="inquire" className="scroll-mt-24">
        <Container className="py-16 md:py-20">
          <FadeIn className="mx-auto mb-8 max-w-2xl text-center">
            <H2 className="text-3xl sm:text-4xl">Let&rsquo;s grow your reach</H2>
            <p className="mt-3 text-body">
              Tell us what you&rsquo;re promoting and we&rsquo;ll get back to you with the options
              that fit.
            </p>
          </FadeIn>
          <div className="mx-auto max-w-2xl">
            <AdvertiseInquiryForm />
          </div>
        </Container>
      </section>
    </div>
  );
}
