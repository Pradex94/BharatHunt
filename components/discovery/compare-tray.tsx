"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus, Scale, X } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { ProductLogo } from "@/components/products/product-logo";
import { MAX_COMPARE, useDiscovery } from "@/components/discovery/discovery-provider";
import { compareHref } from "@/lib/compare-links";

/**
 * The comparison tray: a slim bar pinned to the bottom of the viewport while
 * anything is queued for comparison. It persists across navigation and
 * reloads (localStorage), and steps aside on /compare itself, where the table
 * already shows the same products.
 *
 * Kept clear of the chat bubble (bottom-right, 56px) on phones, and lifted by
 * the cookie banner's height like the bubble is.
 */
export function CompareTray() {
  const pathname = usePathname();
  const { ready, compare, removeFromCompare, clearCompare } = useDiscovery();

  if (!ready || compare.length === 0 || pathname.startsWith("/compare")) return null;

  return (
    <div
      role="region"
      aria-label="Products to compare"
      className="fixed right-[5.25rem] bottom-[calc(0.75rem+var(--bh-consent-h,0px))] left-3 z-40 flex items-center gap-2 rounded-xl border border-border bg-card p-2 shadow-hover sm:right-auto sm:left-1/2 sm:w-[min(40rem,calc(100vw-10rem))] sm:-translate-x-1/2"
    >
      <span className="hidden shrink-0 items-center gap-1.5 pl-1 text-xs font-semibold text-ink sm:flex">
        <Scale className="size-4 text-primary" aria-hidden="true" />
        Compare
      </span>
      <ul className="no-scrollbar flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
        {compare.map((item) => (
          <li
            key={item.id}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background py-1 pr-1 pl-1.5"
          >
            <ProductLogo src={item.logo} name={item.name} size="sm" className="size-6 p-0" />
            <Link href={`/products/${item.slug}`} className="max-w-[7rem] truncate text-xs font-medium text-ink hover:text-primary">
              {item.name}
            </Link>
            <button
              type="button"
              onClick={() => removeFromCompare(item.id)}
              aria-label={`Remove ${item.name} from comparison`}
              className="flex size-6 items-center justify-center rounded text-muted outline-none pointer-coarse:size-9 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </li>
        ))}
        {compare.length < MAX_COMPARE && (
          <li className="shrink-0">
            <Link
              href="/marketplace"
              className="flex items-center gap-1 rounded-lg border border-dashed border-border px-2 py-1.5 text-xs text-muted hover:border-primary/40 hover:text-primary"
            >
              <Plus className="size-3.5" aria-hidden="true" />
              Add
            </Link>
          </li>
        )}
      </ul>
      <button
        type="button"
        onClick={clearCompare}
        className="hidden shrink-0 px-1 text-xs text-muted hover:text-ink sm:block"
      >
        Clear
      </button>
      <Link
        href={compareHref(compare.map((item) => item.slug))}
        aria-disabled={compare.length < 2}
        className={buttonVariants({ size: "sm", className: compare.length < 2 ? "pointer-events-none opacity-50" : "" })}
      >
        Compare{compare.length > 1 ? ` ${compare.length}` : ""}
      </Link>
    </div>
  );
}
