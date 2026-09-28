import { TrustStripSkeleton } from "@/components/landing/trust-strip";
import { TodaysHuntSkeleton } from "@/components/landing/todays-hunt";

/**
 * The homepage's loading state — shown only on a client-side navigation back
 * to "/" before its payload arrives (a direct visit gets prerendered HTML).
 *
 * Shaped like the real page, block for block, so nothing jumps when it fills:
 * hero (headline, search, CTAs), the stats strip, and Today's Hunt.
 */
export default function HomeLoading() {
  return (
    <div aria-busy="true" aria-label="Loading Bharat Hunt">
      <div className="bg-[linear-gradient(180deg,#fff3ec_0%,#fff9f5_55%,#ffffff_100%)]">
        <div className="mx-auto grid grid-cols-1 w-full max-w-7xl items-center gap-10 px-4 pt-12 pb-10 sm:px-6 md:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] lg:gap-14 lg:px-8 lg:pt-20 lg:pb-16">
          <div className="flex flex-col gap-6">
            <div className="h-8 w-64 animate-pulse rounded-full bg-secondary-bg" />
            <div className="flex flex-col gap-3">
              <div className="h-12 w-full max-w-lg animate-pulse rounded-xl bg-secondary-bg sm:h-16" />
              <div className="h-12 w-3/4 max-w-md animate-pulse rounded-xl bg-secondary-bg sm:h-16" />
            </div>
            <div className="h-5 w-full max-w-xl animate-pulse rounded bg-secondary-bg" />
            <div className="h-14 w-full max-w-xl animate-pulse rounded-2xl bg-secondary-bg" />
            <div className="flex gap-3">
              <div className="h-11 w-40 animate-pulse rounded-md bg-secondary-bg" />
              <div className="h-11 w-48 animate-pulse rounded-md bg-secondary-bg" />
            </div>
          </div>
          <div className="mx-auto hidden aspect-square w-full max-w-[460px] animate-pulse rounded-full bg-secondary-bg/60 lg:block" />
        </div>
      </div>
      <TrustStripSkeleton />
      <TodaysHuntSkeleton />
    </div>
  );
}
