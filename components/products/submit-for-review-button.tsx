"use client";

import { useState, useTransition } from "react";

import { submitForReview } from "@/lib/actions/review";

/**
 * Puts a draft back in the review queue.
 *
 * A draft is where a launch lands when a reviewer sends it back, so this is the
 * maker's way to say "I fixed it". Without it a rejection would be terminal,
 * which is the opposite of what sending something back is for.
 */
export function SubmitForReviewButton({
  productId,
  className,
}: {
  productId: string;
  className?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  if (sent) {
    return <span className="text-sm font-medium text-primary">Sent for review</span>;
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await submitForReview(productId);
            if (result.ok) setSent(true);
            else setError(result.error);
          });
        }}
        className={
          className ?? "text-sm font-medium text-primary hover:underline disabled:opacity-60"
        }
      >
        {isPending ? "Sending…" : "Submit for review"}
      </button>
      {error && (
        <span role="alert" className="max-w-[16rem] text-right text-xs text-destructive">
          {error}
        </span>
      )}
    </span>
  );
}
