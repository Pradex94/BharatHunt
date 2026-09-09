import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The skeleton /ai renders while its data resolves (section 26).
 *
 * Shaped like the real page — dark hero, control bar, one large card, a rail,
 * then the two-column feed — because a skeleton whose proportions do not match
 * what arrives causes a visible jump, which is worse than a plain spinner. The
 * hero is not a skeleton at all: its heading and subheading are static text, so
 * they can be painted immediately and the reader has something to read while the
 * stories load.
 */
export default function AiTrendingLoading() {
  return (
    <main className="min-h-dvh bg-background">
      <section className="bg-surface-dark">
        <Container className="flex flex-col gap-6 py-12 md:py-16">
          <Skeleton className="h-6 w-32 bg-white/10" />
          <Skeleton className="h-10 w-full max-w-2xl bg-white/10 sm:h-14" />
          <Skeleton className="h-5 w-full max-w-xl bg-white/10" />
          <Skeleton className="h-12 w-full max-w-2xl bg-white/10" />
          <Skeleton className="h-4 w-56 bg-white/10" />
        </Container>
      </section>

      <div className="border-b border-border bg-background">
        <Container className="flex gap-2 overflow-hidden py-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-9 w-28 shrink-0 rounded-full" />
          ))}
        </Container>
      </div>

      <Container className="flex flex-col gap-10 py-8 md:py-10">
        <Skeleton className="h-64 w-full rounded-3xl" />

        <div className="flex flex-col gap-3">
          <Skeleton className="h-6 w-40" />
          <div className="grid grid-cols-1 gap-2 rounded-2xl border border-border bg-card p-3 lg:grid-cols-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px] lg:items-start">
          <div className="flex flex-col gap-4">
            <Skeleton className="h-6 w-44" />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-44 w-full rounded-2xl" />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-52 w-full rounded-2xl" />
            ))}
          </div>
        </div>
      </Container>
    </main>
  );
}
