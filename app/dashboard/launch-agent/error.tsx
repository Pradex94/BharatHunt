"use client";

import { useEffect } from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Container } from "@/components/ui/container";

export default function LaunchAgentError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[launch-agent] failed to render:", error.digest ?? error.message);
  }, [error]);

  return (
    <main className="min-h-dvh bg-background py-12 md:py-16">
      <Container>
        <div role="alert" className="mx-auto flex max-w-xl flex-col items-center gap-4 rounded-3xl border border-border bg-card p-8 text-center shadow-soft">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <TriangleAlert className="size-6" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-lg font-bold text-ink">We couldn&apos;t load your Launch Agent right now.</h1>
            <p className="mt-1 text-sm text-body">Your BharatHunt product is safe.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={reset}>Try Again</Button>
            <Link href="/dashboard" className={buttonVariants({ variant: "outline" })}>
              Your products
            </Link>
          </div>
        </div>
      </Container>
    </main>
  );
}
