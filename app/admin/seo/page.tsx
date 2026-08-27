/* Admin-only SEO audit.
 *
 * Deliberately a read-only page of counts rather than a dashboard. Everything
 * here is derived from the same helpers the live pages use — `isIndexableProduct`
 * and the collection thresholds — so it reports what the site will actually do,
 * not a second opinion about it. A separate implementation of "is this page
 * indexable?" would eventually disagree with the pages themselves, which is
 * worse than having no audit at all.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { Search } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Numeric } from "@/components/ui/typography";
import { getIsAdmin } from "@/lib/admin";
import { COLLECTIONS, MIN_PRODUCTS_TO_INDEX } from "@/lib/collections";
import { CATEGORIES } from "@/lib/constants";
import { isIndexableProduct } from "@/lib/seo";
import { getSeoAuditProducts } from "@/services/admin";
import { getCategoryCounts, getCollectionCounts } from "@/services/products";

export const metadata = {
  title: "SEO audit",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function SeoAuditPage() {
  const { userId } = await auth();
  if (!userId) redirect("/login");
  if (!(await getIsAdmin())) redirect("/");

  const [products, categoryCounts, collectionCounts] = await Promise.all([
    getSeoAuditProducts(),
    getCategoryCounts(),
    getCollectionCounts(
      COLLECTIONS.map((collection) => ({ slug: collection.slug, ...collection.filter })),
    ),
  ]);

  const indexable = products.filter(isIndexableProduct);
  const thin = products.filter((product) => !isIndexableProduct(product));
  const missingDescription = products.filter(
    (product) => (product.description ?? "").trim().length < 120,
  );
  const missingImage = products.filter(
    (product) => !product.hero_image_url && (product.screenshot_urls ?? []).length === 0,
  );

  // Two products sharing a name produce two pages competing for one query.
  const nameCounts = new Map<string, number>();
  for (const product of products) {
    const key = product.name.trim().toLowerCase();
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }
  const duplicateNames = [...nameCounts.entries()].filter(([, count]) => count > 1);

  const liveCategories = CATEGORIES.filter((category) => (categoryCounts[category.name] ?? 0) > 0);
  const emptyCategories = CATEGORIES.filter(
    (category) => (categoryCounts[category.name] ?? 0) === 0,
  );
  const liveCollections = COLLECTIONS.filter(
    (collection) => (collectionCounts[collection.slug] ?? 0) >= MIN_PRODUCTS_TO_INDEX,
  );
  const thinCollections = COLLECTIONS.filter(
    (collection) =>
      (collectionCounts[collection.slug] ?? 0) > 0 &&
      (collectionCounts[collection.slug] ?? 0) < MIN_PRODUCTS_TO_INDEX,
  );
  const emptyCollections = COLLECTIONS.filter(
    (collection) => (collectionCounts[collection.slug] ?? 0) === 0,
  );

  // Static routes that are indexable by their own metadata, counted by hand
  // because there is nothing to derive them from — they are literal files.
  const STATIC_INDEXABLE = [
    "/",
    "/marketplace",
    "/categories",
    "/collections",
    "/blog",
    "/faq",
    "/advertise",
  ];

  const indexableTotal =
    STATIC_INDEXABLE.length + liveCategories.length + liveCollections.length + indexable.length;

  const cards = [
    { label: "Indexable pages", value: indexableTotal },
    { label: "Published products", value: products.length },
    { label: "Thin products (noindex)", value: thin.length },
    { label: "Live collections", value: liveCollections.length },
  ];

  return (
    <main className="min-h-dvh bg-background py-12 md:py-16">
      <Container>
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Search className="size-5" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-ink">SEO audit</h1>
              <p className="text-sm text-muted">
                Live counts, from the same rules the pages themselves apply.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {cards.map((card) => (
              <div key={card.label} className="rounded-xl border border-border bg-card p-4">
                <div className="text-2xl font-bold text-ink">
                  <Numeric>{card.value}</Numeric>
                </div>
                <div className="text-xs text-muted">{card.label}</div>
              </div>
            ))}
          </div>

          <Panel title="Products">
            <Row
              label="Indexable"
              value={`${indexable.length} of ${products.length}`}
              tone={indexable.length === products.length ? "ok" : "warn"}
            />
            <Row
              label="Description under 120 characters"
              value={missingDescription.length}
              tone={missingDescription.length === 0 ? "ok" : "warn"}
              detail={missingDescription.slice(0, 8).map((p) => p.slug)}
            />
            <Row
              label="No hero image or screenshot"
              value={missingImage.length}
              tone={missingImage.length === 0 ? "ok" : "warn"}
              detail={missingImage.slice(0, 8).map((p) => p.slug)}
            />
            <Row
              label="Duplicate product names"
              value={duplicateNames.length}
              tone={duplicateNames.length === 0 ? "ok" : "warn"}
              detail={duplicateNames.slice(0, 8).map(([name, count]) => `${name} ×${count}`)}
            />
          </Panel>

          <Panel title="Categories">
            <Row label="With products (indexable)" value={liveCategories.length} tone="ok" />
            <Row
              label="Empty (noindex, absent from sitemap)"
              value={emptyCategories.length}
              tone={emptyCategories.length === 0 ? "ok" : "warn"}
              detail={emptyCategories.map((c) => c.slug)}
            />
          </Panel>

          <Panel title={`Collections (threshold: ${MIN_PRODUCTS_TO_INDEX} products)`}>
            <Row label="Indexable and in the sitemap" value={liveCollections.length} tone="ok" />
            <Row
              label="Below threshold (renders, noindex)"
              value={thinCollections.length}
              tone="info"
              detail={thinCollections.map((c) => `${c.slug} (${collectionCounts[c.slug] ?? 0})`)}
            />
            <Row
              label="Empty (404)"
              value={emptyCollections.length}
              tone="info"
              detail={emptyCollections.map((c) => c.slug)}
            />
          </Panel>

          <p className="text-xs text-muted">
            Counts describe what this site declares, not what any search engine has done with it.
            Whether a page is actually indexed is only visible in{" "}
            <Link
              href="https://search.google.com/search-console"
              className="text-primary hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Search Console
            </Link>
            .
          </p>
        </div>
      </Container>
    </main>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <h2 className="border-b border-border px-4 py-3 text-sm font-semibold text-ink">{title}</h2>
      <div className="divide-y divide-border">{children}</div>
    </section>
  );
}

function Row({
  label,
  value,
  tone,
  detail,
}: {
  label: string;
  value: string | number;
  tone: "ok" | "warn" | "info";
  detail?: string[];
}) {
  const dot = tone === "ok" ? "bg-success" : tone === "warn" ? "bg-amber-500" : "bg-border";

  return (
    <div className="flex flex-col gap-1 px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <span className="flex items-center gap-2 text-sm text-body">
          <span className={`size-1.5 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
          {label}
        </span>
        <span className="text-sm font-semibold text-ink">
          <Numeric>{String(value)}</Numeric>
        </span>
      </div>
      {detail && detail.length > 0 && (
        <p className="pl-3.5 text-xs break-words text-muted">{detail.join(", ")}</p>
      )}
    </div>
  );
}
