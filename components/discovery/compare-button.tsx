"use client";

import { useEffect, useState } from "react";
import { Check, Scale } from "lucide-react";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import {
  MAX_COMPARE,
  useDiscovery,
  type CompareItem,
} from "@/components/discovery/discovery-provider";

/** + Compare: adds a product to the comparison tray, or takes it out again. */
export function CompareButton({
  item,
  variant = "icon",
  className,
}: {
  item: CompareItem;
  variant?: "icon" | "labeled";
  className?: string;
}) {
  const { ready, isComparing, addToCompare, removeFromCompare } = useDiscovery();
  const [full, setFull] = useState(false);
  const active = ready && isComparing(item.id);

  useEffect(() => {
    if (!full) return;
    const timer = setTimeout(() => setFull(false), 2500);
    return () => clearTimeout(timer);
  }, [full]);

  function handleClick() {
    if (active) {
      removeFromCompare(item.id);
      return;
    }
    if (!addToCompare(item)) setFull(true);
  }

  const status = full ? `You can compare up to ${MAX_COMPARE} products` : null;

  if (variant === "labeled") {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={!ready}
        aria-pressed={active}
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), active && "border-primary/40 text-primary", className)}
      >
        {active ? <Check aria-hidden="true" /> : <Scale aria-hidden="true" />}
        {full ? `Up to ${MAX_COMPARE}` : active ? "Comparing" : "Compare"}
        <span className="sr-only" aria-live="polite">
          {status}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!ready}
      aria-pressed={active}
      aria-label={active ? `Remove ${item.name} from comparison` : `Add ${item.name} to comparison`}
      title={status ?? (active ? "In comparison" : "Compare")}
      className={cn(
        "flex size-8 items-center justify-center rounded-md text-muted transition-colors duration-150 outline-none pointer-coarse:size-11 hover:bg-secondary-bg hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-60",
        active && "text-primary",
        full && "text-primary",
        className,
      )}
    >
      {active ? <Check className="size-4" aria-hidden="true" /> : <Scale className="size-4" aria-hidden="true" />}
      <span className="sr-only" aria-live="polite">
        {status}
      </span>
    </button>
  );
}
