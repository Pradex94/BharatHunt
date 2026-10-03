"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bookmark } from "lucide-react";

import { lookupProductsByIds } from "@/lib/actions/saves";
import { useDiscovery } from "@/components/discovery/discovery-provider";
import { ProductLogo } from "@/components/products/product-logo";
import { SECTION_SHELL } from "@/components/landing/section-header";
import type { ProductCardProduct } from "@/components/products/product-card";

const SHOWN = 4;

/**
 * "Continue exploring" for a returning visitor with saves — signed in or not.
 *
 * The homepage is prerendered and identical for everyone, so this is a client
 * island: it renders nothing on the server and nothing for a visitor with no
 * saves, and otherwise makes one rate-limited lookup for at most four cards.
 * Anonymous visitors never need it for the page to make sense.
 */
export function SavedStrip() {
  const { ready, savedIds } = useDiscovery();
  const head = savedIds.slice(0, SHOWN);
  const key = head.join(",");
  const [loaded, setLoaded] = useState<{ key: string; products: ProductCardProduct[] } | null>(null);

  useEffect(() => {
    if (!ready || !key || loaded?.key === key) return;
    let cancelled = false;
    lookupProductsByIds(key.split(","))
      .then((products) => {
        if (!cancelled) setLoaded({ key, products });
      })
      .catch(() => {
        // A personal nicety: on failure the homepage simply goes without it.
      });
    return () => {
      cancelled = true;
    };
  }, [ready, key, loaded?.key]);

  const saved = new Set(savedIds);
  const products = (loaded?.products ?? []).filter((product) => saved.has(product.id));
  if (!ready || products.length === 0) return null;

  return (
    <section aria-labelledby="saved-home" className={`${SECTION_SHELL} py-6`}>
      <div className="rounded-3xl border border-border bg-secondary-bg/60 p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="saved-home" className="flex items-center gap-2 font-sans text-lg font-semibold tracking-normal text-ink">
            <Bookmark className="size-4 text-primary" aria-hidden="true" />
            Continue exploring
          </h2>
          <Link href="/saved" className="text-sm font-semibold text-primary hover:text-primary-active">
            Your saved products ({savedIds.length}) &rarr;
          </Link>
        </div>
        <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {products.map((product) => (
            <li key={product.id}>
              <Link
                href={`/products/${product.slug}`}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 transition-colors hover:border-primary/40"
              >
                <ProductLogo src={product.hero_image_url} name={product.name} size="sm" loading="lazy" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-semibold text-ink">{product.name}</span>
                  <span className="truncate text-xs text-body">{product.tagline}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">
          Looking for more like these?{" "}
          <Link href="/discover" className="font-medium text-primary hover:underline">
            Describe what you need
          </Link>
          .
        </p>
      </div>
    </section>
  );
}
