import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The skeleton /ai renders while its data resolves.
 *
 * Shaped like the real page — hero, AI Pulse strip, the sticky toolbar, the
 * featured story beside the brief, then feed rows — because a skeleton whose
 * proportions do not match what arrives causes a visible jump. The hero's
 * heading is real text: it is static, so it paints immediately.
 */
export default function AiTrendingLoading() {
  return (
    <main className="min-h-dvh bg-background" aria-busy="true">
      <section className="bg-surface-dark">
        <Container className="flex flex-col gap-5 py-8 md:py-12">
          <Skeleton className="h-4 w-36 bg-white/10" />
          <Skeleton className="h-6 w-44 rounded-full bg-white/10" />
          <h1 className="text-3xl leading-[1.08] font-bold text-white sm:text-4xl lg:text-5xl">
            What&rsquo;s Trending in AI?
          </h1>
          <Skeleton className="h-5 w-full max-w-xl bg-white/10" />
          <div className="flex max-w-3xl flex-col gap-3">
            <Skeleton className="h-13 w-full rounded-2xl bg-white/10 sm:h-14" />
            <div className="flex gap-2">
              <Skeleton className="h-10 w-40 bg-white/10" />
              <Skeleton className="h-10 w-36 bg-white/10" />
            </div>
          </div>
        </Container>
      </section>

      {/* AI Pulse */}
      <Container className="flex flex-col gap-3 pt-6 md:pt-8">
        <Skeleton className="h-3 w-20" />
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="flex flex-col gap-2 bg-card px-4 py-4 sm:px-5">
              <Skeleton className="h-7 w-14" />
              <Skeleton className="h-3.5 w-24" />
            </div>
          ))}
        </div>
      </Container>

      {/* Toolbar */}
      <div className="mt-6 border-y border-border bg-background">
        <Container className="flex flex-col gap-2.5 py-2.5">
          <div className="flex gap-2 overflow-hidden">
            {Array.from({ length: 9 }).map((_, index) => (
              <Skeleton key={index} className="h-9 w-28 shrink-0 rounded-full" />
            ))}
          </div>
          <div className="flex justify-between gap-2">
            <Skeleton className="h-9 w-24 lg:w-[640px]" />
            <Skeleton className="hidden h-9 w-40 sm:block" />
          </div>
        </Container>
      </div>

      <Container className="flex flex-col gap-12 py-8 md:py-10">
        {/* Trending Now */}
        <div className="flex flex-col gap-4">
          <Skeleton className="h-7 w-48" />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="overflow-hidden rounded-3xl border border-border bg-card lg:col-span-7">
              <Skeleton className="aspect-[16/9] w-full rounded-none sm:aspect-[2/1]" />
              <div className="flex flex-col gap-3 p-5 sm:p-6">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-7 w-full" />
                <Skeleton className="h-7 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </div>
            <div className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-5 lg:col-span-5">
              <Skeleton className="h-6 w-44" />
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="flex gap-3">
                  <Skeleton className="h-5 w-4" />
                  <div className="flex flex-1 flex-col gap-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-4/5" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-24 w-full rounded-2xl" />
            ))}
          </div>
        </div>

        {/* Feed */}
        <div className="flex flex-col gap-4">
          <Skeleton className="h-7 w-44" />
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="flex gap-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
                <div className="flex flex-1 flex-col gap-2.5">
                  <Skeleton className="h-5 w-24 rounded-full" />
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                  <Skeleton className="h-3 w-40" />
                </div>
                <Skeleton className="size-20 shrink-0 rounded-xl sm:size-28" />
              </div>
            ))}
          </div>
        </div>
      </Container>
    </main>
  );
}
