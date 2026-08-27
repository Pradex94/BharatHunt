import { formatDate } from "@/lib/format-date";
import { DeleteCommentButton } from "@/components/products/delete-comment-button";

export type CommentItemData = {
  id: string;
  body: string;
  created_at: string | null;
  user_id: string | null;
  author: { display_name: string; username: string } | null;
};

export function CommentItem({
  comment,
  productId,
  productSlug,
  canDelete = false,
}: {
  comment: CommentItemData;
  productId: string;
  productSlug: string;
  /** True for the comment's own author and for admins. */
  canDelete?: boolean;
}) {
  // Server-rendered, so this never mismatched during hydration — but it was
  // still asking a UTC/en-US Vercel function for "its" date format and showing
  // the answer to an Indian audience.
  const createdAt = formatDate(comment.created_at);

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted">
        <span className="font-medium text-ink">{comment.author?.display_name ?? "Unknown"}</span>
        {createdAt && <span>{createdAt}</span>}
        {canDelete && (
          <span className="ml-auto">
            <DeleteCommentButton
              commentId={comment.id}
              productId={productId}
              productSlug={productSlug}
            />
          </span>
        )}
      </div>
      <p className="text-sm leading-relaxed whitespace-pre-wrap text-body">{comment.body}</p>
    </div>
  );
}
