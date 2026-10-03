import Link from "next/link";
import { Heart } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";

export function SavedEmptyState() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
      <Heart className="size-8 text-primary" aria-hidden="true" />
      <p className="text-base font-semibold text-ink">Your saved list is empty.</p>
      <p className="max-w-sm text-sm text-body">
        Tap the heart on any product to keep it here — a shortlist of tools to try, compare or come back to.
      </p>
      <Link href="/marketplace" className={buttonVariants({ size: "sm" })}>
        Browse the marketplace
      </Link>
    </div>
  );
}
