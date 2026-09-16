import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";

export default function LaunchCampaignLoading() {
  return (
    <main className="min-h-dvh bg-background py-8 md:py-12" aria-busy="true" aria-label="Loading your launch campaign">
      <Container>
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          <Skeleton className="h-6 w-28" />
          <div className="flex items-center gap-4">
            <Skeleton className="size-14 rounded-full" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-56" />
            </div>
          </div>
          <div className="grid gap-6 lg:grid-cols-5">
            <Skeleton className="h-52 rounded-3xl lg:col-span-3" />
            <Skeleton className="h-52 rounded-3xl lg:col-span-2" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((item) => (
              <Skeleton key={item} className="h-64 rounded-3xl" />
            ))}
          </div>
        </div>
      </Container>
    </main>
  );
}
