import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";
import { RoundListSkeleton, SnapshotSkeleton } from "@/components/funding/states";

/**
 * The route-level fallback.
 *
 * The page itself streams each section behind its own Suspense boundary, so
 * this only shows for the brief window before the shell is ready — and it
 * mirrors the shell's layout rather than showing a spinner, so nothing jumps
 * when the real content replaces it.
 */
export default function FundingLoading() {
  return (
    <main className="min-h-dvh bg-background">
      <section className="border-b border-border bg-secondary-bg/40">
        <Container className="flex flex-col gap-6 py-10 md:py-14">
          <Skeleton className="h-3 w-40" />
          <div className="flex flex-col gap-5">
            <Skeleton className="h-8 w-44 rounded-full" />
            <Skeleton className="h-12 w-full max-w-3xl" />
            <Skeleton className="h-12 w-full max-w-2xl" />
            <Skeleton className="h-5 w-full max-w-xl" />
            <Skeleton className="h-12 w-full max-w-xl rounded-xl" />
            <div className="flex gap-3">
              <Skeleton className="h-11 w-40 rounded-md" />
              <Skeleton className="h-11 w-44 rounded-md" />
            </div>
          </div>
        </Container>
      </section>

      <Container className="flex flex-col gap-14 py-10 md:py-14">
        <SnapshotSkeleton />
        <div className="flex flex-col gap-6">
          <Skeleton className="h-9 w-72" />
          <RoundListSkeleton />
        </div>
      </Container>
    </main>
  );
}
