/* Design system: design.md (Claude.com editorial)
 * Blog index — editorial list where the cream + serif system does its best work.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Display, Lead, Caption } from "@/components/ui/typography";
import { FadeIn, FadeInStagger, FadeInItem } from "@/components/ui/motion";
import { BLOG_POSTS, formatPostDate } from "@/lib/blog";

export const metadata: Metadata = {
  title: "Blog",
  alternates: { canonical: "/blog" },
  description:
    "Notes from Bharat Hunt on launching well, how ranking works, and the design behind the marketplace.",
};

export default function BlogPage() {
  const posts = [...BLOG_POSTS].sort((a, b) => b.date.localeCompare(a.date));
  const [lead, ...rest] = posts;

  return (
    <Section className="py-16 md:py-24">
      <Container className="flex flex-col gap-14">
        <FadeIn className="flex max-w-2xl flex-col gap-4">
          <Display className="text-balance">Notes from Bharat Hunt</Display>
          <Lead>
            Short, honest writing on launching, discovery, and the craft behind the
            marketplace — no growth-hacking, no listicles.
          </Lead>
        </FadeIn>

        {/* Lead post — larger editorial feature */}
        {lead && (
          <FadeIn>
            <Link
              href={`/blog/${lead.slug}`}
              className="group flex flex-col gap-4 rounded-lg border border-border bg-card p-8 outline-none transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-hover focus-visible:ring-2 focus-visible:ring-ring/50 md:p-10"
            >
              <div className="flex items-center gap-3">
                <Caption>{lead.tag}</Caption>
                <span className="text-xs text-muted">
                  {formatPostDate(lead.date)} · {lead.readingMinutes} min read
                </span>
              </div>
              <h2 className="max-w-[20ch] text-3xl tracking-[-0.02em] text-ink sm:text-4xl">
                {lead.title}
              </h2>
              <p className="max-w-[60ch] text-base leading-relaxed text-body">
                {lead.excerpt}
              </p>
              <span className="flex items-center gap-1 text-sm font-medium text-primary">
                Read the post
                <ArrowRight
                  className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </span>
            </Link>
          </FadeIn>
        )}

        {/* Remaining posts — a divided editorial list */}
        {rest.length > 0 && (
          <FadeInStagger className="flex flex-col">
            {rest.map((post) => (
              <FadeInItem key={post.slug}>
                <Link
                  href={`/blog/${post.slug}`}
                  className="group flex flex-col gap-2 border-t border-border py-8 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 sm:flex-row sm:items-baseline sm:gap-8"
                >
                  <div className="flex shrink-0 items-center gap-3 sm:w-48 sm:flex-col sm:items-start sm:gap-1">
                    <Caption>{post.tag}</Caption>
                    <span className="text-xs text-muted">
                      {formatPostDate(post.date)} · {post.readingMinutes} min
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <h3 className="text-2xl font-bold tracking-[-0.02em] text-ink transition-colors duration-200 group-hover:text-primary">
                      {post.title}
                    </h3>
                    <p className="max-w-[60ch] text-sm leading-relaxed text-body">
                      {post.excerpt}
                    </p>
                  </div>
                </Link>
              </FadeInItem>
            ))}
          </FadeInStagger>
        )}
      </Container>
    </Section>
  );
}
