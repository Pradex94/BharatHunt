"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, Loader2 } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { loadMoreLaunches } from "@/lib/actions/home";
import { LaunchCard, type LaunchCardProduct } from "@/components/landing/launch-card";
import { SECTION_SHELL, SectionHeader } from "@/components/landing/section-header";

/**
 * "Recently launched" — newest first, six at a time.
 *
 * The first six arrive in the prerendered HTML. "Load more" asks the server for
 * the next six only when someone clicks: no polling, no prefetching of pages
 * nobody asked for. Anything already shown higher on the page (Today's Hunt) is
 * skipped, so a card never appears twice.
 *
 * Deliberately not wrapped in `FadeIn`: appended cards should simply appear.
 */
export function RecentLaunches({
  initial,
  initialOffset,
  exclude,
}: {
  initial: LaunchCardProduct[];
  /** Position in the newest-first order right after the last card in `initial`. */
  initialOffset: number;
  /** Ids already on the page, never to be repeated here. */
  exclude: string[];
}) {
  const [items, setItems] = useState(initial);
  const [offset, setOffset] = useState(initialOffset);
  const [hasMore, setHasMore] = useState(initial.length > 0);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  if (initial.length === 0) return null;

  function loadMore() {
    setFailed(false);
    startTransition(async () => {
      try {
        const page = await loadMoreLaunches(offset);
        const seen = new Set([...exclude, ...items.map((item) => item.id)]);
        setItems((current) => [...current, ...page.products.filter((p) => !seen.has(p.id))]);
        setOffset((current) => current + page.products.length);
        setHasMore(page.hasMore);
      } catch {
        setFailed(true);
      }
    });
  }

  return (
    <section className={`${SECTION_SHELL} py-12 md:py-16`}>
      <SectionHeader
        eyebrow="Just in"
        title="Recently Launched"
        subtitle="The newest products on Bharat Hunt."
        action={{ label: "See all launches", href: "/marketplace?sort=newest" }}
      />

      <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((product) => (
          <li key={product.id}>
            <LaunchCard product={product} />
          </li>
        ))}
      </ul>

      <div className="mt-8 flex flex-col items-center gap-2" aria-live="polite">
        {failed && (
          <p className="text-sm text-body">Something went wrong loading more launches.</p>
        )}
        {hasMore ? (
          <button
            type="button"
            onClick={loadMore}
            disabled={pending}
            className={buttonVariants({ variant: "outline", size: "lg", className: "min-w-44" })}
          >
            {pending ? (
              <>
                <Loader2 className="animate-spin" aria-hidden="true" /> Loading…
              </>
            ) : failed ? (
              "Try again"
            ) : (
              "Load more"
            )}
          </button>
        ) : (
          <Link
            href="/marketplace?sort=newest"
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            See all launches <ArrowRight aria-hidden="true" />
          </Link>
        )}
      </div>
    </section>
  );
}
