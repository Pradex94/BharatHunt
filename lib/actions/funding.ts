"use server";

/**
 * The public funding actions.
 *
 * One export, and it is a read. Everything that writes funding data lives in
 * `lib/actions/funding-admin.ts` behind an admin check — this module is what an
 * anonymous visitor is allowed to call, so keeping it to a single paginated
 * read is the point rather than an accident.
 */

import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { parseFundingFilters, type FundingSearchParams } from "@/lib/funding/filters";
import { getFundingFeed, type FundingRoundRow } from "@/services/funding";

export type LoadMoreResult =
  | { ok: true; rounds: FundingRoundRow[]; hasMore: boolean }
  | { ok: false; error: string };

/**
 * The next page of the feed, for the "Load more" button.
 *
 * Takes the raw search-param shape rather than a resolved query, and re-parses
 * it server-side through the same `parseFundingFilters` the page used. That is
 * the security boundary: this is a public endpoint anyone can post arbitrary
 * JSON to, and re-parsing means a hand-crafted call gets the same bounded,
 * whitelisted query a URL does — it cannot ask for a thousand rows, an
 * unlisted stage, or page 10,000.
 *
 * Rate-limited per IP under the existing `loadMore` policy, which is shared
 * with the marketplace's equivalent. The read is cached and cheap, so the limit
 * is generous enough that real browsing never meets it.
 */
export async function loadMoreFundingRounds(
  params: FundingSearchParams,
  page: number,
): Promise<LoadMoreResult> {
  const ip = await clientIp();
  const limit = await checkRateLimit("loadMore", `ip:${ip}`);
  if (!limit.ok) return { ok: false, error: limit.message };

  const requested = Number(page);
  if (!Number.isInteger(requested) || requested < 2 || requested > 500) {
    return { ok: false, error: "Invalid page." };
  }

  const filters = { ...parseFundingFilters(params), page: requested };

  try {
    const feed = await getFundingFeed(filters);
    return { ok: true, rounds: feed.rounds, hasMore: feed.hasMore };
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "funding_load_more_failed",
        message: error instanceof Error ? error.message : "unknown",
        at: new Date().toISOString(),
      }),
    );
    return { ok: false, error: "Could not load more funding rounds." };
  }
}

/*
 * Only the type is re-exported, and only because types are erased at compile
 * time. A `"use server"` module may export nothing but async functions — a
 * runtime constant here (the page size, say) is a build error, and it belongs
 * in `lib/funding/constants.ts` with the rest of the client-safe vocabulary
 * anyway.
 */
export type { FundingRoundRow };
