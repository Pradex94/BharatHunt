"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { StoryCard } from "@/components/ai/story-card";
import { loadMoreAiStories } from "@/lib/actions/ai-news";
import type { AiStoryCard, AiStoryQuery } from "@/services/ai-news";

/**
 * "Latest AI News" — the paginated feed (section 7).
 *
 * The first page is rendered on the server and arrives as HTML; this component
 * only exists to append the *next* ones. That split is deliberate and is the
 * same one `ProductList` makes: a reader who never presses the button pays
 * nothing for the pagination, and a crawler sees real content rather than an
 * empty div waiting for JavaScript.
 *
 * `?page=` still works on its own, which is what keeps every story reachable by
 * a link — the sitemap and the crawlable-pagination lesson this project already
 * learned once on /marketplace.
 *
 * `now` is passed down from the server rather than read here, so every relative
 * timestamp in the list is computed against one clock and the appended cards
 * agree with the server-rendered ones.
 */
export function StoryFeed({
  initialStories,
  initialPage,
  initialHasMore,
  filters,
  now,
}: {
  initialStories: AiStoryCard[];
  initialPage: number;
  initialHasMore: boolean;
  filters: AiStoryQuery;
  now: Date;
}) {
  const [stories, setStories] = useState(initialStories);
  const [page, setPage] = useState(initialPage);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [failed, setFailed] = useState(false);
  const [isPending, startTransition] = useTransition();

  const loadMore = () => {
    setFailed(false);
    startTransition(async () => {
      try {
        const next = await loadMoreAiStories({ ...filters, page: page + 1 });

        // Deduplicated on merge, not trusted to be disjoint. Ingestion runs
        // between one page and the next, and a story that gained a source moves
        // up the trend ordering — which can push a story we already have onto
        // the next page. Without this the reader sees it twice.
        setStories((current) => {
          const seen = new Set(current.map((story) => story.id));
          return [...current, ...next.stories.filter((story) => !seen.has(story.id))];
        });
        setPage(next.page);
        setHasMore(next.hasMore);
      } catch {
        setFailed(true);
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {stories.map((story) => (
          <StoryCard key={story.id} story={story} now={now} />
        ))}
      </div>

      {failed ? (
        <p className="text-center text-sm text-muted">
          Could not load more stories. Check your connection and try again.
        </p>
      ) : null}

      {hasMore ? (
        <div className="flex justify-center pt-2">
          <Button type="button" variant="outline" onClick={loadMore} disabled={isPending}>
            {isPending ? "Loading…" : "Load more stories"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
