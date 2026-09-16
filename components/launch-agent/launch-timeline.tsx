"use client";

/* Design system: design.md (Bharat Hunt — orange) · Launch timeline.
 * Vertical everywhere below lg (a rail of dated steps); a wrapping grid of step
 * cards from lg. Every date is editable; it's a recommendation, not a promise. */

import { useState } from "react";
import { CalendarDays, Rocket } from "lucide-react";

import { setLaunchPlatformDate } from "@/lib/actions/launch-agent";
import { daysBetweenDates } from "@/lib/launch-agent/timeline";
import type { PlatformView } from "@/lib/launch-agent/view";
import { StatusPill } from "./badges";
import type { useLaunchAction } from "./use-launch-action";

type Runner = ReturnType<typeof useLaunchAction>;

function formatDay(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

export function LaunchTimeline({
  productId,
  publishedAt,
  platforms,
  runner,
}: {
  productId: string;
  publishedAt: string | null;
  platforms: PlatformView[];
  runner: Runner;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const start = publishedAt ? publishedAt.slice(0, 10) : null;
  const steps = platforms
    .filter((platform) => platform.campaign?.scheduledFor && (platform.campaign.recommended || platform.campaign.preparedAt))
    .sort((a, b) => a.campaign!.scheduledFor!.localeCompare(b.campaign!.scheduledFor!));

  if (steps.length === 0) {
    return <p className="rounded-2xl border border-dashed border-border bg-card p-5 text-sm text-body">No dates suggested yet — they appear once your campaign has been analysed.</p>;
  }

  const dayOf = (date: string) => (start ? Math.max(1, daysBetweenDates(start, date) + 1) : null);

  return (
    <ol className="relative flex flex-col gap-3 lg:grid lg:grid-cols-3 lg:gap-4 xl:grid-cols-4">
      <li className="relative flex gap-3 rounded-2xl border border-primary/25 bg-secondary-bg/70 p-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#FF6B1A,#FF8A3D)] text-white">
          <Rocket className="size-4" aria-hidden="true" />
        </span>
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">Day 1{start ? ` · ${formatDay(start)}` : ""}</p>
          <p className="font-bold text-ink">BharatHunt</p>
          <p className="text-xs text-success">Published</p>
        </div>
      </li>
      {steps.map((platform) => {
        const row = platform.campaign!;
        const date = row.scheduledFor!;
        const day = dayOf(date);
        const key = `date-${platform.slug}`;
        return (
          <li key={platform.slug} className="relative flex gap-3 rounded-2xl border border-border bg-card p-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary-bg font-bold text-primary">
              {platform.name.charAt(0)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold tracking-wide text-muted uppercase">
                {day ? `Day ${day} · ` : ""}
                {formatDay(date)}
              </p>
              <p className="truncate font-bold text-ink">{platform.name}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {row.status !== "NOT_STARTED" ? <StatusPill status={row.status} /> : <span className="text-xs text-muted">{platform.slug === "show-hn" ? "Show HN" : "Launch"}</span>}
              </div>
              {editing === platform.slug ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    defaultValue={date}
                    aria-label={`Launch date for ${platform.name}`}
                    className="min-h-10 rounded-md border border-input bg-background px-2 text-sm"
                    onChange={(event) => {
                      const value = event.target.value;
                      if (!value) return;
                      runner.run(key, () => setLaunchPlatformDate(productId, platform.slug, value), () => setEditing(null));
                    }}
                  />
                  <button type="button" className="min-h-10 px-2 text-xs font-semibold text-muted hover:text-ink" onClick={() => setEditing(null)}>
                    Done
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditing(platform.slug)}
                  disabled={runner.pending}
                  className="mt-2 inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-primary hover:underline pointer-coarse:min-h-11"
                >
                  <CalendarDays className="size-3.5" aria-hidden="true" /> {runner.pendingKey === key ? "Saving…" : "Change date"}
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
