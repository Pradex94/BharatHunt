/* Design system: design.md (Bharat Hunt — orange) · Launch Agent badges.
 * Automation levels and statuses as small pills, on the orange/neutral/amber
 * palette design.md allows. A level is told apart by its icon and label, not
 * by a coloured dot — the old green/amber/violet dots were three colours the
 * palette does not have. */

import { Bot, Hand, Sparkles, type LucideIcon } from "lucide-react";

import { AUTOMATION_META, STATUS_META } from "@/lib/launch-agent/status";
import type { AutomationLevel, PlatformCampaignStatus } from "@/lib/launch-agent/types";
import { cn } from "@/lib/utils";

/** The one icon per automation level, shared with the public Launch Agent page. */
export const AUTOMATION_ICON: Record<AutomationLevel, LucideIcon> = {
  AUTOMATED: Bot,
  ASSISTED: Hand,
  AI_PREPARED: Sparkles,
};

export function AutomationBadge({ level, className }: { level: AutomationLevel; className?: string }) {
  /* Both lookups fall back rather than index blindly. These values arrive from
     `launch_platforms` rows, so a level or status added by a later migration —
     or an older deploy reading a newer row — would otherwise read `undefined`
     and throw inside render, blanking the whole campaign page over a badge. */
  const meta = AUTOMATION_META[level] ?? AUTOMATION_META.AI_PREPARED;
  const Icon = AUTOMATION_ICON[level] ?? AUTOMATION_ICON.AI_PREPARED;
  return (
    <span
      title={meta.description}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-semibold text-ink",
        className,
      )}
    >
      <Icon className="size-3.5 text-primary" aria-hidden="true" />
      {meta.label}
    </span>
  );
}

const TONE_CLASS = {
  neutral: "bg-secondary-bg text-muted",
  progress: "bg-primary/10 text-primary",
  ready: "bg-primary/10 text-primary-active",
  warn: "bg-amber-100 text-amber-800",
  done: "bg-success/10 text-success",
  error: "bg-destructive/10 text-destructive",
} as const;

export function StatusPill({ status, className }: { status: PlatformCampaignStatus; className?: string }) {
  // Unknown status: show the raw value in neutral rather than throw. See the
  // note in AutomationBadge.
  const meta = STATUS_META[status] ?? { label: String(status), tone: "neutral" as const };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", TONE_CLASS[meta.tone], className)}>
      {meta.label}
    </span>
  );
}

/** A circular 0–100 meter. Decorative ring; the number is the accessible value. */
export function ScoreRing({ value, size = 112, label }: { value: number; size?: number; label: string }) {
  const stroke = Math.max(6, Math.round(size / 12));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${clamped} out of 100`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--color-secondary-bg)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#bh-score-gradient)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
          className="transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none"
        />
        <defs>
          <linearGradient id="bh-score-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FF6B1A" />
            <stop offset="100%" stopColor="#FF8A3D" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-2xl font-bold tabular-nums text-ink" style={{ fontSize: size / 4 }}>
          {clamped}
        </span>
        <span className="text-[11px] text-muted">/100</span>
      </div>
    </div>
  );
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn("h-2 w-full overflow-hidden rounded-full bg-secondary-bg", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
    >
      <div className="h-full rounded-full bg-[linear-gradient(135deg,#FF6B1A,#FF8A3D)] transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${clamped}%` }} />
    </div>
  );
}
