"use client";

import { useState, useTransition } from "react";
import { Heart } from "lucide-react";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { useDiscovery } from "@/components/discovery/discovery-provider";

/**
 * ♡ Save. Works signed out (saved in this browser) and signed in (saved to
 * the account) — see discovery-provider.tsx. Renders a neutral state until
 * the saved list has loaded, so a cached page never flashes the wrong heart.
 */
export function SaveButton({
  productId,
  productName,
  variant = "icon",
  className,
}: {
  productId: string;
  productName: string;
  /** "icon" for dense cards; "labeled" for the product page action row. */
  variant?: "icon" | "labeled";
  className?: string;
}) {
  const { ready, isSaved, toggleSave } = useDiscovery();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const saved = ready && isSaved(productId);
  const label = saved ? `Saved — remove ${productName} from saved` : `Save ${productName}`;

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await toggleSave(productId);
      if (result.error) setError(result.error);
    });
  }

  if (variant === "labeled") {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={!ready || isPending}
        aria-pressed={saved}
        title={error ?? undefined}
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), saved && "border-primary/40 text-primary", className)}
      >
        <Heart aria-hidden="true" className={cn(saved && "fill-current")} />
        {saved ? "Saved" : "Save"}
        {error && <span className="sr-only">{error}</span>}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!ready || isPending}
      aria-pressed={saved}
      aria-label={label}
      title={error ?? (saved ? "Saved" : "Save")}
      className={cn(
        "flex size-8 items-center justify-center rounded-md text-muted transition-colors duration-150 outline-none pointer-coarse:size-11 hover:bg-secondary-bg hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-60",
        saved && "text-primary",
        className,
      )}
    >
      <Heart className={cn("size-4", saved && "fill-current")} aria-hidden="true" />
    </button>
  );
}
