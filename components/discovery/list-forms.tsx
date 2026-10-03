"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Globe, Lock, Trash2, X } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";
import { createList, deleteList, setListMembership, updateList } from "@/lib/actions/lists";
import { LIST_NAME_IDEAS, MAX_DESCRIPTION_LENGTH, MAX_TITLE_LENGTH } from "@/lib/lists";

const INPUT =
  "h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring/50 pointer-coarse:h-11";

/** "New collection" on /saved. */
export function CreateListForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await createList({ title, isPublic });
          if (!result.ok) return setError(result.error);
          trackEvent("collection_create", {});
          router.push(`/lists/${result.list.slug}`);
        });
      }}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
    >
      <label htmlFor="new-list-title" className="text-sm font-semibold text-ink">
        New collection
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="new-list-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={MAX_TITLE_LENGTH}
          placeholder="e.g. My AI startup stack"
          className={INPUT}
        />
        <Button type="submit" disabled={isPending || !title.trim()}>
          Create
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {LIST_NAME_IDEAS.map((idea) => (
          <button
            key={idea}
            type="button"
            onClick={() => setTitle(idea)}
            className="rounded-full border border-border px-2.5 py-1 text-xs text-muted hover:border-primary/40 hover:text-primary"
          >
            {idea}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm text-body">
        <input type="checkbox" checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} className="accent-[var(--color-primary)]" />
        Public — anyone with the link can see it
      </label>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </form>
  );
}

/** Rename, describe, publish/unpublish, share and delete — shown to the owner on /lists/[slug]. */
export function ListOwnerControls({
  list,
  shareUrl,
}: {
  list: { id: string; title: string; description: string | null; isPublic: boolean };
  shareUrl: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(list.title);
  const [description, setDescription] = useState(list.description ?? "");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save(input: Parameters<typeof updateList>[1]) {
    setError(null);
    startTransition(async () => {
      const result = await updateList(list.id, input);
      if (!result.ok) return setError(result.error);
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-secondary-bg/50 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-ink">
          {list.isPublic ? <Globe className="size-4 text-primary" aria-hidden="true" /> : <Lock className="size-4 text-muted" aria-hidden="true" />}
          {list.isPublic ? "Public" : "Private — only you can see this"}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={isPending} onClick={() => save({ isPublic: !list.isPublic })}>
            {list.isPublic ? "Make private" : "Make public"}
          </Button>
          {list.isPublic && (
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(shareUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {
                  setError("Could not copy — the link is in your address bar.");
                }
              }}
            >
              {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              {copied ? "Copied" : "Copy link"}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setEditing((value) => !value)}>
            {editing ? "Cancel" : "Edit"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            aria-label="Delete collection"
            onClick={() => {
              if (!window.confirm(`Delete “${list.title}”? This cannot be undone.`)) return;
              startTransition(async () => {
                const result = await deleteList(list.id);
                if (!result.ok) return setError(result.error);
                router.push("/saved#collections");
              });
            }}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      </div>

      {editing && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            save({ title, description });
          }}
          className="flex flex-col gap-2"
        >
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Name
            <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={MAX_TITLE_LENGTH} className={INPUT} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Description (optional)
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={MAX_DESCRIPTION_LENGTH}
              rows={2}
              className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            />
          </label>
          <Button type="submit" size="sm" disabled={isPending || !title.trim()} className="self-start">
            Save
          </Button>
        </form>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

/** Owner-only "remove from this collection" under a card. */
export function RemoveFromListButton({ listId, productId, productName }: { listId: string; productId: string; productName: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await setListMembership(listId, productId, false);
          if (result.ok) router.refresh();
        })
      }
      className={buttonVariants({ variant: "ghost", size: "sm", className: "text-muted" })}
      aria-label={`Remove ${productName} from this collection`}
    >
      <X aria-hidden="true" />
      Remove
    </button>
  );
}
