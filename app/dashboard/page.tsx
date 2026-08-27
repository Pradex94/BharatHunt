/* Maker dashboard — the counterpart to /admin. Shows a signed-in maker only
 * their own launches, with the numbers that matter and the actions to manage
 * them. Ownership comes from the Clerk session, and the products RLS policy
 * ("published OR you're the creator") is the backstop. */

import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { ArrowUpRight, Clock, Eye, MessageSquare, Package, Plus, TrendingUp } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Numeric } from "@/components/ui/typography";
import { buttonVariants } from "@/components/ui/button";
import { DeleteProductButton } from "@/components/products/delete-product-button";
import { SubmitForReviewButton } from "@/components/products/submit-for-review-button";
import { ProductLogo } from "@/components/products/product-logo";
import { getProductsByCreator, type MakerProduct } from "@/services/products";
import { getIsAdmin } from "@/lib/admin";
import { MAX_PRODUCTS_PER_USER, PRICING_TYPE_LABELS } from "@/lib/constants";
import { isIndexableProduct } from "@/lib/seo";
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
  pending: "bg-primary/10 text-primary",
  draft: "bg-secondary-bg text-muted",
  archived: "bg-amber-100 text-amber-700",
};

/*
 * The database's words are not the maker's words. "pending" reads like
 * something went wrong; "in review" says who has it and that it is moving.
 */
const STATUS_LABEL: Record<string, string> = {
  pending: "in review",
  draft: "draft — not submitted",
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string }>;
}) {
  const { submitted } = await searchParams;
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
    <main className="min-h-dvh bg-background py-12 md:py-16">
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

          {/* Straight off the submit form — the launch is stored, not live. */}
          {submitted && (
            <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3.5">
              <Clock className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-ink">Submitted for review</p>
                <p className="mt-0.5 text-sm text-body">
                  A human reads every launch before it goes live. We&apos;ll email you the moment
                  it&apos;s published — usually within a day.
                </p>
              </div>
            </div>
          )}

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
      <ProductLogo src={product.hero_image_url} name={product.name} size="sm" />

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
              {STATUS_LABEL[product.status] ?? product.status}
            </span>
          )}
        </div>
        <p className="mt-0.5 line-clamp-1 text-sm text-body">{product.tagline}</p>
        <p className="mt-1 text-xs text-muted">
          {product.category}
          {pricing ? ` · ${pricing}` : ""} · Launched {launched}
        </p>

        {/*
         * The SEO problem the maker can actually solve, said where they will
         * see it. A published listing this thin carries `noindex` — it is on
         * the site but invisible to search — and until now nothing told them
         * that, so the only person who could fix it never knew. The rule is
         * `isIndexableProduct`, the same one the page and the sitemap use, so
         * this notice disappears the moment it stops being true.
         */}
        {product.status === "published" && !isIndexableProduct(product) && (
          <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
            Not indexed by search engines yet — the description is too short.{" "}
            <Link
              href={`/products/${product.slug}/edit`}
              className="font-semibold underline underline-offset-2"
            >
              Add a couple of sentences
            </Link>{" "}
            about what it does and who it is for, and it becomes searchable on its own.
          </p>
        )}
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
        {/* Only a published product has a public page; the others would 404. */}
        {product.status === "published" && (
          <Link
            href={`/products/${product.slug}`}
            className="flex items-center gap-1 text-sm text-body transition-colors hover:text-primary"
          >
            View <ArrowUpRight size={14} />
          </Link>
        )}
        {product.status === "draft" && <SubmitForReviewButton productId={product.id} />}
        <Link
          href={`/products/${product.slug}/edit`}
          className="text-sm text-primary transition-colors hover:underline"
        >
          Edit
        </Link>
        {/* redirectTo={null} keeps the maker here; the row just disappears. */}
        <DeleteProductButton productId={product.id} productName={product.name} redirectTo={null} />
      </div>
    </div>
  );
}
