import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  imageSizeFromBytes,
  squareLogoSize,
  VECTOR_SIZE,
  type ImageSize,
} from "../lib/image-size.ts";

/**
 * These headers are hand-built rather than loaded from fixture files: the whole
 * point of the module is that dimensions are readable from a handful of bytes,
 * so the tests should be able to state those bytes outright.
 */

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

function gif(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(10);
  bytes.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 0); // GIF89a
  const view = new DataView(bytes.buffer);
  view.setUint16(6, width, true);
  view.setUint16(8, height, true);
  return bytes;
}

/** `entries` are [width, height] pairs; 256 is encoded as the byte 0. */
function ico(entries: Array<[number, number]>): Uint8Array {
  const bytes = new Uint8Array(6 + entries.length * 16);
  bytes.set([0x00, 0x00, 0x01, 0x00], 0);
  new DataView(bytes.buffer).setUint16(4, entries.length, true);
  entries.forEach(([width, height], index) => {
    const at = 6 + index * 16;
    bytes[at] = width === 256 ? 0 : width;
    bytes[at + 1] = height === 256 ? 0 : height;
  });
  return bytes;
}

function jpeg(width: number, height: number): Uint8Array {
  // SOI, then a JFIF APP0 segment to skip over, then an SOF0 frame.
  const bytes = new Uint8Array(4 + 18 + 12);
  const view = new DataView(bytes.buffer);
  bytes.set([0xff, 0xd8], 0);

  bytes.set([0xff, 0xe0], 2); // APP0
  view.setUint16(4, 16); // segment length, excluding the marker
  const at = 4 + 16;

  bytes.set([0xff, 0xc0], at); // SOF0
  view.setUint16(at + 2, 11);
  bytes[at + 4] = 8; // sample precision
  view.setUint16(at + 5, height);
  view.setUint16(at + 7, width);
  return bytes;
}

function webpVp8x(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(30);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  bytes.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
  bytes.set([0x56, 0x50, 0x38, 0x58], 12); // VP8X
  const write24 = (at: number, value: number) => {
    bytes[at] = value & 0xff;
    bytes[at + 1] = (value >> 8) & 0xff;
    bytes[at + 2] = (value >> 16) & 0xff;
  };
  write24(24, width - 1);
  write24(27, height - 1);
  return bytes;
}

const size = (result: ImageSize | null): [number, number] => {
  assert.ok(result, "expected dimensions to be readable");
  return [result.width, result.height];
};

describe("imageSizeFromBytes", () => {
  it("reads PNG dimensions from the IHDR chunk", () => {
    assert.deepEqual(size(imageSizeFromBytes(png(512, 512))), [512, 512]);
    assert.deepEqual(size(imageSizeFromBytes(png(1200, 630))), [1200, 630]);
  });

  it("reads GIF dimensions, which are little-endian", () => {
    assert.deepEqual(size(imageSizeFromBytes(gif(64, 48))), [64, 48]);
  });

  it("reads JPEG dimensions by walking past earlier segments", () => {
    assert.deepEqual(size(imageSizeFromBytes(jpeg(800, 600))), [800, 600]);
  });

  it("reads WebP VP8X canvas dimensions", () => {
    assert.deepEqual(size(imageSizeFromBytes(webpVp8x(256, 256))), [256, 256]);
  });

  describe("ICO", () => {
    it("reports the largest entry, since that is what a browser would pick", () => {
      assert.deepEqual(size(imageSizeFromBytes(ico([[16, 16], [48, 48], [32, 32]]))), [48, 48]);
    });

    it("decodes a zero byte as 256 — the size that does not fit in a byte", () => {
      assert.deepEqual(size(imageSizeFromBytes(ico([[256, 256]]))), [256, 256]);
    });

    it("measures the favicon.ico that made paytm.com's logo blurry", () => {
      // A bare 16x16 .ico: valid, live, and far too small for a 200px avatar.
      // The importer used to accept it purely because it responded.
      const measured = imageSizeFromBytes(ico([[16, 16]]));
      assert.ok(measured);
      assert.equal(squareLogoSize(measured), 16);
    });
  });

  describe("SVG", () => {
    it("outranks every bitmap, having no pixel size to lose", () => {
      const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
      assert.deepEqual(size(imageSizeFromBytes(svg)), [VECTOR_SIZE, VECTOR_SIZE]);
    });

    it("is recognised from the content type when the markup starts with a declaration", () => {
      const svg = new TextEncoder().encode('<?xml version="1.0"?>\n<svg></svg>');
      assert.ok(imageSizeFromBytes(svg, "image/svg+xml"));
    });
  });

  describe("rejects what it cannot vouch for", () => {
    it("returns null for HTML served where an image was expected", () => {
      const html = new TextEncoder().encode("<!doctype html><html><body>Not found</body></html>");
      assert.equal(imageSizeFromBytes(html), null);
    });

    it("returns null rather than guessing at a truncated PNG header", () => {
      assert.equal(imageSizeFromBytes(png(512, 512).subarray(0, 12)), null);
    });

    it("returns null for an empty body", () => {
      assert.equal(imageSizeFromBytes(new Uint8Array()), null);
    });

    it("does not loop forever on a malformed JPEG segment length", () => {
      const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00, 0, 0, 0, 0, 0, 0]);
      assert.equal(imageSizeFromBytes(bytes), null);
    });
  });
});

describe("squareLogoSize", () => {
  it("uses the short side, which is all a square crop can keep", () => {
    // A 1200x630 social banner yields a 630px square at best — it must not
    // outrank a real 512px icon just because it is wider.
    assert.equal(squareLogoSize({ width: 1200, height: 630 }), 630);
    assert.equal(squareLogoSize({ width: 512, height: 512 }), 512);
  });
});
