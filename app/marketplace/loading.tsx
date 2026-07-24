import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";

export default function MarketplaceLoading() {
  return (
    <Container className="flex flex-1 flex-col gap-6 py-10">
      <Skeleton className="h-8 w-48" />

      <div className="flex flex-col gap-4">
        <Skeleton className="h-9 w-full max-w-md" />
        <div className="hidden items-center justify-between gap-4 md:flex">
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-24" />
            ))}
          </div>
          <Skeleton className="h-8 w-48" />
        </div>
        <Skeleton className="h-9 w-full md:hidden" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="flex gap-4 rounded-2xl border border-border bg-card p-4">
            <Skeleton className="size-14 shrink-0 rounded-xl" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="mt-2 h-3.5 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </Container>
  );
}
