"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";
import { PRODUCT_CATEGORIES } from "@/lib/constants";
import { MATCH_AUDIENCES } from "@/lib/intelligence/match-options";

const EXAMPLES = [
  "I need a CRM for my small startup",
  "A cheap AI video editor for YouTube",
  "Free tools to merge and compress PDFs",
  "Help me prepare for placement interviews",
  "Accept UPI payments on my website",
];

const SELECT =
  "h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring/50 pointer-coarse:h-11";

/**
 * Natural language first; the three choices are optional and start at "any".
 * Submits to the URL (/discover?q=…), so a result is a link someone can share.
 */
export function MatchForm({
  initial,
}: {
  initial: { q: string; budget: string; audience: string; category: string };
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initial.q);
  const [budget, setBudget] = useState(initial.budget);
  const [audience, setAudience] = useState(initial.audience);
  const [category, setCategory] = useState(initial.category);
  const [isPending, startTransition] = useTransition();

  function submit(text: string) {
    const q = text.trim();
    if (!q) return;
    const params = new URLSearchParams({ q });
    if (budget !== "any") params.set("budget", budget);
    if (audience) params.set("for", audience);
    if (category) params.set("category", category);
    trackEvent("ai_match_search", { search_term: q.slice(0, 100) });
    startTransition(() => router.push(`/discover?${params.toString()}`));
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit(query);
      }}
      className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:p-5"
    >
      <label htmlFor="match-query" className="text-sm font-semibold text-ink">
        What are you looking for?
      </label>
      <textarea
        id="match-query"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit(query);
          }
        }}
        rows={2}
        maxLength={300}
        placeholder="e.g. I need a cheap AI video editor for YouTube"
        className="w-full resize-none rounded-md border border-border bg-background px-3 py-2.5 text-base text-ink outline-none placeholder:text-muted focus-visible:ring-2 focus-visible:ring-ring/50"
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Budget
          <select value={budget} onChange={(event) => setBudget(event.target.value)} className={SELECT}>
            <option value="any">Any price</option>
            <option value="free">Free only</option>
            <option value="free-plan">Has a free plan</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          I am a
          <select value={audience} onChange={(event) => setAudience(event.target.value)} className={SELECT}>
            <option value="">Anyone</option>
            {MATCH_AUDIENCES.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Category
          <select value={category} onChange={(event) => setCategory(event.target.value)} className={SELECT}>
            <option value="">Any category</option>
            <option value="ai">AI-first products</option>
            {PRODUCT_CATEGORIES.filter((name) => name !== "Other").map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted">
          Monthly prices aren&apos;t recorded yet, so budget means free, free plan or paid.
        </p>
        <Button type="submit" disabled={isPending || !query.trim()} className="sm:w-auto">
          {isPending ? "Matching…" : "Find products"}
          <ArrowRight aria-hidden="true" />
        </Button>
      </div>

      {!initial.q && (
        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
          <span className="sr-only">Examples:</span>
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => {
                setQuery(example);
                submit(example);
              }}
              className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-body transition-colors hover:border-primary/40 hover:text-primary pointer-coarse:py-2"
            >
              {example}
            </button>
          ))}
        </div>
      )}
    </form>
  );
}
