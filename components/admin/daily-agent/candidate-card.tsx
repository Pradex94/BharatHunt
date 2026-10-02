"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, FileSearch, Globe, Pencil, RefreshCw } from "lucide-react";

import {
  approveDailyCandidate,
  editDailyCandidate,
  regenerateDailyCandidate,
  rejectDailyCandidate,
  skipDailyCandidate,
} from "@/lib/actions/daily-agent-admin";
import { ISSUE_LABELS, sourceLabel, type DraftContent, type Facts, type IndiaSignal, type Scores } from "@/lib/daily-agent/types";
import { cn } from "@/lib/utils";

/** The candidate row, trimmed to what the card shows. Serialisable. */
export type CandidateView = {
  id: string;
  name: string;
  status: string;
  statusReason: string | null;
  websiteUrl: string | null;
  websiteInferred: boolean;
  sourceName: string;
  sourceUrls: string[];
  sourceSnippet: string | null;
  discoveredAt: string;
  verifiedAt: string | null;
  indiaConfidence: number | null;
  signals: IndiaSignal[];
  facts: Partial<Facts>;
  content: Partial<DraftContent>;
  scores: Partial<Scores>;
  overallScore: number | null;
  issues: string[];
  duplicateReason: string | null;
  productSlug: string | null;
  rank: number | null;
  reviewNote: string | null;
};

const STATUS_STYLES: Record<string, string> = {
  selected: "bg-primary/10 text-primary",
  published: "bg-green-50 text-success",
  needs_review: "bg-amber-50 text-warning",
  eligible: "bg-secondary-bg text-body-strong",
  rejected: "bg-red-50 text-error",
  ineligible: "bg-muted/10 text-muted",
  already_exists: "bg-muted/10 text-muted",
  skipped: "bg-muted/10 text-muted",
};

const SCORE_LABELS: Array<[keyof Scores, string]> = [
  ["indiaScore", "India"],
  ["completenessScore", "Completeness"],
  ["websiteScore", "Website"],
  ["uniquenessScore", "Uniqueness"],
  ["launchReadinessScore", "Launch readiness"],
  ["bharatHuntRelevanceScore", "BharatHunt relevance"],
];

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", STATUS_STYLES[status] ?? "bg-muted/10 text-muted")}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function DailyCandidateCard({
  candidate,
  categories,
  isDryRun,
}: {
  candidate: CandidateView;
  categories: readonly string[];
  isDryRun: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [mode, setMode] = useState<"view" | "edit" | "reject">("view");
  const [note, setNote] = useState("");
  const { facts, content, scores } = candidate;
  const actionable = ["selected", "eligible", "needs_review"].includes(candidate.status);

  const [form, setForm] = useState({
    tagline: content.tagline ?? "",
    shortDescription: content.shortDescription ?? "",
    fullDescription: content.fullDescription ?? "",
    category: content.category ?? "Other",
    tags: (content.tags ?? []).join(", "),
    pricingType: content.pricingType ?? facts.pricingType ?? "",
  });

  function act(run: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>) {
    setMessage(null);
    startTransition(async () => {
      const result = await run();
      setMessage(result.ok ? { ok: true, text: result.message ?? "Done." } : { ok: false, text: result.error });
      if (result.ok) {
        setMode("view");
        router.refresh();
      }
    });
  }

  const small = "inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors disabled:opacity-60";
  const outline = cn(small, "border border-border bg-card text-ink hover:border-primary/30 hover:bg-secondary-bg");

  return (
    <article className="rounded-2xl border border-border bg-card p-4 shadow-soft md:p-5">
      <header className="flex flex-wrap items-start gap-3">
        {facts.logoUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element -- third-party logo on an arbitrary host, admin-only view */
          <img
            src={facts.logoUrl}
            alt=""
            width={48}
            height={48}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="size-12 shrink-0 rounded-xl border border-border bg-card object-contain"
          />
        ) : (
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-secondary-bg text-lg font-bold text-primary">
            {candidate.name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {candidate.rank && <span className="text-xs font-bold text-primary">#{candidate.rank}</span>}
            <h3 className="truncate text-base font-bold text-ink">{candidate.name}</h3>
            <StatusBadge status={candidate.status} />
          </div>
          <p className="mt-0.5 truncate text-sm text-body">{content.tagline || "No draft yet"}</p>
          <p className="mt-1 text-xs text-muted">
            {content.category ?? facts.category ?? "Uncategorised"} · found via {sourceLabel(candidate.sourceName)} on{" "}
            {candidate.discoveredAt.slice(0, 10)}
            {candidate.websiteInferred ? " · website found by domain probe" : ""}
          </p>
        </div>
        <div className="flex gap-4 text-right">
          <div>
            <p className="font-mono text-xl font-bold tabular-nums text-ink">{candidate.indiaConfidence ?? "—"}</p>
            <p className="text-[11px] text-muted">India</p>
          </div>
          <div>
            <p className="font-mono text-xl font-bold tabular-nums text-ink">{candidate.overallScore ?? "—"}</p>
            <p className="text-[11px] text-muted">Score</p>
          </div>
        </div>
      </header>

      {(candidate.statusReason || candidate.duplicateReason || candidate.issues.length > 0) && (
        <ul className="mt-3 space-y-1 text-xs">
          {candidate.statusReason && <li className="text-body">• {candidate.statusReason}</li>}
          {candidate.duplicateReason && <li className="text-warning">• Duplicate check: {candidate.duplicateReason}</li>}
          {candidate.issues.map((issue) => (
            <li key={issue} className="text-warning">
              • {ISSUE_LABELS[issue] ?? issue}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {candidate.websiteUrl && (
          <a href={candidate.websiteUrl} target="_blank" rel="noopener noreferrer nofollow" className={outline}>
            <Globe className="size-3.5" aria-hidden="true" /> Open website
          </a>
        )}
        {candidate.sourceUrls[0] && (
          <a href={candidate.sourceUrls[0]} target="_blank" rel="noopener noreferrer nofollow" className={outline}>
            <FileSearch className="size-3.5" aria-hidden="true" /> Open source
          </a>
        )}
        {candidate.productSlug && (
          <Link href={`/products/${candidate.productSlug}`} className={outline}>
            <ExternalLink className="size-3.5" aria-hidden="true" /> View product
          </Link>
        )}
      </div>

      <details className="mt-3 rounded-xl bg-secondary-bg/60 p-3 text-sm">
        <summary className="cursor-pointer text-xs font-semibold text-ink">India evidence ({candidate.signals.length})</summary>
        {candidate.signals.length === 0 ? (
          <p className="mt-2 text-xs text-muted">No India evidence found.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {candidate.signals.map((signal, index) => (
              <li key={`${signal.kind}-${index}`} className="text-xs">
                <span className="font-semibold text-ink">+{signal.weight}</span> {signal.label}
                <span className="mt-0.5 block break-words text-muted">“{signal.evidence}”</span>
                {signal.url && (
                  <a href={signal.url} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-primary underline-offset-2 hover:underline">
                    {signal.url}
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </details>

      <details className="mt-2 rounded-xl bg-secondary-bg/60 p-3 text-sm">
        <summary className="cursor-pointer text-xs font-semibold text-ink">Scores, facts and provenance</summary>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
          {SCORE_LABELS.map(([key, label]) => (
            <div key={key} className="flex justify-between gap-2">
              <dt className="text-muted">{label}</dt>
              <dd className="font-mono tabular-nums text-ink">{scores[key] ?? "—"}</dd>
            </div>
          ))}
        </dl>
        <dl className="mt-3 grid grid-cols-1 gap-1 text-xs">
          {[
            ["Company", facts.companyName],
            ["Founders", facts.founderNames?.length ? facts.founderNames.join(", ") : null],
            ["Location", [facts.city, facts.stateCode].filter(Boolean).join(", ") || null],
            ["Pricing", facts.pricingType],
            ["Free trial", facts.freeTrial === null || facts.freeTrial === undefined ? null : facts.freeTrial ? "Yes" : "No"],
            ["Pages read", facts.pagesRead?.join(" · ")],
            ["Discovered", candidate.discoveredAt.slice(0, 16).replace("T", " ")],
            ["Verified", candidate.verifiedAt?.slice(0, 16).replace("T", " ") ?? null],
            ["Source text", candidate.sourceSnippet],
            ["Source URLs", candidate.sourceUrls.join(" · ") || null],
          ].map(([label, value]) => (
            <div key={label} className="flex gap-2">
              <dt className="w-24 shrink-0 text-muted">{label}</dt>
              <dd className="min-w-0 break-words text-ink">{value || <span className="text-muted">Unknown</span>}</dd>
            </div>
          ))}
        </dl>
      </details>

      {mode !== "edit" && (content.shortDescription || content.fullDescription) && (
        <details className="mt-2 rounded-xl bg-secondary-bg/60 p-3 text-sm">
          <summary className="cursor-pointer text-xs font-semibold text-ink">
            Draft listing ({content.generatedBy === "admin" ? "edited" : content.generatedBy === "model" ? "model-polished" : "from verified facts"})
          </summary>
          <p className="mt-2 text-xs font-semibold text-ink">{content.shortDescription}</p>
          <p className="mt-2 whitespace-pre-line text-xs text-body">{content.fullDescription}</p>
          {content.whyInteresting && <p className="mt-2 text-xs text-muted">Why: {content.whyInteresting}</p>}
          {content.tags?.length ? <p className="mt-2 text-xs text-muted">Tags: {content.tags.join(", ")}</p> : null}
        </details>
      )}

      {mode === "edit" && (
        <form
          className="mt-3 grid grid-cols-1 gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            act(() => editDailyCandidate(candidate.id, form));
          }}
        >
          <label className="text-xs text-muted">
            Tagline
            <input value={form.tagline} maxLength={120} onChange={(e) => setForm({ ...form, tagline: e.target.value })} className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm text-ink" />
          </label>
          <label className="text-xs text-muted">
            Short description
            <textarea value={form.shortDescription} rows={2} maxLength={300} onChange={(e) => setForm({ ...form, shortDescription: e.target.value })} className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm text-ink" />
          </label>
          <label className="text-xs text-muted">
            Full description
            <textarea value={form.fullDescription} rows={6} onChange={(e) => setForm({ ...form, fullDescription: e.target.value })} className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm text-ink" />
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label className="text-xs text-muted">
              Category
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-ink">
                {categories.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted">
              Pricing
              <select value={form.pricingType} onChange={(e) => setForm({ ...form, pricingType: e.target.value })} className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-ink">
                <option value="">Unknown</option>
                <option value="free">Free</option>
                <option value="freemium">Freemium</option>
                <option value="paid">Paid</option>
              </select>
            </label>
            <label className="text-xs text-muted">
              Tags (comma-separated)
              <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm text-ink" />
            </label>
          </div>
          <p className="text-xs text-muted">Only write what the product&apos;s own site supports. To change the website, reject this and queue the correct URL.</p>
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className={cn(small, "bg-primary text-white hover:opacity-90")}>Save</button>
            <button type="button" onClick={() => setMode("view")} className={outline}>Cancel</button>
          </div>
        </form>
      )}

      {mode === "reject" && (
        <div className="mt-3 flex flex-col gap-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder="Why? (optional, internal)"
            className="w-full rounded-md border border-border px-3 py-2 text-sm text-ink"
          />
          <div className="flex gap-2">
            <button type="button" disabled={pending} onClick={() => act(() => rejectDailyCandidate(candidate.id, note))} className={cn(small, "bg-error text-white")}>
              Confirm reject
            </button>
            <button type="button" onClick={() => setMode("view")} className={outline}>Cancel</button>
          </div>
        </div>
      )}

      {actionable && mode === "view" && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
          <button
            type="button"
            disabled={pending || isDryRun}
            title={isDryRun ? "Dry runs never publish — run today's batch to approve." : undefined}
            onClick={() => act(() => approveDailyCandidate(candidate.id))}
            className={cn(small, "btn-gradient text-white")}
          >
            {pending ? "Working…" : "Approve & publish"}
          </button>
          <button type="button" disabled={pending} onClick={() => setMode("reject")} className={outline}>Reject</button>
          <button type="button" disabled={pending} onClick={() => setMode("edit")} className={outline}>
            <Pencil className="size-3.5" aria-hidden="true" /> Edit
          </button>
          <button type="button" disabled={pending} onClick={() => act(() => regenerateDailyCandidate(candidate.id))} className={outline}>
            <RefreshCw className="size-3.5" aria-hidden="true" /> Regenerate
          </button>
          <button type="button" disabled={pending} onClick={() => act(() => skipDailyCandidate(candidate.id))} className={outline}>Skip</button>
        </div>
      )}
      {candidate.reviewNote && <p className="mt-2 text-xs text-muted">Note: {candidate.reviewNote}</p>}
      {message && (
        <p role="status" className={cn("mt-2 text-xs", message.ok ? "text-success" : "text-error")}>
          {message.text}
        </p>
      )}
    </article>
  );
}
