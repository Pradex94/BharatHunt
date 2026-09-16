import Link from "next/link";
import { Search } from "lucide-react";

import { DeleteProductButton } from "@/components/products/delete-product-button";
import { Numeric } from "@/components/ui/typography";
import { adminProductsHref, type AdminProductStatus } from "@/lib/admin-filters";
import { productRowHref } from "@/lib/product-links";
import type { AdminProductCounts, AdminProductRow } from "@/services/admin";

/**
 * Every product on the site, filtered by the URL.
 *
 * A server component with no state of its own: the filter chips are links and
 * the search box is a plain GET form, so the whole panel is a URL. That is what
 * makes a filtered view shareable between admins and survivable across a
 * reload, and it is the same URL-as-state rule the marketplace follows.
 */

const STATUS_BADGE: Record<string, string> = {
  published: "bg-success/10 text-success",
  pending: "bg-primary/10 text-primary",
  draft: "bg-secondary-bg text-muted",
  archived: "bg-amber-100 text-amber-700",
};

/** "pending" is the database's word for it; "in review" is the human's. */
const STATUS_LABEL: Record<string, string> = { pending: "in review" };

/** How many rows one response may carry. The filters exist to get under it. */
export const ADMIN_ROW_LIMIT = 200;

type StatusFilter = { value: AdminProductStatus | null; label: string; count: number };

function statusFilters(counts: AdminProductCounts): StatusFilter[] {
  return [
    { value: null, label: "All", count: counts.total },
    { value: "pending", label: "In review", count: counts.pending },
    { value: "published", label: "Published", count: counts.published },
    { value: "draft", label: "Drafts", count: counts.draft },
    { value: "archived", label: "Archived", count: counts.archived },
  ];
}

/** Relative age, because "3d ago" is the thing an admin is actually judging. */
export function addedAgo(value: string | null): string {
  if (!value) return "just now";
  const added = new Date(value).getTime();
  if (Number.isNaN(added)) return "just now";

  const minutes = Math.max(0, Math.round((Date.now() - added) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function AdminProductsPanel({
  products,
  counts,
  status,
  q,
}: {
  products: AdminProductRow[];
  counts: AdminProductCounts;
  status: AdminProductStatus | null;
  q: string;
}) {
  const filters = statusFilters(counts);
  const heading = status ? filters.find((filter) => filter.value === status)?.label : "All products";
  const filtering = Boolean(status || q);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink">{heading}</h2>

          {/* A plain GET form: the filter is a URL, so searching needs no
              JavaScript and the result can be bookmarked or sent on. The
              status rides along in a hidden field, so searching inside
              "In review" stays inside it. */}
          {/* Full width on a phone, where sharing the heading's row left the
              box too narrow to read a product name in. */}
          <form action="/admin" method="get" className="flex w-full items-center gap-2 sm:w-auto">
            {status && <input type="hidden" name="status" value={status} />}
            <label htmlFor="admin-search" className="sr-only">
              Search products by name, slug or tagline
            </label>
            <div className="relative flex-1 sm:flex-none">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
                aria-hidden="true"
              />
              <input
                id="admin-search"
                name="q"
                type="search"
                defaultValue={q}
                placeholder="Search products…"
                className="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm text-ink placeholder:text-muted focus:border-primary/40 focus:outline-none sm:w-56"
              />
            </div>
            <button
              type="submit"
              className="h-10 shrink-0 rounded-md border border-border px-3 text-sm font-semibold text-ink transition-colors hover:border-primary/30 hover:bg-secondary-bg"
            >
              Search
            </button>
          </form>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {filters.map((filter) => {
            const active = filter.value === status;
            return (
              <Link
                key={filter.label}
                href={adminProductsHref(filter.value, q)}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors ${
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-body hover:border-primary/30 hover:bg-secondary-bg"
                }`}
              >
                {filter.label}
                <Numeric className="text-[11px] opacity-70">{filter.count}</Numeric>
              </Link>
            );
          })}
          {q && (
            <Link
              href={adminProductsHref(status, "")}
              className="text-xs font-medium text-primary hover:underline"
            >
              Clear “{q}”
            </Link>
          )}
          <span className="ml-auto text-xs text-muted">
            <Numeric>{products.length}</Numeric> shown
            {products.length === ADMIN_ROW_LIMIT ? ` · first ${ADMIN_ROW_LIMIT}, search to narrow` : ""}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted">
              <th className="px-4 py-2.5 font-medium">Product</th>
              <th className="px-4 py-2.5 font-medium">Maker</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Added</th>
              <th className="px-4 py-2.5 text-right font-medium">Votes</th>
              <th className="px-4 py-2.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id} className="border-b border-border/60 last:border-0">
                <td className="px-4 py-2.5">
                  {/* Only a live product has a public page. This table lists
                      every status, so a row in review linked straight at
                      /products/[slug] sent the reviewer to a 404 instead of to
                      the decision. */}
                  <Link
                    href={productRowHref(product, "admin")}
                    className="font-medium text-ink hover:text-primary"
                  >
                    {product.name}
                  </Link>
                  <div className="text-xs text-muted">{product.category}</div>
                </td>
                <td className="px-4 py-2.5 text-muted">{product.creator?.display_name ?? "—"}</td>
                <td className="px-4 py-2.5">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      STATUS_BADGE[product.status] ?? "bg-secondary-bg text-muted"
                    }`}
                  >
                    {STATUS_LABEL[product.status] ?? product.status}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted">
                  {addedAgo(product.created_at)}
                </td>
                <td className="px-4 py-2.5 text-right text-muted">
                  <Numeric>{product.upvote_count ?? 0}</Numeric>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center justify-end gap-3">
                    <Link
                      href={`/products/${product.slug}/edit`}
                      className="text-primary hover:underline"
                    >
                      Edit
                    </Link>
                    {/* redirectTo={null} keeps the admin on this page — the
                        revalidated table just drops the row. */}
                    <DeleteProductButton
                      productId={product.id}
                      productName={product.name}
                      redirectTo={null}
                    />
                  </div>
                </td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">
                  {filtering ? (
                    <>
                      Nothing matches that filter.{" "}
                      <Link href="/admin" className="text-primary hover:underline">
                        Show every product
                      </Link>
                    </>
                  ) : (
                    "No products yet."
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
