/* Admin-only Product Intelligence dashboard.
 *
 * What the indexer and the signal job have done, how people use discovery
 * (Product Match, search, saves, comparisons, collections), and where the
 * concept lexicon is missing words people actually search for. Every number
 * comes from a table — nothing estimated, nothing sampled except the cache
 * hit rate, which says so.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import { Container } from "@/components/ui/container";
import { Numeric } from "@/components/ui/typography";
import { IntelligenceActions } from "@/components/admin/intelligence-actions";
import { getIsAdmin } from "@/lib/admin";
import { formatDate } from "@/lib/format-date";
import { getIntelligenceStatus, type SignalTotals } from "@/services/intelligence-admin";

export const metadata = {
  title: "Product Intelligence",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function Stat({ label, value, note }: { label: string; value: number | string; note?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4">
      <span className="text-xs font-medium text-muted">{label}</span>
      <span className="text-2xl font-bold text-ink">{typeof value === "number" ? <Numeric>{value}</Numeric> : value}</span>
      {note && <span className="text-xs text-muted">{note}</span>}
    </div>
  );
}

function Panel({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        {note && <p className="text-sm text-muted">{note}</p>}
      </div>
      {children}
    </section>
  );
}

function RankList({ items, unit, empty }: { items: { slug: string; name: string; value: number }[]; unit: string; empty: string }) {
  return (
    <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
      {items.length === 0 && <li className="p-3 text-sm text-muted">{empty}</li>}
      {items.map((item) => (
        <li key={item.slug} className="flex justify-between gap-3 p-3 text-sm">
          <Link href={`/products/${item.slug}`} className="truncate text-ink hover:text-primary">
            {item.name}
          </Link>
          <span className="shrink-0 text-muted">
            <Numeric>{Math.round(item.value * 10) / 10}</Numeric> {unit}
          </span>
        </li>
      ))}
    </ul>
  );
}

function QueryList({ items, empty, readAs }: { items: { query: string; searches: number; readAs?: string[] }[]; empty: string; readAs?: boolean }) {
  return (
    <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
      {items.length === 0 && <li className="p-3 text-sm text-muted">{empty}</li>}
      {items.map((item) => (
        <li key={item.query} className="flex items-baseline justify-between gap-3 p-3 text-sm">
          <span className="min-w-0">
            <span className="font-medium break-words text-ink">{item.query}</span>
            {readAs && (
              <span className="block text-xs text-muted">
                {item.readAs && item.readAs.length > 0 ? `Read as: ${item.readAs.join(", ")}` : "Not understood — a lexicon gap"}
              </span>
            )}
          </span>
          <Numeric className="shrink-0 text-muted">{item.searches}</Numeric>
        </li>
      ))}
    </ul>
  );
}

const SIGNAL_LABELS: [keyof SignalTotals, string][] = [
  ["visitors", "Unique visitors"],
  ["websiteClicks", "Website clicks"],
  ["saves", "Saves"],
  ["compares", "Compare adds"],
  ["matchClicks", "Match clicks"],
  ["searchClicks", "Search clicks"],
  ["upvotes", "Upvotes"],
  ["comments", "Comments"],
];

const percent = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 1000) / 10}%` : "—");

export default async function IntelligenceAdminPage() {
  const { userId } = await auth();
  if (!userId) redirect("/login");
  if (!(await getIsAdmin())) redirect("/");

  const status = await getIntelligenceStatus();
  const peak = Math.max(1, ...status.daily.map((day) => day.visitors + day.actions));
  const cacheTotal = status.cache.hits + status.cache.misses;

  return (
    <Container className="flex flex-col gap-10 py-10">
      <div className="flex flex-col gap-2">
        <Link href="/admin" className="text-sm text-primary hover:underline">
          &larr; Admin
        </Link>
        <h1 className="text-3xl">Product Intelligence</h1>
        <p className="max-w-3xl text-sm text-body">
          Derived product knowledge, precomputed similar products, engagement signals and discovery usage. Rule-based: a
          curated concept lexicon plus TF-IDF over listing text — no model calls, no per-request computation. The
          scheduler refreshes changed products and recalculates trending every hour.
        </p>
      </div>

      {!status.migrationApplied && (
        <p className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-ink">
          The tables are missing. Apply the Product Intelligence migrations, then press Rebuild.
        </p>
      )}

      <Panel title="Index">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Published products" value={status.published} />
          <Stat label="Indexed (knowledge built)" value={status.indexed} note={status.lastIndexedAt ? `Last: ${formatDate(status.lastIndexedAt)}` : "Never"} />
          <Stat label="Not indexed" value={Math.max(0, status.published - status.indexed)} />
          <Stat label="Need re-index" value={status.stale} note="Listing changed since last run" />
          <Stat label="Similarity rows" value={status.similarityRows} />
          <Stat label="No similar products" value={status.withoutSimilar} note="Thin or one-of-a-kind" />
          <Stat label="Comparison pages" value={status.comparePages} note="Curated /compare/a-vs-b" />
          <Stat label="Trending refreshed" value={status.lastSignalsAt ? formatDate(status.lastSignalsAt) ?? "—" : "Never"} />
        </div>
      </Panel>

      <Panel title="Operations" note="Each rewrites derived data only; rate limited.">
        <IntelligenceActions />
      </Panel>

      <Panel
        title="Engagement, last 14 days"
        note={`Unique visitors plus deliberate actions (clicks, saves, compares, votes, comments) per IST day. ${status.eventsToday} raw events recorded today.`}
      >
        <div className="flex h-40 items-end gap-1 rounded-xl border border-border bg-card p-4" role="img" aria-label="Daily engagement chart">
          {status.daily.map((day) => (
            <div key={day.day} className="flex h-full flex-1 flex-col justify-end gap-px" title={`${day.day}: ${day.visitors} visitors, ${day.actions} actions`}>
              <div className="rounded-t-sm bg-primary" style={{ height: `${(day.actions / peak) * 100}%` }} />
              <div className="bg-primary/30" style={{ height: `${(day.visitors / peak) * 100}%` }} />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {SIGNAL_LABELS.map(([key, label]) => (
            <Stat key={key} label={label} value={status.signals7d[key]} note={`${status.signals30d[key]} in 30 days`} />
          ))}
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Panel title="Trending" note="Decayed 7-day engagement (products.trend_score).">
          <RankList items={status.trending} unit="score" empty="No engagement recorded yet." />
        </Panel>
        <Panel title="Rising" note="Last 3 days against the 7 before.">
          <RankList items={status.rising} unit="×" empty="Nothing accelerating yet." />
        </Panel>
        <Panel title="Most saved" note={`Saves in 30 days (all-time for signed-in saves). ${status.totalSaves} account saves in total.`}>
          <RankList items={status.mostSaved} unit="saves" empty="No saves yet." />
        </Panel>
        <Panel title="Most compared" note="Compare-tray adds in 30 days.">
          <RankList items={status.mostCompared} unit="adds" empty="No comparisons yet." />
        </Panel>
      </div>

      <Panel title="Product Match usage" note="Searches on /discover and what people did with the results.">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Match searches (30 days)" value={status.match.searches30d} />
          <Stat label="No result" value={status.match.zeroResult30d} note={percent(status.match.zeroResult30d, status.match.searches30d)} />
          <Stat label="Result clicks" value={status.match.clicks30d} note={`${percent(status.match.clicks30d, status.match.impressions30d)} of ${status.match.impressions30d} impressions`} />
          <Stat label="AI calls · AI cost" value="0 · ₹0" note="By design — matching is rule-based" />
        </div>
        <QueryList items={status.zeroResultMatches} empty="No unanswered Product Match requests in 30 days." />
      </Panel>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Panel title="Top marketplace searches" note={`${status.marketplaceSearches30d} searches in 30 days.`}>
          <QueryList items={status.topSearches} empty="No searches yet." />
        </Panel>
        <Panel title="Zero-result searches" note="And how the lexicon now reads them.">
          <QueryList items={status.zeroResultSearches} empty="None in 30 days." readAs />
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Panel title="Collections">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Collections" value={status.lists.total} />
            <Stat label="Public" value={status.lists.public} />
            <Stat label="Products collected" value={status.lists.items} />
          </div>
        </Panel>
        <Panel title="Cache" note="Hit rate is sampled from 1 in 20 cache reads.">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Redis cache" value={status.cache.enabled ? "On" : "Off"} />
            <Stat
              label="Hit rate"
              value={status.cache.enabled ? percent(status.cache.hits, cacheTotal) : "—"}
              note={status.cache.enabled ? `${cacheTotal} sampled reads` : "Set UPSTASH_REDIS_REST_* to enable"}
            />
          </div>
        </Panel>
      </div>

      <Panel title="Most common concepts" note="What the catalogue says it does, per the lexicon.">
        <ul className="flex flex-wrap gap-2">
          {status.topConcepts.map((concept) => (
            <li key={concept.key} className="rounded-full border border-border bg-card px-3 py-1 text-sm text-body">
              {concept.label} <Numeric className="text-muted">{concept.products}</Numeric>
            </li>
          ))}
        </ul>
      </Panel>
    </Container>
  );
}
