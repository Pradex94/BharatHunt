"use client";

/* Product-page image gallery: a large active image with a thumbnail strip,
 * Product-Hunt style. Renders nothing when there are no images. */

import { useState } from "react";

import { cn } from "@/lib/utils";

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
        src={current}
        alt=""
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
              <img src={url} alt="" className="size-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
