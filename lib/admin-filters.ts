/**
 * The admin product table's filters, as pure functions.
 *
 * Framework-agnostic on purpose (no `next/*`, no Supabase, no `server-only`),
 * like lib/product-links.ts: both halves of a URL filter — narrowing an
 * untrusted status and defusing a search term — are exactly the kind of thing
 * that should be covered by `tests/` without a database or a running app.
 */

/** The statuses a product row can hold, in the order the admin filters read. */
export const ADMIN_PRODUCT_STATUSES = ["pending", "published", "draft", "archived"] as const;

export type AdminProductStatus = (typeof ADMIN_PRODUCT_STATUSES)[number];

/**
 * Narrows an untrusted query string to a status the database actually stores.
 *
 * The result is interpolated into a query, so an unrecognised value has to
 * become `null` — "no filter" — rather than being passed through and trusted to
 * match nothing.
 */
export function asAdminProductStatus(value: string | undefined | null): AdminProductStatus | null {
  return ADMIN_PRODUCT_STATUSES.find((status) => status === value) ?? null;
}

/**
 * A search term, reduced to what can be dropped into a PostgREST `or` filter.
 *
 * That filter is parsed as a comma-separated list of `column.op.value` triples,
 * so a comma, a parenthesis or a quote in the term is grammar rather than text
 * and rewrites the query — `a,id.gt.0` would match every row. `%` and `_` are
 * `ilike` wildcards. None of them are worth supporting in an admin search box,
 * so they are replaced by spaces, and the term is capped so a pasted essay
 * cannot become the query.
 */
export function sanitizeAdminSearch(value: string | undefined | null): string {
  return (value ?? "")
    .replace(/[,()"'%_*\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
    .trim();
}

/** The admin table's URL for a given filter pair, so neither half drops the other. */
export function adminProductsHref(status: AdminProductStatus | null, q: string): string {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (q) params.set("q", q);
  const query = params.toString();
  return query ? `/admin?${query}` : "/admin";
}
