"use client";

/* One-click share popover: WhatsApp / X / LinkedIn / Facebook / Copy link, with
 * the viral copy templates from lib/share. Used on feed cards; reusable anywhere
 * a compact share control is needed. */

import { useEffect, useId, useRef, useState } from "react";
import { Check, Link2, Share2 } from "lucide-react";

import { buildShareTargets } from "@/lib/share";
import { SHARE_ICONS } from "@/components/products/social-icons";
import { cn } from "@/lib/utils";

export function ShareMenu({
  url,
  name,
  tagline,
  makerHandle,
  align = "right",
  className,
}: {
  url: string;
  name: string;
  tagline?: string | null;
  makerHandle?: string | null;
  align?: "left" | "right";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuId = useId();

  // Close on outside click / Escape. Listeners only react to events — no
  // synchronous setState in the effect body (repo lint rule).
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);

  const targets = buildShareTargets({ url, name, tagline, makerHandle });

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label="Share"
        onClick={(e) => {
          e.preventDefault();
          setOpen((v) => !v);
        }}
        className="flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-muted transition-colors duration-150 hover:border-primary/40 hover:text-primary"
      >
        <Share2 className="size-3.5" />
        Share
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          className={cn(
            "absolute z-40 mt-2 w-52 overflow-hidden rounded-xl border border-border bg-card p-1.5 shadow-hover",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {targets.map((target) => {
            const Icon = SHARE_ICONS[target.key];
            return (
              <a
                key={target.key}
                href={target.href}
                target="_blank"
                rel="noopener noreferrer"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-ink transition-colors duration-150 hover:bg-secondary-bg"
              >
                <Icon className="size-4 shrink-0 text-muted" />
                {target.label}
              </a>
            );
          })}
          <button
            type="button"
            role="menuitem"
            onClick={copyLink}
            className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-ink transition-colors duration-150 hover:bg-secondary-bg"
          >
            {copied ? (
              <>
                <Check className="size-4 shrink-0 text-success" /> Copied!
              </>
            ) : (
              <>
                <Link2 className="size-4 shrink-0 text-muted" /> Copy link
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
