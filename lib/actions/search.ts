"use server";

import { createClient, createPublicClient } from "@/lib/supabase/server";
import { checkRateLimitByIp } from "@/lib/rate-limit";
import { PRODUCT_CATEGORIES, slugForCategory } from "@/lib/constants";
import {
  EMPTY_SUGGESTIONS,
  entityNamePattern,
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
 * queries too short to be meaningful, and every query is `limit`ed. Categories
 * are matched in memory against the static taxonomy, so they cost nothing.
 *
 * One request per settled query covers every group — products, makers, AI
 * entities, funded startups and investors. The browser never fans out to five
 * sources; this action does, in parallel, against indexed columns
 * (`normalized_name` carries a trigram index on the AI and investor tables, and
 * the startup table is small). Each group fails soft to empty on its own.
 */
export async function fetchSearchSuggestions(query: string): Promise<SearchSuggestions> {
  const empty: SearchSuggestions = EMPTY_SUGGESTIONS;

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
  // The funding and AI tables are public-by-policy and identical for every
  // visitor, so they are read without the Clerk token.
  const publicClient = createPublicClient();
  const normalized = normalizeSearchText(term);
  const entityPattern = entityNamePattern(term);

  const [productResult, makerResult, aiResult, startupResult, investorResult] = await Promise.all([
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
    entityPattern
      ? publicClient
          .from("ai_entities")
          .select("name, slug, entity_type")
          .in("entity_type", ["company", "model", "tool"])
          .ilike("normalized_name", entityPattern)
          .order("last_seen_at", { ascending: false })
          .limit(3)
      : null,
    entityPattern
      ? publicClient
          .from("funding_startups")
          .select("name, slug, industry")
          .ilike("normalized_name", entityPattern)
          .order("last_round_at", { ascending: false, nullsFirst: false })
          .limit(3)
      : null,
    entityPattern
      ? publicClient
          .from("funding_investors")
          .select("name, slug, published_deal_count")
          .ilike("normalized_name", entityPattern)
          .order("published_deal_count", { ascending: false })
          .limit(3)
      : null,
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

  const ai = (aiResult?.data ?? []).map((row) => ({
    name: row.name,
    slug: row.slug,
    type: row.entity_type,
  }));

  const startups = (startupResult?.data ?? []).map((row) => ({
    name: row.name,
    slug: row.slug,
    industry: row.industry,
  }));

  const investors = (investorResult?.data ?? []).map((row) => ({
    name: row.name,
    slug: row.slug,
    deal_count: Number(row.published_deal_count ?? 0),
  }));

  return { products, categories, makers, ai, startups, investors };
}
