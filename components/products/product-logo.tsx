"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

/**
 * A product's logo, in a circle.
 *
 * Two things make third-party logos hard to display, and both are handled here
 * so no caller has to think about it again:
 *
 * 1. **Shape.** These come from favicons, uploads and scraped icons, in every
 *    aspect ratio there is. `object-contain` fits the whole mark inside the
 *    box; `object-cover` (the old behaviour) cropped whatever didn't fit.
 *
 * 2. **The circle eats corners.** The largest square that fits inside a circle
 *    is only ~71% of its diameter, so a contained square logo would have its
 *    corners clipped by the rounding. The padding below reserves that margin —
 *    roughly 15% of the diameter per side — which is why it looks generous.
 *
 * A real logo sits on white so it reads as the maker's own mark; only the
 * initial-letter fallback uses a tinted circle.
 *
 * 3. **The URL may simply be dead.** Most of these point at hosts we do not
 *    control -- a maker's favicon, a scraped icon -- and those rot: the domain
 *    lapses, the file moves, hotlinking gets blocked. Rendering the <img>
 *    regardless left a broken-image glyph in the circle forever. `onError`
 *    falls back to the same initial-letter mark used when there is no logo at
 *    all, so a launch degrades instead of breaking.
 *
 *    This is the second line of defence, not the first: `resolveIcon` in
 *    lib/actions/fetch-metadata.ts is what keeps unverified URLs from being
 *    stored to begin with. This one catches the URLs that were fine at import
 *    and died later, which no amount of import-time checking can prevent.
 */

const SIZES = {
  sm: { box: "size-12", pad: "p-2", text: "text-base" }, // 48px
  md: { box: "size-14", pad: "p-2", text: "text-lg" }, // 56px
  lg: { box: "size-16", pad: "p-2.5", text: "text-2xl" }, // 64px
} as const;

export type ProductLogoProps = {
  src: string | null | undefined;
  name: string;
  size?: keyof typeof SIZES;
  loading?: "lazy" | "eager";
  className?: string;
};

export function ProductLogo({
  src,
  name,
  size = "md",
  loading,
  className,
}: ProductLogoProps) {
  const { box, pad, text } = SIZES[size];
  const [failed, setFailed] = useState(false);
  // Re-rendering with a different src must clear a previous failure, otherwise
  // a recycled instance in a list would inherit the last product's verdict.
  const [attempted, setAttempted] = useState(src);
  if (attempted !== src) {
    setAttempted(src);
    setFailed(false);
  }

  // A single nullable value rather than a separate boolean, so TypeScript
  // narrows it for the <img> below instead of needing a cast.
  const logoSrc = failed ? null : (src ?? null);

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold",
        box,
        logoSrc
          ? "border border-border bg-white"
          : cn("bg-surface-cream-strong text-muted", text),
        className,
      )}
    >
      {logoSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoSrc}
          alt=""
          loading={loading}
          onError={() => setFailed(true)}
          className={cn("size-full object-contain", pad)}
        />
      ) : (
        name.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}
