import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { ShieldCheck } from "lucide-react";

import { getIsAdmin } from "@/lib/admin";
import { getAllProductsAdmin } from "@/services/admin";
import { getPlatformStats } from "@/services/products";
import { Container } from "@/components/ui/container";
import { Numeric } from "@/components/ui/typography";
import { DeleteProductButton } from "@/components/products/delete-product-button";

export const metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

// Reads the signed-in identity — never prerender.
export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  published: "bg-success/10 text-success",
  draft: "bg-secondary-bg text-muted",
  archived: "bg-amber-100 text-amber-700",
};

export default async function AdminPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/login");
  }
  if (!(await getIsAdmin())) {
    redirect("/");
  }

  const [products, stats] = await Promise.all([getAllProductsAdmin(), getPlatformStats()]);

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
              <p className="text-sm text-muted">Moderate any product · unlimited launches.</p>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            {statCards.map((card) => (
              <div key={card.label} className="rounded-xl border border-border bg-card p-4">
                <div className="text-2xl font-bold text-ink">
                  <Numeric>{card.value.toLocaleString()}</Numeric>
                </div>
                <div className="text-xs text-muted">{card.label}</div>
              </div>
            ))}
          </div>

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
                          {product.status}
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
