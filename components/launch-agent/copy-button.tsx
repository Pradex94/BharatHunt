"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Touch-sized copy button. Falls back to a hidden textarea + execCommand where
 * the async clipboard API is unavailable (older in-app browsers on phones), and
 * says so when both fail rather than pretending it worked.
 */
export function CopyButton({ text, label = "Copy", className }: { text: string; label?: string; className?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function copy() {
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      try {
        const area = document.createElement("textarea");
        area.value = text;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        ok = document.execCommand("copy");
        document.body.removeChild(area);
      } catch {
        ok = false;
      }
    }
    setState(ok ? "copied" : "failed");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 1800);
  }

  return (
    <button
      type="button"
      onClick={copy}
      disabled={!text}
      aria-label={`${label}${state === "copied" ? " — copied" : ""}`}
      className={cn(
        "inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-semibold text-ink transition-colors hover:border-primary/30 hover:bg-secondary-bg disabled:opacity-50 pointer-coarse:min-h-11",
        state === "copied" && "border-success/40 text-success",
        state === "failed" && "border-destructive/40 text-destructive",
        className,
      )}
    >
      {state === "copied" ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
      <span aria-live="polite">{state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : label}</span>
    </button>
  );
}
