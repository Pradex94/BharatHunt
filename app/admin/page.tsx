import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { Building2, Clock, Newspaper, Rocket, Search, ShieldCheck, Sparkles } from "lucide-react";

import { getIsAdmin } from "@/lib/admin";
import { adminProductsHref, asAdminProductStatus, sanitizeAdminSearch } from "@/lib/admin-filters";
import {
  getAdminProductCounts,
  getAllProductsAdmin,
  getPendingProductsAdmin,
  type PendingProductRow,
} from "@/services/admin";
import { getPlatformStats } from "@/services/products";
import { getPipelineStatuses, type PipelineStatus } from "@/services/pipelines";
import { DAILY_RUN_LABEL } from "@/lib/pipeline-sweep";
import { PipelineRunner, type PipelineCard } from "@/components/admin/pipeline-runner";
import { Container } from "@/components/ui/container";
import { Numeric } from "@/components/ui/typography";
import { AdminProductsPanel, ADMIN_ROW_LIMIT, addedAgo } from "@/components/admin/products-panel";
import { ReviewActions } from "@/components/admin/review-actions";
import { indiaStateName } from "@/lib/india-states";

export const metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

// Reads the signed-in identity — never prerender.
export const dynamic = "force-dynamic";

/** The other admin screens, so none of them is reachable only by typing a URL. */
const TOOLS = [
  { href: "/admin/launch-agent", label: "Launch platforms", icon: Rocket },
  { href: "/admin/ai-news", label: "AI news", icon: Sparkles },
  { href: "/admin/funding", label: "Funding", icon: Newspaper },
  { href: "/admin/investors", label: "Investors", icon: Building2 },
  { href: "/admin/seo", label: "SEO audit", icon: Search },
] as const;

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) {
    redirect("/login");
  }
  if (!(await getIsAdmin())) {
    redirect("/");
  }

  // The table's state lives in the URL, like every other list on this site, so
  // a filtered view is a link an admin can keep or send to the other admin.
  const params = await searchParams;
  const status = asAdminProductStatus(params.status);
  // Sanitised here too, not only in the query, so the term the page echoes back
  // in the box and in the "Clear" link is the term it actually searched for.
  const q = sanitizeAdminSearch(params.q);

  const [products, pending, stats, counts, pipelines] = await Promise.all([
    getAllProductsAdmin({ status, q, limit: ADMIN_ROW_LIMIT }),
    getPendingProductsAdmin(),
    getPlatformStats(),
    getAdminProductCounts(),
    getPipelineStatuses(),
  ]);

  const pipelineCard = (
    key: PipelineCard["key"],
    label: string,
    manageHref: string,
    status: PipelineStatus,
  ): PipelineCard => ({
    key,
    label,
    manageHref,
    lastFetchLabel: status.lastFetchAt ? addedAgo(status.lastFetchAt) : null,
    enabledSources: status.enabledSources,
    failingSources: status.failingSources,
  });

  /*
   * "Products" counts published rows, not every row — it is the same number the
   * public site reports, and it sits beside makers and upvotes, which are also
   * published-only. Drafts and submissions are counted on the chips below,
   * where they mean something an admin can act on.
   */
  const statCards = [
    { label: "Published", value: counts.published, href: adminProductsHref("published", "") },
    { label: "Makers", value: stats.makers, href: null },
    { label: "Upvotes", value: stats.upvotes, href: null },
    { label: "In review", value: counts.pending, href: adminProductsHref("pending", "") },
  ];

  return (
    <main className="min-h-dvh bg-background py-12 md:py-16">
      <Container>
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <ShieldCheck className="size-5" />
              </span>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-ink">Admin dashboard</h1>
                <p className="text-sm text-muted">
                  Review every launch · moderate any product · your own launches publish instantly.
                </p>
              </div>
            </div>

            {/* Each dataset is managed on its own screen — fifteen investor
                fields, or an ingestion pipeline with its own source table and
                ingestion controls, do not belong beside a launch queue. */}
            <div className="flex flex-wrap items-center gap-2">
              {TOOLS.map((tool) => (
                <Link
                  key={tool.href}
                  href={tool.href}
                  className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-semibold text-ink transition-colors hover:border-primary/30 hover:bg-secondary-bg"
                >
                  <tool.icon className="size-4" aria-hidden="true" />
                  {tool.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Stats */}
          {/* Three columns on a 320px screen left ~50px per figure, which a
              four-digit count does not fit. Two up on a phone, four from
              `sm`. The two that a filter can act on are links to that filter. */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {statCards.map((card) => {
              const body = (
                <>
                  <div className="text-2xl font-bold text-ink">
                    <Numeric>{card.value.toLocaleString()}</Numeric>
                  </div>
                  <div className="text-xs text-muted">{card.label}</div>
                </>
              );
              return card.href ? (
                <Link
                  key={card.label}
                  href={card.href}
                  className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30 hover:bg-secondary-bg"
                >
                  {body}
                </Link>
              ) : (
                <div key={card.label} className="rounded-xl border border-border bg-card p-4">
                  {body}
                </div>
              );
            })}
          </div>

          {/* Review queue */}
          <ReviewQueue pending={pending} />

          {/* Ingestion runs once a day on its own; this is the manual trigger
              for the rest of the day. Below the queue, which has a person
              waiting on it; above the table, which is reference. */}
          <PipelineRunner
            scheduleLabel={DAILY_RUN_LABEL}
            pipelines={[
              pipelineCard("ai", "AI Trends", "/admin/ai-news", pipelines.ai),
              pipelineCard("funding", "Funding", "/admin/funding", pipelines.funding),
            ]}
          />

          {/* Product table */}
          <AdminProductsPanel products={products} counts={counts} status={status} q={q} />
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
                  {addedAgo(product.created_at)}
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
