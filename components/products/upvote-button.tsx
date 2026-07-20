"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { toggleUpvote } from "@/lib/actions/upvotes";

export function UpvoteButton({
  productId,
  initialCount,
  initialUpvoted,
  isLoggedIn,
}: {
  productId: string;
  initialCount: number;
  initialUpvoted: boolean;
  isLoggedIn: boolean;
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
        "flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs transition-colors disabled:opacity-60",
        upvoted
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
      )}
    >
      <ChevronUp className="size-3.5" />
      {count}
    </button>
  );
}
