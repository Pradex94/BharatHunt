import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { MotionConfig } from "framer-motion";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
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
  title: {
    default: "Bharat Hunt — Discover premium software before everyone else",
    template: "%s · Bharat Hunt",
  },
  description:
    "A curated marketplace of lifetime deals and premium tools, built by founders for founders. Discover, upvote, and launch the products worth your attention.",
  keywords: ["marketplace", "software deals", "lifetime deals", "product launch", "founders", "India"],
  // Brand icon → favicon + Apple touch icon (served from public/brand-icon.png).
  icons: {
    icon: "/brand-icon.png",
    shortcut: "/brand-icon.png",
    apple: "/brand-icon.png",
  },
  openGraph: {
    title: "Bharat Hunt — Discover premium software before everyone else",
    description:
      "A curated marketplace of lifetime deals and premium tools, built by founders for founders.",
    siteName: "Bharat Hunt",
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
        <body className="flex min-h-dvh flex-col">
          <MotionConfig reducedMotion="user" transition={{ duration: 0.2, ease: "easeOut" }}>
            <Navbar />
            <main className="flex flex-1 flex-col">{children}</main>
            <Footer />
          </MotionConfig>
        </body>
      </html>
    </ClerkProvider>
  );
}
