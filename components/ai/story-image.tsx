"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

/**
 * A story's image, or nothing.
 *
 * Three decisions worth stating, because none of them is the default:
 *
 * **A plain `<img>`, not `next/image`.** These URLs point at hosts we do not
 * control and cannot enumerate, so `remotePatterns` would have to be a wildcard
 * — and a wildcard optimiser is an open image proxy anyone can point at
 * anything. Beyond that, routing a publisher's image through our optimiser
 * *copies* it onto our infrastructure, which is a materially different act from
 * displaying the image the publisher put in their own feed for readers. This is
 * also what the rest of the codebase already does (see product-logo.tsx).
 *
 * **`referrerPolicy="no-referrer"`.** The reader's path through this site is
 * not the publisher's to log.
 *
 * **`onError` removes it entirely.** Every one of these is a third-party URL
 * that will eventually rot — the file moves, the CDN blocks hotlinking, the
 * domain lapses — and a broken-image glyph on a news card looks like a broken
 * product. The card is designed to be complete without an image, so the failure
 * state is simply its no-image state.
 */
export function StoryImage({
  src,
  alt,
  className,
  eager = false,
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  // Re-rendering with a different src has to clear a previous failure, or a
  // recycled instance in a list inherits the last story's verdict.
  const [attempted, setAttempted] = useState(src);
  if (attempted !== src) {
    setAttempted(src);
    setFailed(false);
  }

  if (!src || failed) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={cn("size-full object-cover", className)}
    />
  );
}
