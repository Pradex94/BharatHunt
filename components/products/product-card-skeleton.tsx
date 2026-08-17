import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading placeholder for <ProductCard />.
 *
 * Lives next to the card it stands in for, and mirrors its box model exactly —
 * same padding (`p-4 sm:p-5`), same gap, same upvote pillar and `size-14` logo,
 * same four-line content stack. The point of a skeleton is that the real card
 * lands in the space the skeleton already reserved; if the two drift apart the
 * skeleton stops preventing layout shift and starts causing it, which is what
 * the marketplace list was doing (a 3-column grid standing in for a
 * single-column list).
 */
export function ProductCardSkeleton() {
  return (
    <div className="flex gap-4 rounded-xl border border-border bg-card p-4 sm:p-5">
      {/* Upvote pillar — matches variant="boxed": px-4 py-2.5 around two lines. */}
      <Skeleton className="h-[3.25rem] w-12 shrink-0 rounded-lg" />

      {/* Logo — ProductLogo size="md" is size-14. */}
      <Skeleton className="size-14 shrink-0 rounded-full" />

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {/* Title + category + pricing badges */}
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-32 max-w-[45%]" />
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="hidden h-5 w-14 rounded-full sm:block" />
        </div>

        {/* Tagline — line-clamp-1 text-sm */}
        <Skeleton className="h-4 w-full max-w-[85%]" />

        {/* Platform + tag pills */}
        <div className="mt-0.5 flex gap-1.5">
          <Skeleton className="h-[1.125rem] w-12 rounded-md" />
          <Skeleton className="h-[1.125rem] w-16 rounded-md" />
          <Skeleton className="hidden h-[1.125rem] w-14 rounded-md sm:block" />
        </div>

        {/* Footer: maker · comments · share */}
        <div className="mt-1.5 flex items-center gap-3">
          <Skeleton className="h-5 w-24 rounded-full" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="ml-auto size-6 rounded-md" />
        </div>
      </div>
    </div>
  );
}

/** `count` cards in the same single-column stack the real list uses. */
export function ProductListSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}
