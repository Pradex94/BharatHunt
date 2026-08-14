"use client";

/* Product-page image gallery: a large active image with a thumbnail strip,
 * Product-Hunt style. Renders nothing when there are no images. */

import { useState } from "react";

import { cn } from "@/lib/utils";
import { cloudinarySrcSet, cloudinaryVariant } from "@/lib/cloudinary";

/*
 * The gallery sits in a `max-w-2xl` column, so the main image is drawn at most
 * ~640 CSS pixels wide. These widths cover that at 1x, 2x and 3x — the browser
 * picks by device pixel ratio, which is what stops a sharp screenshot from
 * rendering soft on a retina display. `q_auto:best` on the main image because
 * it is the one people actually look at; thumbnails get the cheaper tier.
 */
const MAIN_WIDTHS = [640, 1280, 1920];
const MAIN_SIZES = "(min-width: 704px) 640px, calc(100vw - 2rem)";

/** h-16 at 16:9 is ~114px wide. */
const THUMB_WIDTHS = [128, 256, 384];
const THUMB_SIZES = "114px";

export function ProductGallery({ images }: { images: string[] }) {
  const [active, setActive] = useState(0);

  if (images.length === 0) return null;

  const activeIndex = Math.min(active, images.length - 1);
  const current = images[activeIndex];

  return (
    <div className="flex flex-col gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={current}
        src={cloudinaryVariant(current, MAIN_WIDTHS[0], "best")}
        srcSet={cloudinarySrcSet(current, MAIN_WIDTHS, "best")}
        sizes={MAIN_SIZES}
        alt=""
        decoding="async"
        className="aspect-video w-full rounded-xl border border-border bg-secondary-bg object-cover"
      />

      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((url, index) => (
            <button
              key={url}
              type="button"
              onClick={() => setActive(index)}
              aria-label={`Show image ${index + 1}`}
              aria-current={index === activeIndex}
              className={cn(
                "aspect-video h-16 shrink-0 overflow-hidden rounded-lg border transition-colors",
                index === activeIndex
                  ? "border-primary ring-2 ring-primary/30"
                  : "border-border hover:border-primary/40",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={cloudinaryVariant(url, THUMB_WIDTHS[0])}
                srcSet={cloudinarySrcSet(url, THUMB_WIDTHS)}
                sizes={THUMB_SIZES}
                alt=""
                loading="lazy"
                decoding="async"
                className="size-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
