"use client";

import { useTransition } from "react";
import { deleteProduct } from "@/lib/actions/products";

export function DeleteProductButton({ productId }: { productId: string }) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!window.confirm("Delete this product? This can't be undone.")) return;
    startTransition(() => {
      deleteProduct(productId);
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="text-sm text-destructive underline underline-offset-4 disabled:opacity-60"
    >
      {isPending ? "Deleting…" : "Delete"}
    </button>
  );
}
