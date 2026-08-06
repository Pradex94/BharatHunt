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

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold",
        box,
        src
          ? "border border-border bg-white"
          : cn("bg-surface-cream-strong text-muted", text),
        className,
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading={loading} className={cn("size-full object-contain", pad)} />
      ) : (
        name.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}
