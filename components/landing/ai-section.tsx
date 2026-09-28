import Link from "next/link";

import { CategoryChip, ImageFallback, SourceLine } from "@/components/ai/story-card";
import { StoryImage } from "@/components/ai/story-image";
import { UpdatedAgo } from "@/components/ai/updated-ago";
import { FadeIn, FadeInItem, FadeInStagger } from "@/components/ui/motion";
import { SECTION_SHELL, SectionHeader } from "@/components/landing/section-header";
import type { Freshness } from "@/lib/ai-news/format";
import type { AiFreshness, AiStoryCard } from "@/services/ai-news";

/**
 * "AI is Moving Fast" — a window onto /ai, not a second copy of it.
 *
 * Four stories from the hub's own trending order (`getTrendingAiStories`), so
 * the homepage never disagrees with the page it links to, and the hub's
 * freshness line so a visitor can see when the pipeline last ran. Supporting
 * intelligence: it sits below the product discovery sections, and it hides
 * itself entirely when there is nothing ingested rather than showing an empty
 * frame on the front door.
 */
export function AiSection({
  stories,
  fresh,
  stamp,
  now,
}: {
  stories: AiStoryCard[];
  fresh: AiFreshness;
  stamp: Freshness;
  now: Date;
}) {
  if (stories.length === 0) return null;

  return (
    <section className="border-y border-border bg-secondary-bg/50">
      <div className={`${SECTION_SHELL} py-12 md:py-16`}>
        <FadeIn>
          <SectionHeader
            eyebrow="AI intelligence"
            title="AI is Moving Fast"
            subtitle="Latest AI tools, launches and developments — ranked across sources."
            note={
              <UpdatedAgo
                tone="light"
                className="text-xs"
                lastSuccessAt={fresh.last_success_at}
                initialLabel={stamp.label}
                initialStale={stamp.stale}
                storiesToday={fresh.stories_24h}
              />
            }
            action={{ label: "Explore AI Trends", href: "/ai" }}
          />
        </FadeIn>

        <FadeInStagger className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stories.map((story) => (
            <FadeInItem key={story.id}>
              <article className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-hover">
                <div className="aspect-[16/9] w-full overflow-hidden bg-secondary-bg">
                  <StoryImage
                    src={story.image_url}
                    alt=""
                    className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                    fallback={<ImageFallback className="size-full" />}
                  />
                </div>
                <div className="flex flex-1 flex-col gap-3 p-4">
                  <CategoryChip category={story.category} className="w-fit" />
                  <h3 className="line-clamp-3 text-base leading-snug font-bold tracking-tight text-ink group-hover:text-primary">
                    {/* Stretched link: the whole card opens the story; the
                        category chip sits above it and filters instead. */}
                    <Link href={`/ai/${story.slug}`} className="after:absolute after:inset-0">
                      {story.title}
                    </Link>
                  </h3>
                  <SourceLine story={story} now={now} compact className="mt-auto" />
                </div>
              </article>
            </FadeInItem>
          ))}
        </FadeInStagger>
      </div>
    </section>
  );
}
