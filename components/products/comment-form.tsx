"use client";

import { useActionState } from "react";
import { addComment, type CommentFormState } from "@/lib/actions/comments";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function CommentForm({
  productId,
  productSlug,
}: {
  productId: string;
  productSlug: string;
}) {
  const boundAction = addComment.bind(null, productId, productSlug);
  const [state, formAction, pending] = useActionState<CommentFormState, FormData>(
    boundAction,
    undefined,
  );

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <Textarea
        name="body"
        rows={3}
        maxLength={500}
        placeholder="Share your thoughts…"
        required
      />
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending} size="sm" className="self-end">
        {pending ? "Posting…" : "Post comment"}
      </Button>
    </form>
  );
}
