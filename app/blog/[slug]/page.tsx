/* Design system: design.md (Claude.com editorial)
 * Blog post — long-measure prose, serif heads, a pull-quote in coral.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Display, Caption } from "@/components/ui/typography";
import { buttonVariants } from "@/components/ui/button";
import { FadeIn } from "@/components/ui/motion";
import { BLOG_POSTS, postFromSlug, formatPostDate, type BlogBlock } from "@/lib/blog";

export function generateStaticParams() {
  return BLOG_POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = postFromSlug(slug);
  if (!post) return { title: "Post not found" };
  return {
    title: post.title,
    description: post.excerpt,
    alternates: { canonical: `/blog/${slug}` },
  };
}

function Block({ block }: { block: BlogBlock }) {
  switch (block.type) {
    case "heading":
      return (
        <h2 className="mt-4 text-2xl font-bold tracking-[-0.02em] text-ink">
          {block.text}
        </h2>
      );
    case "paragraph":
      return <p className="text-lg leading-[1.7] text-body">{block.text}</p>;
    case "quote":
      return (
        <blockquote className="my-4 border-l-2 border-primary pl-6">
          <p className="text-2xl font-bold leading-snug tracking-[-0.01em] text-ink">
            {block.text}
          </p>
          {block.cite && <cite className="mt-2 block text-sm text-muted not-italic">— {block.cite}</cite>}
        </blockquote>
      );
    case "list":
      return (
        <ul className="flex flex-col gap-2 pl-1">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-3 text-lg leading-[1.6] text-body">
              <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      );
  }
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = postFromSlug(slug);
  if (!post) notFound();

  const more = BLOG_POSTS.filter((p) => p.slug !== post.slug)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 2);

  return (
    <>
      <Section className="py-14 md:py-20">
        <Container className="flex max-w-2xl flex-col gap-8">
          <FadeIn className="flex flex-col gap-6">
            <Link
              href="/blog"
              className="flex w-fit items-center gap-1.5 text-sm font-medium text-muted transition-colors duration-200 hover:text-ink"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              All posts
            </Link>

            <header className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <Caption>{post.tag}</Caption>
                <span className="text-xs text-muted">
                  {formatPostDate(post.date)} · {post.readingMinutes} min read
                </span>
              </div>
              <Display className="text-4xl text-balance sm:text-5xl">{post.title}</Display>
              <p className="text-sm text-muted">By {post.author}</p>
            </header>
          </FadeIn>

          <FadeIn>
            <article className="flex flex-col gap-6">
              {post.body.map((block, i) => (
                <Block key={i} block={block} />
              ))}
            </article>
          </FadeIn>
        </Container>
      </Section>

      {/* Keep reading */}
      {more.length > 0 && (
        <Section className="border-t border-border py-14 md:py-20">
          <Container className="flex flex-col gap-8">
            <h2 className="text-2xl sm:text-3xl">Keep reading</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {more.map((p) => (
                <Link
                  key={p.slug}
                  href={`/blog/${p.slug}`}
                  className="group flex flex-col gap-2 rounded-lg border border-border bg-card p-6 outline-none transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-hover focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <Caption>{p.tag}</Caption>
                  <h3 className="text-xl font-bold tracking-[-0.015em] text-ink transition-colors duration-200 group-hover:text-primary">
                    {p.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-body">{p.excerpt}</p>
                </Link>
              ))}
            </div>
            <div>
              <Link href="/marketplace" className={buttonVariants({ variant: "outline" })}>
                Browse the marketplace
              </Link>
            </div>
          </Container>
        </Section>
      )}
    </>
  );
}
