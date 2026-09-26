"use client";

/* Design system: design.md (Bharat Hunt — orange) · Launch Agent platform card.
 * White 24px card, soft shadow, hover lift. One primary action whose verb
 * follows the automation level, and "View requirements" as the quiet second. */

import { AlertTriangle, Bot, ClipboardList, Eye, Hand, Loader2, RefreshCw, Send, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Numeric } from "@/components/ui/typography";
import type { PlatformCampaignStatus } from "@/lib/launch-agent/types";
import type { PlatformView } from "@/lib/launch-agent/view";
import { cn } from "@/lib/utils";
import { AutomationBadge, ProgressBar, StatusPill } from "./badges";

const PRIMARY = {
  AUTOMATED: { label: "Connect", Icon: Bot },
  ASSISTED: { label: "Prepare Submission", Icon: Hand },
  AI_PREPARED: { label: "Generate Launch Kit", Icon: Sparkles },
} as const;

/**
 * The primary button once a platform has been prepared, by status — "Open
 * launch kit" for everything was the old behaviour, and it hid whether a
 * platform still needed review, was already handed off, or failed. The verb
 * now names what the maker actually does next.
 */
const PREPARED_ACTION: Partial<Record<PlatformCampaignStatus, { label: string; Icon: typeof Bot }>> = {
  MISSING_INFORMATION: { label: "Complete requirements", Icon: AlertTriangle },
  READY_TO_SUBMIT: { label: "Review & submit", Icon: Send },
  USER_ACTION_REQUIRED: { label: "Connect account", Icon: Bot },
  SUBMITTED: { label: "View launch", Icon: Eye },
  PUBLISHED: { label: "View launch", Icon: Eye },
  FAILED: { label: "Retry", Icon: RefreshCw },
};

export function PlatformCard({
  platform,
  onPrepare,
  onOpen,
  preparing,
  disabled,
}: {
  platform: PlatformView;
  onPrepare: () => void;
  onOpen: () => void;
  preparing: boolean;
  disabled: boolean;
}) {
  const row = platform.campaign;
  const prepared = Boolean(row?.preparedAt);
  const primary = PRIMARY[platform.automationLevel];
  const label = platform.slug === "product-hunt" && !prepared ? "Prepare Launch" : primary.label;

  return (
    /* `@container`, because what decides the layout inside this card is the
       card's own width, not the window's. These sit in a grid that goes to
       three columns at xl, where a card is ~350px wide — narrower than at the
       `sm` breakpoint the buttons below used to consult, so a viewport-based
       row put two buttons that need ~360px into ~310px of space and they
       spilled over the card's edge into the next column. */
    <article className="group @container flex h-full flex-col gap-4 rounded-3xl border border-border bg-card p-5 shadow-soft transition duration-200 ease-out hover:-translate-y-1 hover:shadow-hover motion-reduce:transform-none">
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#FF6B1A,#FF8A3D)] text-lg font-bold text-white"
          >
            {platform.name.charAt(0)}
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-base font-bold text-ink">{platform.name}</h3>
            {row && (
              <p className="text-xs text-muted">
                {row.recommended ? `${row.priority.charAt(0)}${row.priority.slice(1).toLowerCase()} priority` : "Lower fit"}
              </p>
            )}
          </div>
        </div>
        {row && (
          <div className="shrink-0 text-right">
            <p className="text-[11px] tracking-wide text-muted uppercase">Fit score</p>
            <p className="text-lg font-bold text-ink">
              <Numeric>{row.fitScore}</Numeric>
              <span className="text-xs font-medium text-muted">/100</span>
            </p>
          </div>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <AutomationBadge level={platform.automationLevel} />
        {row && row.status !== "NOT_STARTED" && <StatusPill status={row.status} />}
      </div>

      <p className="text-sm leading-relaxed text-body">{row?.reason || platform.description}</p>

      {prepared && row && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-ink">{row.readiness}% ready</span>
            {row.scheduledFor && <span className="text-muted">Planned {row.scheduledFor}</span>}
          </div>
          <ProgressBar value={row.readiness} />
        </div>
      )}

      {/* Side by side once the card has room for both labels (24rem of
          content — a container query measures the content box, so the card padding
          is already excluded). Below that they stack, as on a phone. */}
      <div className="mt-auto flex flex-col gap-2 pt-1 @sm:flex-row">
        {prepared ? (
          (() => {
            const action = row ? PREPARED_ACTION[row.status] : undefined;
            const Icon = action?.Icon ?? ClipboardList;
            const done = row?.status === "SUBMITTED" || row?.status === "PUBLISHED";
            return (
              <Button className="w-full @sm:flex-1" variant={done ? "outline" : "default"} onClick={onOpen}>
                <Icon className="size-4" aria-hidden="true" /> {action?.label ?? "Open launch kit"}
              </Button>
            );
          })()
        ) : (
          <Button className={cn("w-full @sm:flex-1")} onClick={onPrepare} disabled={disabled}>
            {preparing ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <primary.Icon className="size-4" aria-hidden="true" />}
            {preparing ? "Preparing…" : label}
          </Button>
        )}
        <Button variant="outline" className="w-full @sm:w-auto" onClick={onOpen}>
          View requirements
        </Button>
      </div>
    </article>
  );
}
