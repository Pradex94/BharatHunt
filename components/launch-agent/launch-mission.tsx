"use client";

/* Design system: design.md (Bharat Hunt — orange) · Launch Agent mission header.
 * The one-glance answer to "where is my launch at": how many recommended
 * platforms are actually live, a progress bar, and the single next action —
 * rather than making the maker scan every card to find it themselves. */

import { useState } from "react";
import { Rocket, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Numeric } from "@/components/ui/typography";
import { ProgressBar } from "./badges";

export function LaunchMission({
  productName,
  totalRecommended,
  launchedCount,
  readyCount,
  nextActionLabel,
  onContinue,
  onLaunchAll,
}: {
  productName: string;
  totalRecommended: number;
  launchedCount: number;
  readyCount: number;
  /** Label for the primary CTA — what happens next, in the maker's terms. */
  nextActionLabel: string | null;
  onContinue: () => void;
  onLaunchAll: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const percent = totalRecommended > 0 ? Math.round((launchedCount / totalRecommended) * 100) : 0;
  const done = totalRecommended > 0 && launchedCount === totalRecommended;

  return (
    <section className="rounded-3xl border border-border bg-[linear-gradient(135deg,#FFF4EC,#FFFFFF)] p-5 shadow-soft sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-semibold tracking-[0.12em] text-primary uppercase">
            <Rocket className="size-3.5" aria-hidden="true" /> Launch mission
          </p>
          <p className="mt-1 text-sm text-body">
            {done ? (
              <>You&apos;ve launched {productName} everywhere it&apos;s recommended.</>
            ) : (
              <>Get {productName} in front of every audience it fits — one platform at a time.</>
            )}
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-2xl font-bold tabular-nums text-ink">
            <Numeric>{launchedCount}</Numeric> <span className="text-base font-sans font-medium text-muted">/ {totalRecommended} launched</span>
          </p>
        </div>
      </div>

      <ProgressBar value={percent} className="mt-4 h-2.5" />

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        {nextActionLabel && (
          <Button className="w-full sm:w-auto" onClick={onContinue}>
            <Sparkles className="size-4" aria-hidden="true" /> {nextActionLabel}
          </Button>
        )}
        {readyCount > 0 && !confirming && (
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => setConfirming(true)}>
            Launch all ready ({readyCount})
          </Button>
        )}
      </div>

      {confirming && (
        <div className="mt-4 rounded-2xl border border-primary/25 bg-card p-4">
          <p className="text-sm font-semibold text-ink">Review {readyCount} ready {readyCount === 1 ? "platform" : "platforms"} one at a time?</p>
          <p className="mt-1 text-sm text-body">
            Nothing gets submitted without you — this opens each one&apos;s checklist and submission link in turn, so you can review and hand off to the platform yourself.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Button
              onClick={() => {
                setConfirming(false);
                onLaunchAll();
              }}
            >
              Start review
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
