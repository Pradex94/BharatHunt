"use client";

import Link from "next/link";

import { cn } from "@/lib/utils";

/** Built-in fallback mark — always renders, never breaks. */
function BrandMark() {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary font-display text-lg font-bold leading-none text-white">
      B
    </span>
  );
}

/**
 * Bharat Hunt lockup.
 *
 * This used to probe for an optional `public/brand-icon.png` on mount and
 * upgrade to it if the request succeeded. That file is not in the repo and is
 * not coming back -- `app/icon.svg` replaced it -- so the probe never upgraded
 * anything and simply spent a guaranteed 404 on every page load, on every
 * route, for every visitor. There is no way to ask a browser "does this file
 * exist?" without making a request that fails when it does not, so the feature
 * and its console error had to go together.
 */
export function Logo({
  href = "/",
  className,
  tone = "light",
}: {
  href?: string;
  className?: string;
  tone?: "light" | "dark";
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex shrink-0 items-center gap-2 text-lg font-bold tracking-tight",
        tone === "dark" ? "text-white" : "text-ink",
        className,
      )}
    >
      <BrandMark />
      <span className="font-display text-xl font-bold tracking-tight">
        भारत <span className="text-primary">Hunt</span>
      </span>
    </Link>
  );
}
