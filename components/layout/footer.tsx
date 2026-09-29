/* Design system: design.md (Bharat Hunt — orange) · light 4-column footer
 * Logo + tagline + socials, then Platform / Resources / Company / Connect.
 */

import Link from "next/link";

import { Container } from "@/components/ui/container";
import { Logo } from "@/components/layout/logo";
import { InstagramIcon, LinkedInIcon, XIcon, YouTubeIcon } from "@/components/products/social-icons";
import { ADS_EMAIL, SOCIAL_PROFILES } from "@/lib/constants";

/*
 * Every one of these used to be `href="#"` — four links to nowhere, on every
 * page. Now each renders only when its URL is configured (see SOCIAL_PROFILES),
 * so an account that does not exist leaves no link behind.
 */
const SOCIAL_LINKS = [
  { key: "x", label: "X (Twitter)", Icon: XIcon },
  { key: "linkedin", label: "LinkedIn", Icon: LinkedInIcon },
  { key: "instagram", label: "Instagram", Icon: InstagramIcon },
  { key: "youtube", label: "YouTube", Icon: YouTubeIcon },
].flatMap(({ key, label, Icon }) => {
  const href = SOCIAL_PROFILES[key];
  return href ? [{ label, href, Icon }] : [];
});

const FOOTER_COLUMNS = [
  {
    title: "Platform",
    links: [
      { label: "All Products", href: "/marketplace" },
      { label: "Categories", href: "/categories" },
      { label: "Collections", href: "/collections" },
      { label: "Top Launches", href: "/marketplace?sort=newest" },
      { label: "Leaderboard", href: "/marketplace?sort=top-rated" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Blog", href: "/blog" },
      // Three links pointed at /blog under names it does not answer to
      // ("API", "Help Center"). Each now goes where its label promises, or is
      // gone: a footer link to a page that is not what it says wastes the
      // crawl and the click alike.
      { label: "FAQ", href: "/faq" },
      { label: "Guidelines", href: "/terms" },
    ],
  },
  {
    title: "Company",
    links: [
      // Pointed at /blog/why-cream-not-white — an essay on the background
      // colour — until /about existed to answer the question the label asks.
      { label: "About Us", href: "/about" },
      { label: "Advertise", href: "/advertise" },
      { label: "Contact", href: "mailto:info@bharathunt.org" },
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Cookies", href: "/cookies" },
      { label: "Terms", href: "/terms" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-border bg-card">
      <Container className="py-12 md:py-16">
        <div className="grid grid-cols-2 gap-x-6 gap-y-9 md:grid-cols-[1.4fr_repeat(4,1fr)] md:gap-10">
          {/* Brand column */}
          <div className="col-span-2 flex flex-col gap-4 md:col-span-1">
            <Logo />
            <p className="max-w-xs text-sm leading-relaxed text-body">
              The best place to launch, discover and grow innovative products.
            </p>
            <div className="mt-1 flex items-center gap-2">
              {SOCIAL_LINKS.map(({ label, href, Icon }) => (
                <Link
                  key={label}
                  href={href}
                  aria-label={label}
                  className="flex size-9 items-center justify-center rounded-lg border border-border text-muted transition-colors duration-200 hover:border-primary/30 hover:bg-secondary-bg hover:text-primary"
                >
                  <Icon className="size-4" />
                </Link>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {FOOTER_COLUMNS.map((column) => (
            <div key={column.title} className="flex flex-col gap-3">
              <h3 className="text-sm font-bold tracking-tight text-ink">{column.title}</h3>
              <ul className="flex flex-col gap-2.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="inline-flex min-h-8 items-center text-sm text-body transition-colors duration-200 hover:text-primary"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Connect column */}
          <div className="col-span-2 flex flex-col gap-3 md:col-span-1">
            <h3 className="text-sm font-bold tracking-tight text-ink">Connect</h3>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted">General</span>
              <a
                href="mailto:info@bharathunt.org"
                className="text-sm break-all text-body transition-colors duration-200 hover:text-primary"
              >
                info@bharathunt.org
              </a>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted">Advertising</span>
              <a
                href={`mailto:${ADS_EMAIL}`}
                className="text-sm break-all text-body transition-colors duration-200 hover:text-primary"
              >
                {ADS_EMAIL}
              </a>
            </div>
          </div>
        </div>

        <div className="mt-12 border-t border-border pt-6">
          <p className="text-sm text-muted">
            © {new Date().getFullYear()} Bharat Hunt. All rights reserved.
          </p>
        </div>
      </Container>
    </footer>
  );
}
