"use client";

import { useState, useTransition } from "react";
import { Star } from "lucide-react";

import { clearRating, rateProduct } from "@/lib/actions/ratings";
import { cn } from "@/lib/utils";

/**
 * The star control on a product page.
 *
 * Optimistic on the caller's own star only, never on the average: the average is
 * recomputed by a database trigger across everyone's ratings, so guessing it
 * client-side would show a number that is about to be replaced by a different
 * one. The count and the mean come back from the server on revalidation.
 *
 * Owners see the summary without the control, because the database refuses a
 * self-rating and offering a button that always errors is worse than not
 * offering one.
 */
export function RatingStars({
  productId,
  productSlug,
  average,
  count,
  myRating,
  canRate,
}: {
  productId: string;
  productSlug: string;
  average: number | null;
  count: number;
  myRating: number | null;
  /** False for signed-out visitors and for the product's own maker. */
  canRate: boolean;
}) {
  const [mine, setMine] = useState<number | null>(myRating);
  const [hover, setHover] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const shown = hover ?? mine ?? (average ? Math.round(average) : 0);

  function submit(value: number) {
    setError(null);
    const next = mine === value ? null : value;
    setMine(next);
    startTransition(async () => {
      const result = next
        ? await rateProduct(productId, productSlug, value)
        : await clearRating(productId, productSlug);
      if (result?.error) {
        setMine(myRating); // put it back; the server said no
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <div
          className="flex items-center gap-0.5"
          onMouseLeave={() => setHover(null)}
          role={canRate ? "radiogroup" : undefined}
          aria-label={canRate ? "Rate this product" : undefined}
        >
          {[1, 2, 3, 4, 5].map((value) => {
            const filled = value <= shown;
            const star = (
              <Star
                size={18}
                className={cn(
                  "transition-colors",
                  filled ? "fill-primary text-primary" : "text-border",
                )}
                aria-hidden="true"
              />
            );

            if (!canRate) return <span key={value}>{star}</span>;

            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={mine === value}
                aria-label={`${value} ${value === 1 ? "star" : "stars"}`}
                disabled={isPending}
                onMouseEnter={() => setHover(value)}
                onFocus={() => setHover(value)}
                onBlur={() => setHover(null)}
                onClick={() => submit(value)}
                className="cursor-pointer disabled:opacity-60"
              >
                {star}
              </button>
            );
          })}
        </div>

        <span className="text-sm text-muted">
          {count > 0 ? (
            <>
              <span className="font-semibold text-ink">{average?.toFixed(1)}</span> ·{" "}
              {count === 1 ? "1 rating" : `${count} ratings`}
            </>
          ) : (
            "No ratings yet"
          )}
        </span>
      </div>

      {canRate && (
        <p className="text-xs text-muted">
          {mine ? `You rated this ${mine}/5 — click again to remove.` : "Tap a star to rate."}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
