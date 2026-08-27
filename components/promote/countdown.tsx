"use client";

/* Design system: design.md (Bharat Hunt — orange) · /promote
 *
 * The round clock. Presentational: it is handed a number of seconds and draws
 * it. The seconds themselves come from `AuctionProvider`, which owns the single
 * interval on the page — three of these on screen do not mean three timers.
 *
 * Urgency is a function of the remaining time rather than a separate flag, so
 * when a real auction is wired up the escalation happens on its own.
 */

import { Timer } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  CRITICAL_BELOW_SECONDS,
  splitDuration,
  URGENT_BELOW_SECONDS,
} from "@/lib/promote";
import { useAuctionClock } from "@/components/promote/auction-provider";
import { RollingText } from "@/components/promote/rolling-number";

type Urgency = "calm" | "urgent" | "critical";

function urgencyFor(seconds: number): Urgency {
  if (seconds <= CRITICAL_BELOW_SECONDS) return "critical";
  if (seconds <= URGENT_BELOW_SECONDS) return "urgent";
  return "calm";
}

const UNIT_LABELS = ["hrs", "min", "sec"] as const;

export type CountdownProps = {
  seconds: number;
  /** `dark` for the near-black board, `light` for cards on the white canvas. */
  tone?: "dark" | "light";
  /** `sm` is a single inline readout; `md` is the three-tile block. */
  size?: "sm" | "md";
  className?: string;
};

export function Countdown({ seconds, tone = "dark", size = "md", className }: CountdownProps) {
  const { hours, minutes, seconds: secs } = splitDuration(seconds);
  const urgency = urgencyFor(seconds);
  const units = [hours, minutes, secs];

  const accent =
    urgency === "critical"
      ? "text-primary"
      : urgency === "urgent"
        ? "text-warning"
        : tone === "dark"
          ? "text-white"
          : "text-ink";

  if (size === "sm") {
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-sm font-semibold", accent, className)}>
        <Timer className="size-3.5 shrink-0" aria-hidden="true" />
        <RollingText text={`${hours}:${minutes}:${secs}`} />
      </span>
    );
  }

  return (
    <div
      className={cn(
        "flex items-end gap-1.5",
        // Ends on its resting frame, so the reduced-motion freeze in globals.css
        // leaves a still, correct block rather than a half-faded one.
        urgency === "critical" && "animate-bh-urgent",
        className,
      )}
    >
      {units.map((value, index) => (
        <div key={UNIT_LABELS[index]} className="flex items-end gap-1.5">
          {index > 0 && (
            <span aria-hidden className={cn("pb-2 text-lg font-bold opacity-40", accent)}>
              :
            </span>
          )}
          <div className="flex flex-col items-center gap-1">
            <span
              className={cn(
                "flex min-w-11 items-center justify-center rounded-lg px-2 py-1.5 text-xl font-bold sm:min-w-12 sm:text-2xl",
                tone === "dark"
                  ? "border border-white/10 bg-white/[0.06]"
                  : "border border-border bg-secondary-bg",
                accent,
              )}
            >
              <RollingText text={value} />
            </span>
            <span
              className={cn(
                "text-[10px] font-medium tracking-[0.14em] uppercase",
                tone === "dark" ? "text-white/40" : "text-muted",
              )}
            >
              {UNIT_LABELS[index]}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/** The same clock, wired to the round in progress. */
export function RoundCountdown(props: Omit<CountdownProps, "seconds">) {
  const seconds = useAuctionClock();
  return <Countdown seconds={seconds} {...props} />;
}
