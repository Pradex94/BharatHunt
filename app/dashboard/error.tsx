"use client";

/*
 * Error boundary for the maker dashboard.
 *
 * `getProductsByCreator` throws on any Supabase error, and until now there was
 * no error.tsx anywhere in this app — so a transient query failure rendered
 * Next's generic error page. From the maker's side that is indistinguishable
 * from "my products are gone", which is exactly how the problem gets reported.
 *
 * This does two things the generic page cannot: it says the launches are safe
 * (they are — nothing here deletes), and it offers a retry, since `reset()`
 * re-runs the server component and a transient failure clears on the second
 * attempt.
 */

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Button, buttonVariants } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest correlates this to the server-side stack in the platform logs.
    // The message itself can carry query detail, so it is not rendered.
    console.error("[dashboard] failed to render:", error.digest ?? error.message);
  }, [error]);

  return (
    <main className="min-h-dvh bg-background py-12 md:py-16">
      <Container>
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">Your products</h1>

          <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-card p-12 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <AlertTriangle className="size-6" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-ink">We couldn&apos;t load your launches</h2>
              <p className="mx-auto mt-1 max-w-sm text-sm text-body">
                This is a problem on our side, not with your products — nothing has been
                deleted. Try again in a moment.
              </p>
              {error.digest && (
                <p className="mt-3 text-xs text-muted">
                  Reference: <span className="font-mono">{error.digest}</span>
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button type="button" onClick={reset}>
                Try again
              </Button>
              <Link href="/marketplace" className={buttonVariants({ variant: "outline" })}>
                Browse the marketplace
              </Link>
            </div>
          </div>
        </div>
      </Container>
    </main>
  );
}
