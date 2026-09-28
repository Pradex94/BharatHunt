/**
 * Shared search normalisation.
 *
 * Framework-agnostic and client-safe (see CLAUDE.md) — the navbar's
 * autocomplete imports it in the browser, the marketplace imports it on the
 * server.
 *
 * **This is a mirror of `public.search_normalize()` in
 * `supabase/migrations/20260809120000_product_search.sql` and must stay
 * identical to it.** The database does the matching; this copy exists so the
 * client can normalise things the database isn't asked about (the static
 * category list, suggestion highlighting) without a round trip. If one changes,
 * the other has to change with it — `npm run build` won't catch a divergence.
 *
 * The rule: lowercase, decompose accents, then delete everything that isn't a
 * letter or digit. That last step is the whole trick — it erases the
 * distinction between "GrowEasy", "Grow Easy", "grow-easy" and "grow_easy",
 * which all collapse to `groweasy`.
 *
 * Normalisation is for *matching only*. Product names are always displayed
 * exactly as the maker stored them.
 */

/**
 * Collapse a string to its separator-free, accent-free, lowercase form.
 *
 * ```
 * normalizeSearchText("Grow Easy")  // "groweasy"
 * normalizeSearchText("grow-easy")  // "groweasy"
 * normalizeSearchText("Café Menu")  // "cafemenu"
 * ```
 *
 * NFKD runs before the strip so an accented letter decomposes into a base
 * letter plus a combining mark; the mark is then removed and the base letter
 * survives. Without it "café" would become "caf".
 */
export function normalizeSearchText(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "");
}

/** Alias for the query side, so call sites read as intended. */
export const normalizeSearchQuery = normalizeSearchText;

/**
 * Split into normalised tokens, dropping separators and empties.
 *
 * ```
 * searchTokens("AI Marketing Copilot")  // ["ai", "marketing", "copilot"]
 * searchTokens("grow   easy")           // ["grow", "easy"]
 * ```
 */
export function searchTokens(value: string | null | undefined): string[] {
  if (!value) return [];
  // Deliberately \p{L}\p{Nd}\p{Nl} rather than the broader \p{N}: this is the
  // exact set Postgres's [:alnum:] accepts, so search_tokens() and this
  // function split identically. \p{No} (①, ²) is excluded; \p{Nl} (Ⅻ) is not.
  return value
    .split(/[^\p{L}\p{Nd}\p{Nl}]+/u)
    .map((token) => normalizeSearchText(token))
    .filter(Boolean);
}

/**
 * Below this, matching is mostly noise: a one-character query matches almost
 * every product, and trigram similarity is meaningless. The marketplace still
 * runs the query (a deliberate search deserves an answer); autocomplete waits.
 */
export const MIN_SUGGEST_LENGTH = 2;

/** Whether a query is worth firing autocomplete for. */
export function isSuggestable(query: string): boolean {
  return normalizeSearchText(query).length >= MIN_SUGGEST_LENGTH;
}

/**
 * Does `haystack` match `query` under normalisation? Used for the static
 * category list, which never goes near the database.
 *
 * Matches when the whole normalised query appears, or when every token does —
 * the same two rules the SQL uses, so client and server agree on what counts.
 */
export function matchesNormalized(haystack: string, query: string): boolean {
  const target = normalizeSearchText(haystack);
  if (!target) return false;

  const normalized = normalizeSearchText(query);
  if (normalized && target.includes(normalized)) return true;

  const tokens = searchTokens(query);
  return tokens.length > 0 && tokens.every((token) => target.includes(token));
}

/** One autocomplete section's worth of results. Kept here, not in the
 *  `"use server"` action module, where a type export becomes a runtime export. */
export type SearchSuggestions = {
  products: { slug: string; name: string; tagline: string; hero_image_url: string | null }[];
  categories: { name: string; slug: string }[];
  makers: { username: string; display_name: string }[];
  /** AI companies, models and tools the AI hub tracks (`ai_entities`). */
  ai: { name: string; slug: string; type: string }[];
  /** Funded companies (`funding_startups`), each with a public profile page. */
  startups: { name: string; slug: string; industry: string | null }[];
  /** Investors named on published rounds (`funding_investors`). */
  investors: { name: string; slug: string; deal_count: number }[];
};

export const EMPTY_SUGGESTIONS: SearchSuggestions = {
  products: [],
  categories: [],
  makers: [],
  ai: [],
  startups: [],
  investors: [],
};

/** Total number of suggestions across all sections. */
export function countSuggestions(suggestions: SearchSuggestions): number {
  return (
    suggestions.products.length +
    suggestions.categories.length +
    suggestions.makers.length +
    suggestions.ai.length +
    suggestions.startups.length +
    suggestions.investors.length
  );
}

/**
 * An `ilike` pattern for the `normalized_name` columns of the funding and AI
 * entity tables.
 *
 * Those columns are *not* `search_normalize()` output: ingestion folds names
 * with `normalizeTitle`, which keeps word breaks as single spaces ("grow easy
 * technologies"). So the query is split into the same lowercase alphanumeric
 * words and joined with wildcards — "Grow Easy" and "grow-easy" both become
 * `%grow%easy%`. Only [a-z0-9] survives, so no `%`, `_` or `,` from the user
 * ever reaches the pattern. Empty when nothing searchable is left.
 */
export function entityNamePattern(query: string): string {
  const words = query
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .slice(0, 6);
  return words.length > 0 ? `%${words.join("%")}%` : "";
}
