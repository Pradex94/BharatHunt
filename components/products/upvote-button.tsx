"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { toggleUpvote } from "@/lib/actions/upvotes";
import { Numeric } from "@/components/ui/typography";

export function UpvoteButton({
  productId,
  initialCount,
  initialUpvoted,
  isLoggedIn,
  variant = "inline",
  className,
}: {
  productId: string;
  initialCount: number;
  initialUpvoted: boolean;
  isLoggedIn: boolean;
  /** "inline" is a small pill (used next to other action buttons); "boxed"
   * is the taller arrow-over-count control used in the product list rows. */
  variant?: "inline" | "boxed";
  className?: string;
}) {
  const router = useRouter();
  const [count, setCount] = useState(initialCount);
  const [upvoted, setUpvoted] = useState(initialUpvoted);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!isLoggedIn) {
      router.push("/login");
      return;
    }

    const nextUpvoted = !upvoted;
    setUpvoted(nextUpvoted);
    setCount((c) => c + (nextUpvoted ? 1 : -1));

    startTransition(async () => {
      const result = await toggleUpvote(productId);
      if (result?.error) {
        setUpvoted(!nextUpvoted);
        setCount((c) => c + (nextUpvoted ? -1 : 1));
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      aria-pressed={upvoted}
      className={cn(
        "flex shrink-0 items-center justify-center transition-colors duration-200 disabled:opacity-60",
        className,
        variant === "inline" &&
          cn(
            // Measured at 39x22 on the product page, where this is the primary
            // action on the whole screen. On a touch pointer it grows to a
            // 44px target; with a mouse it stays the compact chip it was.
            "gap-1 rounded-md border px-1.5 py-0.5 text-xs pointer-coarse:min-h-11 pointer-coarse:gap-1.5 pointer-coarse:px-3.5 pointer-coarse:text-sm",
            upvoted
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
          ),
        variant === "boxed" &&
          cn(
            // Narrower pillar on phones so the card's text column keeps its
            // width; the desktop card is unchanged from `sm` up.
            "flex-col gap-0.5 rounded-lg border px-3 py-2.5 pointer-coarse:min-w-11 sm:px-4",
            upvoted
              ? "border-primary/40 bg-primary/10"
              : "border-border bg-background hover:border-primary/40",
          ),
      )}
    >
      <ChevronUp
        className={cn(
          "size-3.5",
          variant === "boxed" && (upvoted ? "text-primary" : "text-muted-foreground"),
        )}
      />
      <Numeric className={cn(variant === "boxed" && "text-sm font-bold", upvoted && variant === "boxed" && "text-primary")}>
        {count}
      </Numeric>
    </button>
  );
}
