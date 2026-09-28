import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { FadeIn } from "@/components/ui/motion";
import { SECTION_SHELL } from "@/components/landing/section-header";

/** The last word on the page: both journeys, one more time, side by side. */
export function FinalCta() {
  return (
    <section className={`${SECTION_SHELL} pt-6 pb-4 md:pt-10`}>
      <FadeIn className="relative overflow-hidden rounded-[32px] bg-surface-dark px-6 py-14 text-center text-on-dark sm:px-10 md:py-20">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_90%_at_50%_0%,rgba(255,107,26,0.32),transparent_65%)]"
        />
        <div className="relative mx-auto flex max-w-2xl flex-col items-center gap-5">
          <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">
            What&rsquo;s next could be on <span className="text-primary">Bharat Hunt</span>.
          </h2>
          <p className="text-lg text-on-dark-soft">
            Discover products. Launch your startup. Find the people and capital building
            what&rsquo;s next.
          </p>
          <div className="mt-2 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Link href="/marketplace" className={buttonVariants({ size: "lg" })}>
              Explore Bharat Hunt
            </Link>
            <Link
              href="/submit"
              prefetch={false}
              className="inline-flex h-11 items-center justify-center rounded-md border border-white/20 px-6 text-[0.95rem] font-semibold text-white transition-colors hover:bg-white/10"
            >
              Launch Your Product
            </Link>
          </div>
        </div>
      </FadeIn>
    </section>
  );
}
