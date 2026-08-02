/* Privacy Policy — static content page linked from the footer. Written to match
 * what the app actually does: Clerk for auth, Supabase for data/storage, an SMTP
 * relay for advertising mail, and essential cookies only. Keep it in sync when
 * the stack changes. */

import type { Metadata } from "next";
import Link from "next/link";

import { Container } from "@/components/ui/container";
import { Caption, H1, H2, Lead } from "@/components/ui/typography";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "What Bharat Hunt collects, why we collect it, who processes it, and the choices you have over your data.",
};

const LAST_UPDATED = "3 August 2026";

const DATA_ROWS = [
  {
    what: "Account details",
    detail: "Name, email address, username and avatar, from the account you sign up with.",
    why: "To identify you, sign you in, and credit you as a maker.",
  },
  {
    what: "Content you post",
    detail: "Products you launch, comments you write, and products you upvote.",
    why: "To publish it on the marketplace — this content is public by design.",
  },
  {
    what: "Advertising inquiries",
    detail: "Name, work email, company, package interest and your message.",
    why: "To reply to you about advertising on Bharat Hunt.",
  },
  {
    what: "Essential cookies",
    detail: "A session cookie that keeps you signed in, and your cookie choice.",
    why: "To keep the platform working. No advertising or analytics cookies today.",
  },
];

const PROCESSORS = [
  { name: "Clerk", role: "Authentication — stores your login credentials and session." },
  { name: "Supabase", role: "Database and image storage for profiles, products and comments." },
  { name: "Vercel", role: "Hosting and delivery of the site." },
  { name: "Upstash", role: "Caching of product listings to keep pages fast." },
  { name: "Our email relay", role: "Delivers advertising inquiry emails." },
];

export default function PrivacyPage() {
  return (
    <Container className="max-w-3xl py-14 md:py-20">
      <Caption>Legal</Caption>
      <H1 className="mt-3">Privacy Policy</H1>
      <p className="mt-3 text-sm text-muted">Last updated {LAST_UPDATED}</p>

      <Lead className="mt-6">
        Bharat Hunt is a place to launch and discover Indian products. This page explains what we
        collect, why, who else touches it, and what you can ask us to do with it.
      </Lead>

      <div className="mt-12 flex flex-col gap-10">
        <section className="flex flex-col gap-3">
          <H2 className="text-2xl sm:text-3xl">What we collect</H2>
          <p className="leading-relaxed text-body">
            We only collect what the platform needs to work. We do not buy personal data, and we do
            not sell yours.
          </p>

          <div className="mt-2 overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary-bg text-ink">
                  <th className="px-4 py-3 font-semibold">Data</th>
                  <th className="px-4 py-3 font-semibold">What it is</th>
                  <th className="px-4 py-3 font-semibold">Why we have it</th>
                </tr>
              </thead>
              <tbody>
                {DATA_ROWS.map((row) => (
                  <tr key={row.what} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium text-ink">{row.what}</td>
                    <td className="px-4 py-3 text-body">{row.detail}</td>
                    <td className="px-4 py-3 text-body">{row.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <H2 className="text-2xl sm:text-3xl">What&apos;s public</H2>
          <p className="leading-relaxed text-body">
            Anything you launch or post is public: your product listings, your comments, the count of
            upvotes, and the display name, username and avatar on your maker profile. Treat these as
            visible to anyone on the internet, including search engines. Your email address is never
            shown publicly.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <H2 className="text-2xl sm:text-3xl">Who processes your data</H2>
          <p className="leading-relaxed text-body">
            We run Bharat Hunt on a small set of service providers. They process data on our behalf
            and only for the purposes below.
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {PROCESSORS.map((processor) => (
              <li key={processor.name} className="flex flex-col gap-0.5 leading-relaxed">
                <span className="font-semibold text-ink">{processor.name}</span>
                <span className="text-body">{processor.role}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-3">
          <H2 className="text-2xl sm:text-3xl">Cookies</H2>
          <p className="leading-relaxed text-body">
            We use essential cookies only — one to keep you signed in, one to remember your cookie
            choice. No third-party analytics or advertising cookies are loaded today. The{" "}
            <Link
              href="/cookies"
              className="font-medium text-primary transition-colors hover:underline"
            >
              Cookie Policy
            </Link>{" "}
            has the full list and lets you change your preference.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <H2 className="text-2xl sm:text-3xl">How long we keep it</H2>
          <p className="leading-relaxed text-body">
            Your profile and content stay until you remove them or ask us to close your account. You
            can delete any product you&apos;ve launched from its page at any time. Advertising
            inquiries are kept while we&apos;re in touch with you and for our business records
            afterwards.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <H2 className="text-2xl sm:text-3xl">Your choices</H2>
          <p className="leading-relaxed text-body">
            You can access and correct your profile details from your account, delete your own
            products and comments, and change your cookie preference whenever you like. To request a
            copy of your data or ask us to delete your account entirely, email us and we&apos;ll
            handle it.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <H2 className="text-2xl sm:text-3xl">Children</H2>
          <p className="leading-relaxed text-body">
            Bharat Hunt isn&apos;t intended for children. You need to be at least 18 to create an
            account and launch a product.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <H2 className="text-2xl sm:text-3xl">Changes to this policy</H2>
          <p className="leading-relaxed text-body">
            If we change how we handle your data, we&apos;ll update this page and move the date at
            the top. Significant changes will be announced on the platform.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <H2 className="text-2xl sm:text-3xl">Contact</H2>
          <p className="leading-relaxed text-body">
            Questions about privacy, or a request about your data? Email us at{" "}
            <a
              href="mailto:info@bharathunt.org"
              className="font-medium text-primary transition-colors hover:underline"
            >
              info@bharathunt.org
            </a>
            . See also our{" "}
            <Link
              href="/terms"
              className="font-medium text-primary transition-colors hover:underline"
            >
              Terms of Service
            </Link>
            .
          </p>
        </section>
      </div>
    </Container>
  );
}
