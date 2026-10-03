"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
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
