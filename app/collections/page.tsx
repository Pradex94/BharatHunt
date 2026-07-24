/* Design system: design.md (Claude.com editorial)
 * Collections index — curated editorial groupings, each a warm-toned card.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Display, Lead } from "@/components/ui/typography";
import { FadeIn, FadeInStagger, FadeInItem } from "@/components/ui/motion";
import { COLLECTIONS, type Collection } from "@/lib/collections";

export const metadata: Metadata = {
  title: "Collections",
  description:
    "Hand-picked collections of products on Bharat Hunt — the MVP stack, founder finance, free-to-start tools, and more.",
};

// Warm-toned surfaces from the trinity — no fourth color introduced.
const ACCENT_SURFACE: Record<Collection["accent"], string> = {
  coral: "bg-primary text-on-primary [--meta:var(--color-on-primary)]",
  dark: "bg-surface-dark text-on-dark [--meta:var(--color-on-dark-soft)]",
  teal: "border border-border bg-card text-ink [--meta:var(--color-muted)]",
  amber: "border border-border bg-card text-ink [--meta:var(--color-muted)]",
};

const ACCENT_DOT: Record<Collection["accent"], string> = {
  coral: "bg-on-primary/40",
  dark: "bg-primary",
  teal: "bg-accent-teal",
  amber: "bg-accent-amber",
};

export default function CollectionsPage() {
  return (
    <Section className="py-16 md:py-24">
      <Container className="flex flex-col gap-12">
        <FadeIn className="flex max-w-2xl flex-col gap-4">
          <Display className="text-balance">Collections</Display>
          <Lead>
            Curated lenses on the catalogue — each one a small point of view about
            which tools belong together, and why.
          </Lead>
        </FadeIn>

        <FadeInStagger className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {COLLECTIONS.map((collection) => (
            <FadeInItem key={collection.slug}>
              <Link
                href={`/collections/${collection.slug}`}
                className={cn(
                  "group flex h-full flex-col justify-between gap-8 rounded-lg p-8 outline-none transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-hover focus-visible:ring-2 focus-visible:ring-ring/50",
                  ACCENT_SURFACE[collection.accent],
                )}
              >
                <div className="flex flex-col gap-3">
                  <span
                    className={cn("size-2.5 rounded-full", ACCENT_DOT[collection.accent])}
                    aria-hidden="true"
                  />
                  <h2 className="max-w-[16ch] text-2xl tracking-[-0.02em] sm:text-3xl">
                    {collection.title}
                  </h2>
                  <p className="max-w-[38ch] text-sm leading-relaxed text-[color:var(--meta)]">
                    {collection.tagline}
                  </p>
                </div>
                <span className="flex items-center gap-1 text-sm font-medium">
                  View collection
                  <ArrowRight
                    className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </span>
              </Link>
            </FadeInItem>
          ))}
        </FadeInStagger>
      </Container>
    </Section>
  );
}
