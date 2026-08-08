/* Terms of Service — static content page linked from the footer. The launch
 * rules section reads SUBMISSION_RULES straight from lib/moderation.ts, so what
 * we promise here can't drift from what the submit form actually enforces. */

import type { Metadata } from "next";
import Link from "next/link";

import { Container } from "@/components/ui/container";
import { Caption, H1, H2, Lead } from "@/components/ui/typography";
import { ADS_EMAIL, MAX_PRODUCTS_PER_USER, SITE_NAME } from "@/lib/constants";
import { SUBMISSION_RULES } from "@/lib/moderation";

export const metadata: Metadata = {
  title: "Terms of Service",
  alternates: { canonical: "/terms" },
  description:
    "The rules for using Bharat Hunt — accounts, launching products, content ownership, and moderation.",
};

const LAST_UPDATED = "3 August 2026";

export default function TermsPage() {
  return (
    <Container className="max-w-3xl py-14 md:py-20">
      <Caption>Legal</Caption>
      <H1 className="mt-3">Terms of Service</H1>
      <p className="mt-3 text-sm text-muted">Last updated {LAST_UPDATED}</p>

      <Lead className="mt-6">
        These terms cover your use of {SITE_NAME}. By creating an account or launching a product,
        you agree to them.
      </Lead>

      <div className="mt-12 flex flex-col gap-10">
        <section className="flex flex-col gap-3">
          <H2 className="text-2xl sm:text-3xl">Your account</H2>
          <p className="leading-relaxed text-body">
            You need an account to launch a product, upvote, or comment, and you must be at least 18
            years old. Keep your login details secure — anything done from your account is treated
            as done by you. One account per person; don&apos;t impersonate someone else or claim a
            product you didn&apos;t build.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <H2 className="text-2xl sm:text-3xl">Launching products</H2>
          <p className="leading-relaxed text-body">
            Each maker can have up to {MAX_PRODUCTS_PER_USER} products listed at a time. Every
            submission is checked against these rules before it goes live:
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {SUBMISSION_RULES.map((rule) => (
              <li key={rule} className="flex gap-2.5 leading-relaxed text-body">
                <span aria-hidden="true" className="font-bold text-primary">
                  •
                </span>
                <span>{rule}</span>
              </li>
            ))}
          </ul>
          <p className="leading-relaxed text-body">
            Submissions that break these rules are rejected automatically, and listings that slip
            through can be removed later.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <H2 className="text-2xl sm:text-3xl">Your content stays yours</H2>
          <p className="leading-relaxed text-body">
            You keep ownership of everything you post — your product details, images, and comments.
            By posting it you give us permission to host it, display it on the platform, and show it
            in listings, search results and previews so people can discover it. You confirm you have
            the right to share what you post, including any logos and screenshots.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <H2 className="text-2xl sm:text-3xl">Acceptable use</H2>
          <p className="leading-relaxed text-body">
            Don&apos;t post adult, illegal, pirated or fraudulent material. Don&apos;t manipulate
            upvotes with fake accounts, scrape the platform, or try to break, overload or gain
            unauthorised access to it. Be civil in comments — harassment and spam get removed.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <H2 className="text-2xl sm:text-3xl">Moderation</H2>
          <p className="leading-relaxed text-body">
            We can edit, unpublish or delete any listing or comment that breaks these terms, and
            suspend accounts that do so repeatedly. We aim to be fair and proportionate; if you
            think we got it wrong, email us and we&apos;ll take another look.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <H2 className="text-2xl sm:text-3xl">Advertising</H2>
          <p className="leading-relaxed text-body">
            Featured listings, homepage spotlights and newsletter placements are paid options
            arranged separately — see{" "}
            <Link
              href="/advertise"
              className="font-medium text-primary transition-colors hover:underline"
            >
              Advertise
            </Link>{" "}
            or write to{" "}
            <a
              href={`mailto:${ADS_EMAIL}`}
              className="font-medium text-primary transition-colors hover:underline"
            >
              {ADS_EMAIL}
            </a>
            . Paid placements are labelled as such and never change how community upvotes are
            counted.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <H2 className="text-2xl sm:text-3xl">No warranties</H2>
          <p className="leading-relaxed text-body">
            {SITE_NAME} is provided as-is. We work hard to keep it running, but we can&apos;t
            promise it will always be available or error-free. Products listed here are built by
            their makers, not by us — we don&apos;t endorse them or guarantee they work as
            described. Check anything you rely on before you buy.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <H2 className="text-2xl sm:text-3xl">Changes and closing your account</H2>
          <p className="leading-relaxed text-body">
            We may update these terms as the platform grows; we&apos;ll move the date at the top and
            announce anything significant. You can stop using {SITE_NAME} at any time and ask us to
            close your account. These terms are governed by the laws of India.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <H2 className="text-2xl sm:text-3xl">Contact</H2>
          <p className="leading-relaxed text-body">
            Questions about these terms? Email{" "}
            <a
              href="mailto:info@bharathunt.org"
              className="font-medium text-primary transition-colors hover:underline"
            >
              info@bharathunt.org
            </a>
            . See also our{" "}
            <Link
              href="/privacy"
              className="font-medium text-primary transition-colors hover:underline"
            >
              Privacy Policy
            </Link>{" "}
            and{" "}
            <Link
              href="/cookies"
              className="font-medium text-primary transition-colors hover:underline"
            >
              Cookie Policy
            </Link>
            .
          </p>
        </section>
      </div>
    </Container>
  );
}
