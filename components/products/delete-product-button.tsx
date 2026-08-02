"use client";

import { useState, useTransition } from "react";
import { deleteProduct } from "@/lib/actions/products";

export function DeleteProductButton({
  productId,
  productName,
  redirectTo = "/marketplace",
}: {
  productId: string;
  /** Named in the confirm prompt — worth passing in a table of many rows. */
  productName?: string;
  /** Where to land afterwards; `null` stays on the current page (admin table). */
  redirectTo?: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    const target = productName ? `“${productName}”` : "this product";
    if (!window.confirm(`Delete ${target}? This can't be undone.`)) return;

    setError(null);
    startTransition(async () => {
      // A successful delete either redirects or returns undefined; anything
      // else is a real failure and has to stay on screen.
      const result = await deleteProduct(productId, redirectTo);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="text-sm text-destructive underline underline-offset-4 disabled:opacity-60"
      >
        {isPending ? "Deleting…" : "Delete"}
      </button>
      {error && (
        <span role="alert" className="max-w-[16rem] text-right text-xs text-destructive">
          {error}
        </span>
      )}
    </span>
  );
}
