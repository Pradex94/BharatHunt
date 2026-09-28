"use server";

import { getLaunchesPage } from "@/services/products";
import type { LaunchCardProduct } from "@/components/landing/launch-card";

/** Six per click — two rows of the three-column grid. */
const PAGE = 6;

/**
 * The furthest the homepage list may page before it hands off to the
 * marketplace. The homepage is a discovery layer, not an archive; past this the
 * "See all launches" link is the better tool, and a bound keeps a crafted
 * offset from turning this into a free full-table walk.
 */
const MAX_OFFSET = 60;

/**
 * "Load more" for the homepage's Recently launched list.
 *
 * Offset pagination over the same newest-first order the page rendered from,
 * so a page continues the list exactly. Public data through the anon client —
 * no identity, nothing personal in the response. Only the card's fields are
 * returned, never the row.
 */
export async function loadMoreLaunches(
  offset: number,
): Promise<{ products: LaunchCardProduct[]; hasMore: boolean }> {
  const start = Number.isInteger(offset) ? Math.min(Math.max(offset, 0), MAX_OFFSET) : 0;
  const rows = await getLaunchesPage(start, PAGE);

  return {
    products: rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      tagline: row.tagline,
      category: row.category,
      upvote_count: row.upvote_count,
      hero_image_url: row.hero_image_url,
      creator: row.creator,
      published_at: row.published_at,
      launch_state: row.launch_state ?? null,
    })),
    hasMore: rows.length === PAGE && start + PAGE < MAX_OFFSET,
  };
}
