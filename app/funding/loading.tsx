import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiSkeleton, RoundListSkeleton } from "@/components/funding/states";

/**
 * The route-level fallback.
 *
 * The page streams each section behind its own Suspense boundary, so this only
 * shows for the brief window before the shell is ready — and it mirrors the
 * shell's layout rather than showing a spinner, so nothing jumps when the real
 * content replaces it.
 */
export default function FundingLoading() {
  return (
    <main className="min-h-dvh bg-background">
      <section className="border-b border-border bg-secondary-bg/40">
        <Container className="flex flex-col gap-6 pt-6 pb-10 md:pt-8 md:pb-14">
          <Skeleton className="h-3 w-40" />
          <div className="flex max-w-3xl flex-col gap-5">
            <Skeleton className="h-7 w-64 rounded-full" />
            <Skeleton className="h-12 w-full max-w-2xl" />
            <Skeleton className="h-5 w-full max-w-xl" />
            <Skeleton className="h-14 w-full rounded-2xl" />
            <div className="flex flex-col gap-3 sm:flex-row">
              <Skeleton className="h-12 w-full rounded-xl sm:w-52" />
              <Skeleton className="h-12 w-full rounded-xl sm:w-44" />
            </div>
          </div>
        </Container>
      </section>

      <Container className="flex flex-col gap-16 py-8 md:gap-24 md:py-10">
        <KpiSkeleton />
        <div className="flex flex-col gap-5">
          <Skeleton className="h-9 w-72" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <RoundListSkeleton />
        </div>
      </Container>
    </main>
  );
}
