/**
 * Cloudinary delivery transformations.
 *
 * Uploads keep the maker's original file untouched — quality is decided at
 * *delivery*, where we know the box the image will actually be drawn in.
 *
 * Blur on a screenshot is almost never a compression problem; it is a
 * resolution one. Three rules avoid it:
 *
 *  - `c_limit` scales down but never up, so a small source is shown at its own
 *    size rather than stretched into a soft mess.
 *  - Every image ships a srcSet at 1x/2x/3x. A 640px-wide box on a retina
 *    screen needs a 1280px image; serving it 640px is the single most common
 *    reason a sharp screenshot looks fuzzy in the browser.
 *  - `f_auto` picks AVIF/WebP per browser, which buys back the bytes those
 *    larger dimensions cost.
 *
 * Non-Cloudinary URLs (a maker pasting a link to their own host) pass through
 * untouched — we can't transform what we don't serve.
 */

const UPLOAD_SEGMENT = "/image/upload/";

/** Cloudinary's `q_auto` tiers. `best` is the most conservative compressor. */
export type CloudinaryQuality = "best" | "good" | "eco";

export function isCloudinaryUrl(url: string): boolean {
  return /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\//.test(url);
}

/** One delivery variant at a fixed pixel width. */
export function cloudinaryVariant(
  url: string,
  width: number,
  quality: CloudinaryQuality = "good",
): string {
  if (!isCloudinaryUrl(url)) return url;

  const insertAt = url.indexOf(UPLOAD_SEGMENT) + UPLOAD_SEGMENT.length;
  const transform = `f_auto,q_auto:${quality},c_limit,w_${Math.round(width)}`;
  return `${url.slice(0, insertAt)}${transform}/${url.slice(insertAt)}`;
}

/**
 * A `srcSet` across the given widths, or undefined when the URL isn't ours —
 * in which case the caller should fall back to a plain `src`.
 */
export function cloudinarySrcSet(
  url: string,
  widths: number[],
  quality: CloudinaryQuality = "good",
): string | undefined {
  if (!isCloudinaryUrl(url)) return undefined;

  return widths
    .map((width) => `${cloudinaryVariant(url, width, quality)} ${Math.round(width)}w`)
    .join(", ");
}
