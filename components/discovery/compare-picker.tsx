"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";

import { fetchSearchSuggestions } from "@/lib/actions/search";
import { compareHref, MAX_COMPARE_PRODUCTS } from "@/lib/compare-links";
import { ProductLogo } from "@/components/products/product-logo";
import { useDebounce } from "@/hooks/use-debounce";
import type { SearchSuggestions } from "@/lib/search";

/**
 * "Add a product" on /compare. Reuses the navbar's search suggestions (same
 * action, same rate limit) rather than a second lookup endpoint, and edits the
 * URL — the comparison page is URL-driven, so the result is shareable.
 */
export function ComparePicker({ current }: { current: string[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const debounced = useDebounce(query, 250);
  const [results, setResults] = useState<SearchSuggestions["products"]>([]);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const term = debounced.trim();
    if (term.length < 2) return;
    let cancelled = false;
    fetchSearchSuggestions(term)
      .then((suggestions) => {
        if (!cancelled) setResults(suggestions.products.filter((product) => !current.includes(product.slug)));
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, current]);

  if (current.length >= MAX_COMPARE_PRODUCTS) {
    return <p className="text-sm text-muted">You are comparing the maximum of {MAX_COMPARE_PRODUCTS} products.</p>;
  }

  const visible = query.trim().length >= 2 ? results : [];

  return (
    <div className="relative w-full max-w-md">
      <label htmlFor="compare-picker" className="sr-only">
        Add a product to compare
      </label>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
      <input
        id="compare-picker"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Add a product to compare…"
        autoComplete="off"
        className="h-10 w-full rounded-md border border-border bg-background pr-3 pl-9 text-sm text-ink outline-none placeholder:text-muted focus-visible:ring-2 focus-visible:ring-ring/50 pointer-coarse:h-11"
      />
      {visible.length > 0 && (
        <ul className="absolute top-full right-0 left-0 z-20 mt-1 max-h-72 overflow-y-auto rounded-md border border-border bg-card p-1 shadow-hover">
          {visible.map((product) => (
            <li key={product.slug}>
              <button
                type="button"
                disabled={isPending}
                onClick={() =>
                  startTransition(() => {
                    setQuery("");
                    router.push(compareHref([...current, product.slug]));
                  })
                }
                className="flex w-full items-center gap-3 rounded px-2 py-2 text-left hover:bg-secondary-bg focus-visible:bg-secondary-bg focus-visible:outline-none"
              >
                <ProductLogo src={product.hero_image_url} name={product.name} size="sm" className="size-8 p-1" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{product.name}</span>
                  <span className="block truncate text-xs text-muted">{product.tagline}</span>
                </span>
                <Plus className="size-4 shrink-0 text-primary" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
