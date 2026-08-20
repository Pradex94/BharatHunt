/**
 * Pixel dimensions read straight out of an image's header bytes.
 *
 * Exists because the URL importer used to accept the first icon that merely
 * *responded*, which is how a 16x16 `favicon.ico` ended up as a product logo
 * rendered at 200px — visibly blurry, and nothing in the pipeline noticed
 * because the file was perfectly valid. Knowing the real size is what lets the
 * importer prefer a 512px PWA icon over a favicon that happens to be listed
 * first.
 *
 * Every format here puts its dimensions within the first few hundred bytes, so
 * callers only need to hand over a prefix of the response rather than download
 * whole images. No decoding and no dependency: this runs on a request path
 * that already has a tight timeout budget.
 */

export type ImageSize = { width: number; height: number };

/**
 * What a vector counts as when compared against raster candidates.
 *
 * An SVG has no intrinsic pixel size and never blurs, so it should beat any
 * bitmap. A large finite number rather than `Infinity` keeps the value safe to
 * sort, compare and serialise.
 */
export const VECTOR_SIZE = 1_000_000;

function u16be(b: Uint8Array, i: number): number {
  return (b[i]! << 8) | b[i + 1]!;
}
function u16le(b: Uint8Array, i: number): number {
  return b[i]! | (b[i + 1]! << 8);
}
function u32be(b: Uint8Array, i: number): number {
  return ((b[i]! << 24) | (b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!) >>> 0;
}
function u24le(b: Uint8Array, i: number): number {
  return b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16);
}

function startsWith(b: Uint8Array, sig: number[], offset = 0): boolean {
  if (b.length < offset + sig.length) return false;
  return sig.every((byte, i) => b[offset + i] === byte);
}

function ascii(b: Uint8Array, i: number, length: number): string {
  return String.fromCharCode(...b.subarray(i, i + length));
}

/** PNG: an IHDR chunk always sits at byte 8, with width/height at 16 and 20. */
function pngSize(b: Uint8Array): ImageSize | null {
  if (!startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return null;
  if (b.length < 24) return null;
  return { width: u32be(b, 16), height: u32be(b, 20) };
}

/** GIF: logical screen descriptor, little-endian, right after the 6-byte magic. */
function gifSize(b: Uint8Array): ImageSize | null {
  if (!startsWith(b, [0x47, 0x49, 0x46, 0x38])) return null; // "GIF8"
  if (b.length < 10) return null;
  return { width: u16le(b, 6), height: u16le(b, 8) };
}

/**
 * ICO: a directory of images, not one image.
 *
 * Each 16-byte entry starts with width and height as single bytes, where 0
 * means 256 (the value does not fit in a byte). The largest entry is what a
 * browser would pick, so that is what we report.
 */
function icoSize(b: Uint8Array): ImageSize | null {
  if (!startsWith(b, [0x00, 0x00, 0x01, 0x00])) return null;
  if (b.length < 6) return null;

  const count = u16le(b, 4);
  let best: ImageSize | null = null;
  for (let i = 0; i < count; i++) {
    const entry = 6 + i * 16;
    if (b.length < entry + 2) break;
    const width = b[entry] === 0 ? 256 : b[entry]!;
    const height = b[entry + 1] === 0 ? 256 : b[entry + 1]!;
    if (!best || width * height > best.width * best.height) best = { width, height };
  }
  return best;
}

/** WebP has three sub-formats and each stores its size somewhere different. */
function webpSize(b: Uint8Array): ImageSize | null {
  if (!startsWith(b, [0x52, 0x49, 0x46, 0x46])) return null; // "RIFF"
  if (b.length < 30 || ascii(b, 8, 4) !== "WEBP") return null;

  const chunk = ascii(b, 12, 4);

  if (chunk === "VP8 ") {
    // Lossy: a 3-byte start code, then 14-bit width and height.
    return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
  }
  if (chunk === "VP8L") {
    // Lossless: 14 bits of (width-1) then 14 bits of (height-1), bit-packed.
    const bits = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X") {
    // Extended: canvas size as two 24-bit little-endian values, each minus one.
    return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
  }
  return null;
}

/**
 * JPEG: walk the segment chain to a Start Of Frame, which is the only marker
 * carrying the dimensions. Segments are length-prefixed, so this is a series of
 * jumps rather than a scan.
 */
function jpegSize(b: Uint8Array): ImageSize | null {
  if (!startsWith(b, [0xff, 0xd8])) return null;

  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++; // resynchronise past padding
      continue;
    }
    const marker = b[i + 1]!;

    // Standalone markers carry no length payload.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      i += 2;
      continue;
    }
    // SOF0-3, 5-7, 9-11, 13-15 hold the frame size. C4/C8/CC are tables, not frames.
    const isFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) {
      return { height: u16be(b, i + 5), width: u16be(b, i + 7) };
    }
    const length = u16be(b, i + 2);
    if (length < 2) return null; // malformed; refuse rather than loop forever
    i += 2 + length;
  }
  return null;
}

/** True when the bytes look like SVG markup rather than a bitmap. */
function looksLikeSvg(bytes: Uint8Array): boolean {
  const head = ascii(bytes, 0, Math.min(bytes.length, 512)).toLowerCase();
  return head.includes("<svg") || (head.includes("<?xml") && head.includes("svg"));
}

/**
 * Dimensions of `bytes`, or `null` when the format is unrecognised.
 *
 * `contentType` is only consulted for SVG, which has no binary magic number.
 * A vector reports `VECTOR_SIZE` so it outranks every bitmap.
 */
export function imageSizeFromBytes(
  bytes: Uint8Array,
  contentType = "",
): ImageSize | null {
  if (bytes.length < 4) return null;

  if (contentType.includes("svg") || looksLikeSvg(bytes)) {
    return { width: VECTOR_SIZE, height: VECTOR_SIZE };
  }

  const size =
    pngSize(bytes) ?? gifSize(bytes) ?? icoSize(bytes) ?? webpSize(bytes) ?? jpegSize(bytes);

  if (!size || size.width <= 0 || size.height <= 0) return null;
  return size;
}

/**
 * How large a square logo cut from this image would be.
 *
 * The short side is the limit: a 1200x630 social banner makes a 630px square at
 * best, and cropping a wide image to a square is exactly what an avatar slot
 * does. Ranking on the short side stops a letterboxed banner from outscoring a
 * genuine 512px icon.
 */
export function squareLogoSize(size: ImageSize): number {
  return Math.min(size.width, size.height);
}
