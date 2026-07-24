export type CommentItemData = {
  id: string;
  body: string;
  created_at: string | null;
  author: { display_name: string; username: string } | null;
};

export function CommentItem({ comment }: { comment: CommentItemData }) {
  const createdAt = comment.created_at ? new Date(comment.created_at) : null;

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted">
        <span className="font-medium text-ink">
          {comment.author?.display_name ?? "Unknown"}
        </span>
        {createdAt && <span>{createdAt.toLocaleDateString()}</span>}
      </div>
      <p className="text-sm leading-relaxed whitespace-pre-wrap text-body">{comment.body}</p>
    </div>
  );
}
