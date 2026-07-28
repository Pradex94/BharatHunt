/* Cookie Policy — static content page. The banner (CookieConsent) links here,
 * and the footer's "Cookies" link points here too. Honest about what we set:
 * essential auth + the consent cookie; no third-party analytics today. */

import type { Metadata } from "next";

import { Container } from "@/components/ui/container";
import { Caption, H1, H2, Lead } from "@/components/ui/typography";
import { CookiePreferences } from "@/components/layout/cookie-preferences";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description:
    "How Bharat Hunt uses cookies — essential cookies that keep you signed in, and how to manage your choices.",
};

const COOKIE_ROWS = [
  {
    name: "bh_cookie_consent",
    purpose: "Remembers your cookie choice so we don't ask again.",
    type: "Essential",
    retention: "1 year",
  },
  {
    name: "Authentication (Clerk)",
    purpose: "Keeps you securely signed in across pages.",
    type: "Essential",
    retention: "Session",
  },
  {
    name: "Analytics",
    purpose: "None loaded today — reserved for future, opt-in only.",
    type: "Optional",
    retention: "—",
  },
];

export default function CookiesPage() {
  return (
    <Container className="max-w-3xl py-14 md:py-20">
      <Caption>Legal</Caption>
      <H1 className="mt-3">Cookie Policy</H1>
      <p className="mt-3 text-sm text-muted">Last updated 27 July 2026</p>

      <Lead className="mt-6">
        This page explains how Bharat Hunt uses cookies and similar technologies,
        and how you can control them.
      </Lead>

      <div className="mt-12 flex flex-col gap-10">
        <section className="flex flex-col gap-3">
          <H2 className="text-2xl sm:text-3xl">What are cookies?</H2>
          <p className="leading-relaxed text-body">
            Cookies are small text files a website stores on your device. They let
            a site remember things between visits — like keeping you signed in — and
            help us understand how the platform is used so we can improve it.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <H2 className="text-2xl sm:text-3xl">How we use them</H2>
          <p className="leading-relaxed text-body">
            We keep this simple. We use{" "}
            <strong className="font-semibold text-ink">essential cookies</strong>{" "}
            that the platform needs to work — most importantly to keep you signed in
            via our authentication provider, and to remember your cookie choice. We
            do not currently load any third-party analytics or advertising cookies;
            if that ever changes, they will only load after you accept.
          </p>

          <div className="mt-2 overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary-bg text-ink">
                  <th className="px-4 py-3 font-semibold">Cookie</th>
                  <th className="px-4 py-3 font-semibold">Purpose</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Retention</th>
                </tr>
              </thead>
              <tbody>
                {COOKIE_ROWS.map((row) => (
                  <tr key={row.name} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-mono text-xs text-ink">{row.name}</td>
                    <td className="px-4 py-3 text-body">{row.purpose}</td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          row.type === "Essential"
                            ? "rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                            : "rounded-full bg-secondary-bg px-2 py-0.5 text-xs font-medium text-muted"
                        }
                      >
                        {row.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-body">{row.retention}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <H2 className="text-2xl sm:text-3xl">Managing your choices</H2>
          <p className="leading-relaxed text-body">
            You can change your preference at any time below. You can also block or
            delete cookies in your browser settings — note that blocking essential
            cookies may sign you out or break parts of the platform.
          </p>
          <div className="mt-2">
            <CookiePreferences />
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <H2 className="text-2xl sm:text-3xl">Questions?</H2>
          <p className="leading-relaxed text-body">
            If you have any questions about our use of cookies, email us at{" "}
            <a
              href="mailto:hello@bharathunt.com"
              className="font-medium text-primary transition-colors hover:underline"
            >
              hello@bharathunt.com
            </a>
            .
          </p>
        </section>
      </div>
    </Container>
  );
}
