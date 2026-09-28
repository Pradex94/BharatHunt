"use client";

/*
 * Error boundary for /ai.
 *
 * `searchAiStories` throws on a Supabase error that is not a missing-migration
 * case, and every other read on the page degrades to an empty section — so this
 * is what a reader sees when the feed itself cannot be loaded. It says so in
 * plain words and offers a retry.
 *
 * `retry`, not `reset`: in this Next version `reset` only clears the boundary
 * and re-renders the same failed server payload, while `retry` refreshes the
 * route's server components first — which is what gives a transient database
 * error its second attempt.
 */

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Button, buttonVariants } from "@/components/ui/button";

export default function AiTrendingError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // The digest correlates this with the server-side stack in the platform
    // logs; the message can carry query detail, so it is not rendered.
    console.error("[ai] failed to render:", error.digest ?? error.message);
  }, [error]);

  return (
    <main className="min-h-dvh bg-background">
      <section className="bg-surface-dark">
        <Container className="py-10 md:py-12">
          <h1 className="text-3xl font-bold text-white sm:text-4xl">What&rsquo;s Trending in AI?</h1>
        </Container>
      </section>

      <Container className="py-10 md:py-14">
        <div
          role="alert"
          className="mx-auto flex max-w-xl flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-card p-10 text-center"
        >
          <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <AlertTriangle aria-hidden="true" className="size-6" />
          </span>
          <div>
            <h2 className="text-lg font-bold text-ink">We couldn&rsquo;t load the latest AI stories.</h2>
            <p className="mx-auto mt-1 max-w-sm text-sm text-body">
              This is a problem on our side. Try again in a moment.
            </p>
            {error.digest ? (
              <p className="mt-3 text-xs text-muted">
                Reference: <span className="font-mono">{error.digest}</span>
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button type="button" onClick={retry}>
              Try again
            </Button>
            <Link href="/funding" className={buttonVariants({ variant: "outline" })}>
              Funding Intelligence
            </Link>
          </div>
        </div>
      </Container>
    </main>
  );
}
