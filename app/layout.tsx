import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { MotionConfig } from "framer-motion";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { CookieConsent } from "@/components/layout/cookie-consent";
import { ChatWidget } from "@/components/chat/chat-widget";
import { JsonLd } from "@/components/seo/json-ld";
import {
  GoogleTagManager,
  GoogleTagManagerNoScript,
} from "@/components/analytics/google-tag-manager";
import { ConsentSync } from "@/components/analytics/consent-sync";
import { organizationSchema, websiteSchema } from "@/lib/seo";
import { SITE_NAME, SITE_URL } from "@/lib/constants";
import "./globals.css";

// Inter is the whole voice here — bold headlines, regular body, medium labels.
// It drives both --font-sans and --font-display (headings just use heavier weight).
const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

// Monospace for tabular figures (upvote counts, stats).
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  // Absolute-URL base for canonical links, OG/Twitter images, and JSON-LD.
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Bharat Hunt — Discover premium software before everyone else",
    template: `%s · ${SITE_NAME}`,
  },
  description:
    "A curated marketplace of lifetime deals and premium tools, built by founders for founders. Discover, upvote, and launch the products worth your attention.",
  keywords: [
    "marketplace",
    "software deals",
    "lifetime deals",
    "product launch",
    "dofollow backlink",
    "founders",
    "India",
  ],
  // NOTE: no site-wide `alternates.canonical`. A default of "/" made every
  // page that didn't override it declare itself the homepage, which drops it
  // from the index entirely. Each route sets its own canonical below.
  // Favicon + Apple touch icon come from app/icon.tsx and app/apple-icon.tsx
  // (generated), and the default share card from app/opengraph-image.tsx.
  openGraph: {
    title: "Bharat Hunt — Discover premium software before everyone else",
    description:
      "A curated marketplace of lifetime deals and premium tools, built by founders for founders.",
    siteName: SITE_NAME,
    url: SITE_URL,
    locale: "en_IN",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Bharat Hunt",
    description: "Discover premium software before everyone else.",
  },
};

const fontVariables = `${inter.variable} ${jetbrainsMono.variable}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${fontVariables} antialiased`}>
        <head>
          <GoogleTagManager />
        </head>
        <body className="flex min-h-dvh flex-col">
          {/* GTM's noscript iframe belongs immediately after <body>. */}
          <GoogleTagManagerNoScript />
          <ConsentSync />
          <JsonLd data={[organizationSchema(), websiteSchema()]} />
          <MotionConfig reducedMotion="user" transition={{ duration: 0.2, ease: "easeOut" }}>
            <Navbar />
            <main className="flex flex-1 flex-col">{children}</main>
            <Footer />
            <CookieConsent />
            <ChatWidget />
          </MotionConfig>
        </body>
      </html>
    </ClerkProvider>
  );
}
