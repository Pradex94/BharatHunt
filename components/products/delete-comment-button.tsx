"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";

import { deleteComment } from "@/lib/actions/comments";

/**
 * Removes one comment. Rendered only for its author and for admins — the
 * server action re-checks both, so this is a convenience, never the gate.
 */
export function DeleteCommentButton({
  commentId,
  productId,
  productSlug,
}: {
  commentId: string;
  productId: string;
  productSlug: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={isPending}
        aria-label="Delete comment"
        onClick={() => {
          if (!window.confirm("Delete this comment? This can't be undone.")) return;
          setError(null);
          startTransition(async () => {
            const result = await deleteComment(commentId, productId, productSlug);
            if (result?.error) setError(result.error);
          });
        }}
        className="text-muted transition-colors hover:text-destructive disabled:opacity-60"
      >
        <Trash2 size={14} aria-hidden="true" />
      </button>
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </span>
  );
}
