"use server";

import { createClient } from "@/lib/supabase/server";
import { checkRateLimitByIp } from "@/lib/rate-limit";
import { PRODUCT_CATEGORIES, slugForCategory } from "@/lib/constants";
import {
  isSuggestable,
  matchesNormalized,
  normalizeSearchText,
  type SearchSuggestions,
} from "@/lib/search";

/**
 * Autocomplete for the navbar search.
 *
 * Only async functions may be exported from a `"use server"` module — a type
 * re-export here becomes a runtime re-export under Turbopack and blows up at
 * request time — so `SearchSuggestions` lives in lib/search.ts.
 *
 * Cost per keystroke is capped deliberately: the client debounces, this refuses
 * queries too short to be meaningful, and both queries are `limit`ed. Categories
 * are matched in memory against the static taxonomy, so they cost nothing.
 */
export async function fetchSearchSuggestions(query: string): Promise<SearchSuggestions> {
  const empty: SearchSuggestions = { products: [], categories: [], makers: [] };

  const term = query.trim();
  if (!isSuggestable(term)) {
    return empty;
  }

  /*
   * The only unauthenticated endpoint here that reaches Postgres on every call,
   * which makes it the cheapest thing on the site to abuse. The client
   * debounces at 250ms, so a real user issues a few per minute; 60/min leaves
   * fast typists untouched while capping a script.
   *
   * Degrades to empty suggestions rather than an error: this feeds a dropdown,
   * and a silent empty list is a better failure than a red box under the input.
   */
  const limit = await checkRateLimitByIp("search");
  if (!limit.ok) {
    return empty;
  }

  const supabase = createClient();
  const normalized = normalizeSearchText(term);

  const [productResult, makerResult] = await Promise.all([
    // Same ranked function the marketplace uses, so the dropdown can never
    // disagree with the results page it leads to.
    supabase.rpc("search_products", {
      search_query: term,
      sort_mode: "relevance",
      page_limit: 5,
      page_offset: 0,
    }),
    // Public profile fields only. `search_name` is a generated normalisation of
    // display_name + username, so makers are as forgiving to search as products.
    supabase
      .from("profiles")
      .select("display_name, username")
      .ilike("search_name", `%${normalized}%`)
      .limit(3),
  ]);

  // Suggestions are a convenience; a failure should quietly show fewer
  // sections rather than break the navbar on every keystroke.
  const products = (productResult.data ?? []).map((row) => ({
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    hero_image_url: row.hero_image_url,
  }));

  const makers = (makerResult.data ?? []).map((row) => ({
    username: row.username,
    display_name: row.display_name,
  }));

  const categories = PRODUCT_CATEGORIES.filter((category) => matchesNormalized(category, term))
    .slice(0, 3)
    .map((category) => ({ name: category, slug: slugForCategory(category) ?? "" }))
    .filter((category) => category.slug);

  return { products, categories, makers };
}
