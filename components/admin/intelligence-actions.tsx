"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  applyCategorySuggestion,
  clearIntelligenceCache,
  rebuildIntelligence,
  recalculateTrending,
  type IntelligenceAdminResult,
} from "@/lib/actions/intelligence-admin";

/** Rebuild and cache controls. Server actions do the gating and rate limiting. */
export function IntelligenceActions() {
  const [result, setResult] = useState<IntelligenceAdminResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<IntelligenceAdminResult>) {
    setResult(null);
    startTransition(async () => setResult(await action()));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={isPending} onClick={() => run(rebuildIntelligence)}>
          {isPending ? "Working…" : "Rebuild knowledge & similarity"}
        </Button>
        <Button size="sm" variant="outline" disabled={isPending} onClick={() => run(recalculateTrending)}>
          Recalculate trending
        </Button>
        <Button size="sm" variant="outline" disabled={isPending} onClick={() => run(clearIntelligenceCache)}>
          Clear intelligence cache
        </Button>
      </div>
      {result && (
        <p role="status" className={result.ok ? "text-sm text-body" : "text-sm text-destructive"}>
          {result.ok ? result.message : result.error}
        </p>
      )}
    </div>
  );
}

/**
 * "Apply" on one Category review row: moves the product to the suggested
 * category. One explicit click per product; the server action re-checks admin
 * rights and that the category is a stored one.
 */
export function ApplyCategoryButton({ productId, category }: { productId: string; category: string }) {
  const [result, setResult] = useState<IntelligenceAdminResult | null>(null);
  const [isPending, startTransition] = useTransition();

  if (result?.ok) return <span className="text-xs text-muted">Moved</span>;
  return (
    <span className="flex flex-col items-start gap-1">
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() => startTransition(async () => setResult(await applyCategorySuggestion(productId, category)))}
      >
        {isPending ? "Moving…" : `Move to ${category}`}
      </Button>
      {result && !result.ok && <span className="text-xs text-destructive">{result.error}</span>}
    </span>
  );
}
