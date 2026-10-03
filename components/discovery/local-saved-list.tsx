"use client";

import { useEffect, useState } from "react";

import { lookupProductsByIds } from "@/lib/actions/saves";
import { ProductCard, type ProductCardProduct } from "@/components/products/product-card";
import { useDiscovery } from "@/components/discovery/discovery-provider";
import { SavedEmptyState } from "@/components/discovery/saved-empty-state";

/**
 * The saved list for a signed-out visitor: ids from this browser, cards from
 * one rate-limited lookup. Unsaving a product removes it from view at once;
 * the lookup is not repeated for that.
 */
export function LocalSavedList() {
  const { ready, localSavedIds } = useDiscovery();
  const [loaded, setLoaded] = useState<{ asked: Set<string>; products: ProductCardProduct[] } | null>(null);
  // Only a newly saved id (another tab) needs a lookup; removals filter locally.
  const needsLookup = localSavedIds.some((id) => !loaded?.asked.has(id));

  useEffect(() => {
    if (!ready || !needsLookup) return;
    let cancelled = false;
    const ids = [...localSavedIds];
    lookupProductsByIds(ids).then((products) => {
      if (!cancelled) setLoaded({ asked: new Set(ids), products });
    });
    return () => {
      cancelled = true;
    };
  }, [ready, needsLookup, localSavedIds]);

  if (!ready) return <p className="text-sm text-muted">Loading your saved products…</p>;

  const saved = new Set(localSavedIds);
  const products = (loaded?.products ?? []).filter((product) => saved.has(product.id));

  if (localSavedIds.length === 0) return <SavedEmptyState />;
  if (!loaded) return <p className="text-sm text-muted">Loading your saved products…</p>;
  if (products.length === 0) return <SavedEmptyState />;

  return (
    <div className="flex flex-col gap-3">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} isUpvoted={false} isLoggedIn={false} />
      ))}
    </div>
  );
}
