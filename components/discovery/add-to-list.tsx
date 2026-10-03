"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Check, FolderPlus, Lock, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";
import { createList, listMyLists, setListMembership, type ListSummary } from "@/lib/actions/lists";
import { useDiscovery } from "@/components/discovery/discovery-provider";

/**
 * "Add to collection" on a product page: a small panel listing the visitor's
 * collections with a checkbox each, plus a one-field "new collection" form.
 * Lists load when the panel first opens, not with the page — product pages
 * stay one cached read for everyone who never touches this.
 */
export function AddToListButton({ productId, productName }: { productId: string; productName: string }) {
  const { isSignedIn } = useDiscovery();
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<ListSummary[] | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (panel.current && !panel.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next && lists === null && isSignedIn) {
      startTransition(async () => setLists(await listMyLists(productId)));
    }
  }

  function toggle(list: ListSummary) {
    setError(null);
    const member = !list.contains;
    setLists((prev) => prev?.map((l) => (l.id === list.id ? { ...l, contains: member, count: l.count + (member ? 1 : -1) } : l)) ?? prev);
    startTransition(async () => {
      const result = await setListMembership(list.id, productId, member);
      if (!result.ok) {
        setError(result.error);
        setLists((prev) => prev?.map((l) => (l.id === list.id ? list : l)) ?? prev);
      } else if (member) {
        trackEvent("collection_product_add", { product_id: productId });
      }
    });
  }

  function create(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await createList({ title, productId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      trackEvent("collection_create", {});
      trackEvent("collection_product_add", { product_id: productId });
      setLists((prev) => [result.list, ...(prev ?? [])]);
      setTitle("");
    });
  }

  const inCount = lists?.filter((list) => list.contains).length ?? 0;

  return (
    <div ref={panel} className="relative">
      <button
        type="button"
        onClick={toggleOpen}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), inCount > 0 && "border-primary/40 text-primary")}
      >
        <FolderPlus aria-hidden="true" />
        {inCount > 0 ? `In ${inCount} ${inCount === 1 ? "collection" : "collections"}` : "Collect"}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={`Add ${productName} to a collection`}
          className="absolute top-full left-0 z-30 mt-2 w-72 rounded-xl border border-border bg-card p-3 shadow-hover"
        >
          {!isSignedIn ? (
            <div className="flex flex-col gap-2 text-sm">
              <p className="text-body">Collections are saved to your account so you can share them.</p>
              <Link href="/login" className={buttonVariants({ size: "sm" })}>
                Sign in to collect
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold text-muted">Add to collection</p>
              {lists === null ? (
                <p className="py-2 text-sm text-muted">Loading…</p>
              ) : lists.length === 0 ? (
                <p className="py-1 text-sm text-body">No collections yet — name your first one below.</p>
              ) : (
                <ul className="flex max-h-56 flex-col gap-0.5 overflow-y-auto">
                  {lists.map((list) => (
                    <li key={list.id}>
                      <button
                        type="button"
                        role="menuitemcheckbox"
                        aria-checked={list.contains}
                        disabled={isPending}
                        onClick={() => toggle(list)}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-ink hover:bg-secondary-bg disabled:opacity-60 pointer-coarse:py-2.5"
                      >
                        <span
                          className={cn(
                            "flex size-4 shrink-0 items-center justify-center rounded border",
                            list.contains ? "border-primary bg-primary text-primary-foreground" : "border-border",
                          )}
                          aria-hidden="true"
                        >
                          {list.contains && <Check className="size-3" />}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{list.title}</span>
                        {!list.isPublic && <Lock className="size-3 text-muted" aria-label="Private" />}
                        <span className="font-mono text-xs text-muted">{list.count}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <form onSubmit={create} className="flex gap-2 border-t border-border pt-2">
                <label htmlFor={`new-list-${productId}`} className="sr-only">
                  New collection name
                </label>
                <input
                  id={`new-list-${productId}`}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={80}
                  placeholder="New collection…"
                  className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 pointer-coarse:h-10"
                />
                <button
                  type="submit"
                  disabled={isPending || !title.trim()}
                  aria-label="Create collection"
                  className={buttonVariants({ size: "icon-sm" })}
                >
                  <Plus aria-hidden="true" />
                </button>
              </form>
              {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
              <Link href="/saved#collections" className="text-xs text-primary hover:underline">
                Manage collections
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
