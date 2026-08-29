import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { Clock, ShieldCheck } from "lucide-react";

import { getIsAdmin } from "@/lib/admin";
import { getAllProductsAdmin, getPendingProductsAdmin, type PendingProductRow } from "@/services/admin";
import { getPlatformStats } from "@/services/products";
import { Container } from "@/components/ui/container";
import { Numeric } from "@/components/ui/typography";
import { DeleteProductButton } from "@/components/products/delete-product-button";
import { ReviewActions } from "@/components/admin/review-actions";
import { indiaStateName } from "@/lib/india-states";

export const metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

// Reads the signed-in identity — never prerender.
export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  published: "bg-success/10 text-success",
  pending: "bg-primary/10 text-primary",
  draft: "bg-secondary-bg text-muted",
  archived: "bg-amber-100 text-amber-700",
};

/** "pending" is the database's word for it; "in review" is the human's. */
const STATUS_LABEL: Record<string, string> = { pending: "in review" };

function submittedAgo(value: string | null): string {
  if (!value) return "just now";
  const submitted = new Date(value).getTime();
  if (Number.isNaN(submitted)) return "just now";

  const minutes = Math.max(0, Math.round((Date.now() - submitted) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default async function AdminPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/login");
  }
  if (!(await getIsAdmin())) {
    redirect("/");
  }

  const [products, pending, stats] = await Promise.all([
    getAllProductsAdmin(),
    getPendingProductsAdmin(),
    getPlatformStats(),
  ]);

  const statCards = [
    { label: "Products", value: stats.products },
    { label: "Makers", value: stats.makers },
    { label: "Upvotes", value: stats.upvotes },
  ];

  return (
    <main className="min-h-dvh bg-background py-12 md:py-16">
      <Container>
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ShieldCheck className="size-5" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-ink">Admin dashboard</h1>
              <p className="text-sm text-muted">
                Review every launch · moderate any product · unlimited launches.
              </p>
            </div>
          </div>

          {/* Stats */}
          {/* Three columns on a 320px screen left ~50px per figure, which a
              four-digit count does not fit. Two up on a phone, three from
              `sm` — the desktop layout is the same as it was. */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {statCards.map((card) => (
              <div key={card.label} className="rounded-xl border border-border bg-card p-4">
                <div className="text-2xl font-bold text-ink">
                  <Numeric>{card.value.toLocaleString()}</Numeric>
                </div>
                <div className="text-xs text-muted">{card.label}</div>
              </div>
            ))}
          </div>

          {/* Review queue */}
          <ReviewQueue pending={pending} />

          {/* Product table */}
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-ink">All products</h2>
              <span className="text-xs text-muted">
                <Numeric>{products.length}</Numeric> shown
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted">
                    <th className="px-4 py-2.5 font-medium">Product</th>
                    <th className="px-4 py-2.5 font-medium">Maker</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 text-right font-medium">Votes</th>
                    <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <tr key={product.id} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/products/${product.slug}`}
                          className="font-medium text-ink hover:text-primary"
                        >
                          {product.name}
                        </Link>
                        <div className="text-xs text-muted">{product.category}</div>
                      </td>
                      <td className="px-4 py-2.5 text-muted">
                        {product.creator?.display_name ?? "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            STATUS_BADGE[product.status] ?? "bg-secondary-bg text-muted"
                          }`}
                        >
                          {STATUS_LABEL[product.status] ?? product.status}
                        </span>
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
                          {/* redirectTo={null} keeps the admin on this page —
                              the revalidated table just drops the row. */}
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
                      <td colSpan={5} className="px-4 py-8 text-center text-muted">
                        No products yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Container>
    </main>
  );
}

/**
 * The queue, above everything else on the page.
 *
 * It sits at the top because it is the only section with a deadline: a maker
 * who submitted is waiting, and every other number on this page can be read
 * tomorrow. When it is empty it says so and stays out of the way.
 */
function ReviewQueue({ pending }: { pending: PendingProductRow[] }) {
  if (pending.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5">
        <Clock className="size-4 shrink-0 text-muted" aria-hidden="true" />
        <p className="text-sm text-muted">
          Nothing waiting for review. New launches land here and email you.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-primary/30 bg-card">
      <div className="flex items-center justify-between border-b border-border bg-primary/5 px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Clock className="size-4 text-primary" aria-hidden="true" />
          Waiting for review
        </h2>
        <span className="text-xs text-muted">
          <Numeric>{pending.length}</Numeric> queued
        </span>
      </div>

      <ul className="divide-y divide-border">
        {pending.map((product) => {
          const state = indiaStateName(product.launch_state);
          return (
            <li key={product.id} className="flex flex-col gap-3 px-4 py-4">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="font-semibold text-ink">{product.name}</span>
                <span className="text-xs text-muted">
                  {product.category}
                  {state ? ` · ${state}` : ""} · by {product.creator?.display_name ?? "unknown"} ·{" "}
                  {submittedAgo(product.created_at)}
                </span>
              </div>
              <p className="text-sm text-body">{product.tagline}</p>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <Link
                  href={`/products/${product.slug}/edit`}
                  className="text-primary hover:underline"
                >
                  Open full submission
                </Link>
                {product.website_url && (
                  <a
                    href={product.website_url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="text-body hover:text-primary"
                  >
                    {product.website_url.replace(/^https?:\/\//, "")}
                  </a>
                )}
              </div>

              <ReviewActions productId={product.id} productName={product.name} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
