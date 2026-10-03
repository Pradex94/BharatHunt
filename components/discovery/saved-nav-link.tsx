"use client";

import Link from "next/link";
import { Heart } from "lucide-react";

import { cn } from "@/lib/utils";
import { useDiscovery } from "@/components/discovery/discovery-provider";

/** The navbar's way to /saved, with a count once anything is saved. */
export function SavedNavLink({ className }: { className?: string }) {
  const { ready, savedCount } = useDiscovery();
  const count = ready ? savedCount : 0;

  return (
    <Link
      href="/saved"
      // On every page, so no viewport prefetch — see the note on the auth links.
      prefetch={false}
      aria-label={count > 0 ? `Saved products (${count})` : "Saved products"}
      className={cn(
        "relative flex size-9 items-center justify-center rounded-xl text-white/70 transition-colors hover:bg-white/10 hover:text-white",
        className,
      )}
    >
      <Heart className="size-4" aria-hidden="true" />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 font-mono text-[10px] leading-4 font-semibold text-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
