import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The one heading pattern every homepage section uses, so eleven sections read
 * as one page: an optional eyebrow, the h2, one line of purpose, an optional
 * freshness note, and a single "see more" link on the right.
 */
export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  note,
  action,
  tone = "light",
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** A small factual line — "Last synced 29 Sep, 07:47 IST". */
  note?: React.ReactNode;
  action?: { label: string; href: string };
  tone?: "light" | "dark";
  className?: string;
}) {
  const dark = tone === "dark";
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-3", className)}>
      <div className="flex max-w-2xl min-w-0 flex-col gap-2">
        {eyebrow && (
          <span className="text-xs font-semibold tracking-wider text-primary uppercase">
            {eyebrow}
          </span>
        )}
        <h2
          className={cn(
            "text-2xl font-bold tracking-tight sm:text-3xl",
            dark ? "text-on-dark" : "text-ink",
          )}
        >
          {title}
        </h2>
        {subtitle && (
          <p className={cn("text-base", dark ? "text-on-dark-soft" : "text-body")}>{subtitle}</p>
        )}
        {note && (
          <div className={cn("text-xs", dark ? "text-on-dark-soft" : "text-muted")}>{note}</div>
        )}
      </div>
      {action && (
        <Link
          href={action.href}
          className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-primary transition-colors hover:text-primary-active"
        >
          {action.label}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

/** Horizontal rhythm shared by every homepage section. */
export const SECTION_SHELL = "mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8";
