/**
 * Where to link a product row, given its status and who is looking.
 *
 * `/products/[slug]` is a published-only page, twice over: the page loads its
 * row with `getPublishedProductBySlug`, which filters `status = 'published'`,
 * and the products RLS SELECT policy is `status = 'published' OR creator =
 * caller`, so the user-scoped client cannot see another maker's unpublished row
 * at all. Admin is an application-level idea (an email allowlist in Clerk) that
 * Postgres knows nothing about, so being an admin does not widen that policy.
 *
 * Both the admin table and the maker dashboard list every status, so a title
 * linked straight at the public page is a guaranteed 404 on anything in review.
 * That is what this exists to prevent — it is deliberately the only place that
 * decides, so the rule cannot be half-applied to one link in a file and not the
 * one twenty lines below it, which is exactly how it broke.
 *
 * Framework-agnostic on purpose (no `next/*` imports), so `tests/` can cover it
 * without a database or a running app.
 */

/** The fields a link needs. Any row carrying them will do. */
export type ProductRowLink = {
  id: string;
  slug: string;
  status: string;
};

/**
 * Who is looking. An admin sees other people's products and can decide on
 * them; a maker only ever sees their own.
 */
export type ProductViewer = "admin" | "maker";

/**
 * The destination for a product row's title link.
 *
 * - **Published** — the public page, for everyone.
 * - **Pending, admin** — the review screen, which is where approve and send
 *   back actually live. This is the click that used to 404.
 * - **Anything else** — the edit form, which both a creator and an admin can
 *   open at any status (the admin reads it service-role, reaching drafts).
 *
 * Unknown statuses fall through to the edit form deliberately: only
 * `'published'` earns a public link, so a status added by a later migration
 * cannot start advertising a page that does not exist.
 */
export function productRowHref(product: ProductRowLink, viewer: ProductViewer): string {
  const slug = encodeURIComponent(product.slug);

  if (product.status === "published") {
    return `/products/${slug}`;
  }
  if (viewer === "admin" && product.status === "pending") {
    return `/admin/review/${encodeURIComponent(product.id)}`;
  }
  return `/products/${slug}/edit`;
}

/**
 * Whether a row has a public page at all — the same rule, for callers deciding
 * whether to render a "View" link rather than where to point one.
 */
export function hasPublicPage(status: string): boolean {
  return status === "published";
}
