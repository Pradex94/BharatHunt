/* Design system: design.md (Bharat Hunt — orange) · About the platform.
 *
 * "About Us" in the footer used to point at /blog/why-cream-not-white — an
 * essay about the background colour. It answered a question nobody clicking
 * "About Us" was asking. This page answers the real one: what Bharat Hunt is,
 * how a launch actually works here, and who is on the other side of it.
 *
 * Every claim below is checkable against the code that implements it — the
 * review gate in lib/review.ts, the launch cap in lib/constants.ts, the ?ref=
 * tag in lib/seo.ts, the absence of any ratings table. Same standard as
 * lib/faqs.ts: if a claim stops being true, the behaviour changed and the
 * claim changes with it.
 */

import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ExternalLink,
  Eye,
  Heart,
  MessageSquare,
  PencilLine,
  Rocket,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";

import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { Container } from "@/components/ui/container";
import { FadeIn } from "@/components/ui/motion";
import { buttonVariants } from "@/components/ui/button";
import { Caption, Display, H2, H3, Lead, Numeric } from "@/components/ui/typography";
import { MAX_PRODUCTS_PER_USER, PRODUCT_CATEGORIES } from "@/lib/constants";
import { getPlatformStats } from "@/services/products";

// Reads live platform counts, so the numbers on the page are the real ones.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "About Us",
  description:
    "Bharat Hunt is a launch platform for products built by Indian makers — free to launch, reviewed by a person, and ranked by the community rather than by budget.",
  alternates: { canonical: "/about" },
  openGraph: {
    title: "About Bharat Hunt",
    description:
      "Why Bharat Hunt exists, how a launch works here, and what the community gets out of it.",
    url: "/about",
    type: "website",
  },
};

const PRINCIPLES = [
  {
    Icon: Wallet,
    title: "Free to launch",
    body: "Submitting and listing a product costs nothing, and no amount of money buys a position in the marketplace ranking. Promotion slots exist and are labelled as what they are — placements, not a shortcut up the sort.",
  },
  {
    Icon: ShieldCheck,
    title: "A person reads every submission",
    body: "Nothing publishes itself. Each launch is reviewed before it goes live, usually within a day. If it comes back, the email names the specific reason and your draft is waiting in the dashboard to revise and resubmit.",
  },
  {
    Icon: ExternalLink,
    title: "The traffic is yours",
    body: "Your product page links out to your own site with a normal followed link, tagged ?ref=bharathunt — so the visits it sends land in your analytics under our name instead of vanishing into direct traffic.",
  },
  {
    Icon: Heart,
    title: "Upvotes, counted honestly",
    body: "There are no star ratings and no written reviews here. An upvote count says how many people backed a launch, and that is the only thing it claims to say.",
  },
  {
    Icon: PencilLine,
    title: "A listing you keep",
    body: `Pricing, features and links change constantly, so edits go live immediately from your dashboard. Up to ${MAX_PRODUCTS_PER_USER} launches per account keeps this a place for products people built, not a listing farm.`,
  },
  {
    Icon: MessageSquare,
    title: "Feedback from real users",
    body: "Every product page carries a comment thread. A conversation with someone who actually opened your product is worth more than another silent vote, and the ranking treats it that way.",
  },
];

const AUDIENCES = [
  {
    Icon: Rocket,
    eyebrow: "For makers",
    title: "Launch day, and every day after",
    body: "A thread scrolls past by dinner. A product page keeps working — indexed, linkable, sortable, and still there when someone goes looking six months later.",
    links: [
      { href: "/submit", label: "Launch your product" },
      { href: "/faq", label: "How launching works" },
    ],
  },
  {
    Icon: Eye,
    eyebrow: "For everyone else",
    title: "Find it before everyone does",
    body: `Browse ${PRODUCT_CATEGORIES.length} categories of software built in India, sort by what is trending or newest, upvote what deserves it, and tell the maker what you think.`,
    links: [
      { href: "/marketplace", label: "Browse the marketplace" },
      { href: "/collections", label: "Explore collections" },
    ],
  },
];

export default async function AboutPage() {
  const stats = await getPlatformStats();

  // Only rendered once there is something real to show. A stats band reading
  // "0 products launched" is worse than no stats band.
  const statCards =
    stats.products > 0
      ? [
          { value: stats.products, label: "Products launched" },
          { value: stats.makers, label: "Makers on board" },
          { value: stats.upvotes, label: "Community upvotes" },
          { value: PRODUCT_CATEGORIES.length, label: "Categories" },
        ]
      : [];

  return (
    <div className="flex flex-col">
      {/* ── Hero ── */}
      <section className="border-b border-border">
        <Container className="flex flex-col gap-6 py-14 md:py-20">
          <Breadcrumbs
            items={[
              { name: "Home", path: "/" },
              { name: "About", path: "/about" },
            ]}
          />
          <span className="flex items-center gap-3 text-xs font-semibold tracking-[0.22em] text-primary uppercase">
            <span className="h-px w-8 bg-primary" />
            About us
          </span>
          <Display className="max-w-[16ch] text-balance md:text-6xl">
            Where India&rsquo;s makers <span className="text-primary">launch</span>.
          </Display>
          <Lead className="max-w-2xl">
            Bharat Hunt is a launch platform for software built by Indian founders and indie makers.
            You ship it, we publish it, and the community decides what rises. Free to launch, read by
            a person before it goes live, and ranked by upvotes rather than by budget.
          </Lead>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <Link href="/submit" className={buttonVariants({ size: "lg" })}>
              Launch your product
            </Link>
            <Link href="/marketplace" className={buttonVariants({ variant: "outline", size: "lg" })}>
              Browse the marketplace
            </Link>
          </div>
        </Container>
      </section>

      {/* ── Live platform stats ── */}
      {statCards.length > 0 && (
        <section className="border-b border-border bg-secondary-bg/40">
          <Container className="py-10 md:py-12">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {statCards.map((card) => (
                <div key={card.label} className="rounded-2xl border border-border bg-card p-6">
                  <p className="text-3xl font-bold text-primary sm:text-4xl">
                    <Numeric>{card.value}</Numeric>
                  </p>
                  <p className="mt-1 text-sm text-muted">{card.label}</p>
                </div>
              ))}
            </div>
          </Container>
        </section>
      )}

      {/* ── Why it exists ── */}
      <section className="border-b border-border">
        <Container className="grid gap-10 py-16 md:grid-cols-[0.8fr_1.2fr] md:py-20">
          <FadeIn className="flex flex-col gap-3">
            <Caption>Why we built it</Caption>
            <H2 className="text-3xl text-balance sm:text-4xl">
              Good products, built quietly, seen by nobody.
            </H2>
          </FadeIn>
          <FadeIn delay={0.1} className="flex flex-col gap-4 text-base leading-relaxed text-body">
            <p>
              A remarkable amount of software gets built in India by two people and a laptop, and
              most of it launches into a thread that has scrolled past by dinner. The work was never
              the problem. Distribution was.
            </p>
            <p>
              So this is the other thing: one durable place where a launch keeps working after launch
              day. A page search engines can read, that links back to your own site, that carries a
              real conversation with the people who tried the product, and that is still there when
              someone goes looking months later.
            </p>
            <p>
              It is a marketplace rather than a directory, and the distinction is the whole point. A
              directory lists everything and sorts by whoever paid. Here the order comes from the
              community — upvotes, comments and how recently something shipped — so the only thing a
              maker needs in order to compete is to have built something worth backing.
            </p>
          </FadeIn>
        </Container>
      </section>

      {/* ── How we work ── */}
      <section className="border-b border-border bg-secondary-bg/40">
        <Container className="py-16 md:py-20">
          <FadeIn className="mx-auto mb-10 max-w-2xl text-center">
            <H2 className="text-3xl sm:text-4xl">How we work</H2>
            <p className="mt-3 text-body">
              Six rules the platform actually enforces — not aspirations.
            </p>
          </FadeIn>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {PRINCIPLES.map(({ Icon, title, body }) => (
              <div
                key={title}
                className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-6 transition-colors hover:border-primary/30"
              >
                <span className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-[#ff6b1a] to-[#ff8a3d] text-white shadow-sm">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <h3 className="text-base font-bold text-ink">{title}</h3>
                <p className="text-sm leading-relaxed text-body">{body}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* ── Who it's for ── */}
      <section className="border-b border-border">
        <Container className="py-16 md:py-20">
          <div className="grid gap-5 md:grid-cols-2">
            {AUDIENCES.map(({ Icon, eyebrow, title, body, links }) => (
              <FadeIn
                key={eyebrow}
                className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-8 shadow-sm"
              >
                <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <div className="flex flex-col gap-2">
                  <Caption>{eyebrow}</Caption>
                  <H3>{title}</H3>
                </div>
                <p className="text-body">{body}</p>
                <div className="mt-auto flex flex-wrap items-center gap-x-5 gap-y-2 pt-2">
                  {links.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="flex items-center gap-1 text-sm font-semibold text-primary transition-colors hover:text-primary-active"
                    >
                      {link.label} <ArrowRight className="size-4" />
                    </Link>
                  ))}
                </div>
              </FadeIn>
            ))}
          </div>
        </Container>
      </section>

      {/* ── Contact ── */}
      <section>
        <Container className="py-16 md:py-20">
          <FadeIn className="mx-auto flex max-w-2xl flex-col items-center gap-4 text-center">
            <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="size-5" aria-hidden="true" />
            </span>
            <H2 className="text-3xl sm:text-4xl">Say hello</H2>
            <p className="text-body">
              Questions about a launch, a partnership, or something that looks broken — the same
              small team reads all of it.
            </p>
            <a
              href="mailto:info@bharathunt.org"
              className="text-lg font-semibold break-all text-primary transition-colors hover:text-primary-active"
            >
              info@bharathunt.org
            </a>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm">
              <Link href="/faq" className="font-medium text-body hover:text-primary">
                Read the FAQ
              </Link>
              <Link href="/blog" className="font-medium text-body hover:text-primary">
                Read the blog
              </Link>
              <Link href="/advertise" className="font-medium text-body hover:text-primary">
                Advertise with us
              </Link>
            </div>
          </FadeIn>
        </Container>
      </section>
    </div>
  );
}
