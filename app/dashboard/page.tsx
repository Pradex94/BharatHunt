/* Maker dashboard — the counterpart to /admin. Shows a signed-in maker only
 * their own launches, with the numbers that matter and the actions to manage
 * them. Ownership comes from the Clerk session, and the products RLS policy
 * ("published OR you're the creator") is the backstop. */

import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { ArrowUpRight, Eye, MessageSquare, Package, Plus, TrendingUp } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Numeric } from "@/components/ui/typography";
import { buttonVariants } from "@/components/ui/button";
import { DeleteProductButton } from "@/components/products/delete-product-button";
import { getProductsByCreator, type MakerProduct } from "@/services/products";
import { getIsAdmin } from "@/lib/admin";
import { MAX_PRODUCTS_PER_USER, PRICING_TYPE_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Your products",
  description: "Manage the products you've launched on Bharat Hunt.",
  robots: { index: false, follow: false },
};

// Reads the signed-in identity — never prerender.
export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  published: "bg-success/10 text-success",
  draft: "bg-secondary-bg text-muted",
  archived: "bg-amber-100 text-amber-700",
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/login");
  }

  const [products, isAdmin] = await Promise.all([getProductsByCreator(userId), getIsAdmin()]);

  const totals = products.reduce(
    (sum, product) => ({
      upvotes: sum.upvotes + (product.upvote_count ?? 0),
      comments: sum.comments + (product.comment_count ?? 0),
      views: sum.views + (product.view_count ?? 0),
    }),
    { upvotes: 0, comments: 0, views: 0 },
  );

  const slotsLeft = Math.max(MAX_PRODUCTS_PER_USER - products.length, 0);
  const canLaunch = isAdmin || slotsLeft > 0;

  const stats = [
    {
      label: "Launched",
      value: isAdmin ? `${products.length}` : `${products.length}/${MAX_PRODUCTS_PER_USER}`,
      icon: Package,
    },
    { label: "Upvotes", value: totals.upvotes.toLocaleString(), icon: TrendingUp },
    { label: "Comments", value: totals.comments.toLocaleString(), icon: MessageSquare },
    { label: "Views", value: totals.views.toLocaleString(), icon: Eye },
  ];

  return (
    <main className="min-h-screen bg-background py-12 md:py-16">
      <Container>
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
          {/* Header */}
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
                Your products
              </h1>
              <p className="mt-1 text-sm text-body">
                {products.length === 0
                  ? "Everything you launch on Bharat Hunt will show up here."
                  : isAdmin
                    ? `Managing ${products.length} ${products.length === 1 ? "launch" : "launches"} — admin, no limit.`
                    : slotsLeft > 0
                      ? `${slotsLeft} launch ${slotsLeft === 1 ? "slot" : "slots"} left of ${MAX_PRODUCTS_PER_USER}.`
                      : `You've used all ${MAX_PRODUCTS_PER_USER} launch slots. Delete one to free a slot.`}
              </p>
            </div>
            {canLaunch && (
              <Link href="/submit" className={buttonVariants({ size: "sm" })}>
                <Plus size={16} /> Launch a product
              </Link>
            )}
          </div>

          {/* Totals across every launch */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stats.map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center gap-1.5 text-xs text-muted">
                    <Icon size={13} aria-hidden="true" />
                    {stat.label}
                  </div>
                  <div className="mt-1.5 text-2xl font-bold text-ink">
                    <Numeric>{stat.value}</Numeric>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Launches */}
          {products.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="flex flex-col gap-3">
              {products.map((product) => (
                <li key={product.id}>
                  <ProductRow product={product} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </Container>
    </main>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-card p-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Package className="size-6" />
      </span>
      <div>
        <h2 className="text-lg font-bold text-ink">No launches yet</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-body">
          Share what you&apos;ve built with the Bharat Hunt community. It only takes a few minutes,
          and you can edit everything afterwards.
        </p>
      </div>
      <Link href="/submit" className={buttonVariants()}>
        <Plus size={16} /> Launch your first product
      </Link>
    </div>
  );
}

function ProductRow({ product }: { product: MakerProduct }) {
  const pricing = PRICING_TYPE_LABELS[product.pricing_type as keyof typeof PRICING_TYPE_LABELS];
  const launched = formatDate(product.published_at ?? product.created_at);

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center">
      {/* Logo */}
      <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-secondary-bg text-lg font-semibold text-muted">
        {product.hero_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.hero_image_url} alt="" className="size-full object-cover" />
        ) : (
          product.name.slice(0, 1).toUpperCase()
        )}
      </div>

      {/* Identity */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/products/${product.slug}`}
            className="truncate font-semibold text-ink transition-colors hover:text-primary"
          >
            {product.name}
          </Link>
          {product.status !== "published" && (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-medium",
                STATUS_BADGE[product.status] ?? "bg-secondary-bg text-muted",
              )}
            >
              {product.status}
            </span>
          )}
        </div>
        <p className="mt-0.5 line-clamp-1 text-sm text-body">{product.tagline}</p>
        <p className="mt-1 text-xs text-muted">
          {product.category}
          {pricing ? ` · ${pricing}` : ""} · Launched {launched}
        </p>
      </div>

      {/* Performance */}
      <dl className="flex shrink-0 items-center gap-5 sm:gap-6">
        {[
          { label: "upvotes", value: product.upvote_count ?? 0, Icon: TrendingUp },
          { label: "comments", value: product.comment_count ?? 0, Icon: MessageSquare },
          { label: "views", value: product.view_count ?? 0, Icon: Eye },
        ].map(({ label, value, Icon }) => (
          <div key={label} className="flex flex-col items-center">
            <dt className="sr-only">{label}</dt>
            <dd className="flex items-center gap-1 text-sm font-semibold text-ink">
              <Icon size={13} className="text-muted" aria-hidden="true" />
              <Numeric>{value.toLocaleString()}</Numeric>
            </dd>
          </div>
        ))}
      </dl>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-3 border-t border-border pt-3 sm:border-t-0 sm:pt-0 sm:pl-2">
        <Link
          href={`/products/${product.slug}`}
          className="flex items-center gap-1 text-sm text-body transition-colors hover:text-primary"
        >
          View <ArrowUpRight size={14} />
        </Link>
        <Link
          href={`/products/${product.slug}/edit`}
          className="text-sm text-primary transition-colors hover:underline"
        >
          Edit
        </Link>
        {/* redirectTo={null} keeps the maker here; the row just disappears. */}
        <DeleteProductButton
          productId={product.id}
          productName={product.name}
          redirectTo={null}
        />
      </div>
    </div>
  );
}
