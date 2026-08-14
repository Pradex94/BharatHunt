"use client";

/**
 * How large an upload may be. Raised from 5MB because the old ceiling worked
 * against image quality: a full-resolution PNG screenshot of a 1440p screen is
 * routinely 6-8MB, so makers were being pushed to compress before uploading —
 * which is exactly the blur we're trying to keep off the platform. Cloudinary
 * accepts 10MB on an unsigned upload.
 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * The narrowest a gallery screenshot may be.
 *
 * The product page draws gallery images about 640 CSS pixels wide, so a retina
 * display asks for ~1280 real pixels. 800 is a deliberate compromise: below it
 * an image is guaranteed to look soft even at 1x, and no genuine screenshot is
 * that small. Logos are exempt — they're small by nature and usually vector.
 */
export const MIN_GALLERY_IMAGE_WIDTH = 800;

/** Reads a file's real pixel dimensions without uploading it. */
async function readImageSize(file: File): Promise<{ width: number; height: number }> {
  const objectUrl = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error("That file isn't an image we can read."));
      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Uploads a product image to Cloudinary and returns its public URL.
 *
 * The file is sent as-is — no client-side resizing or re-encoding. Everything
 * about how it is *displayed* is handled at delivery time by `lib/cloudinary.ts`,
 * so the original stays the highest-quality copy we have.
 *
 * Pass `minWidth` to refuse anything too low-resolution for where it will be
 * shown. Vector images (which report no intrinsic width) are always allowed:
 * they cannot blur.
 */
export async function uploadProductImage(
  file: File,
  options: { minWidth?: number } = {},
): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("File must be an image");
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(
      `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)}MB — the limit is ${
        MAX_UPLOAD_BYTES / 1024 / 1024
      }MB.`,
    );
  }

  if (options.minWidth) {
    const { width } = await readImageSize(file);
    // width === 0 means an intrinsically sizeless image, i.e. SVG. Let it pass.
    if (width > 0 && width < options.minWidth) {
      throw new Error(
        `${file.name} is only ${width}px wide. Use an image at least ${options.minWidth}px ` +
          `across, or it will look blurry on your product page.`,
      );
    }
  }

  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
  if (!cloudName || !uploadPreset) {
    throw new Error("Image uploads aren't configured. Paste an image URL instead.");
  }

  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", uploadPreset);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      const message = error.error?.message || "Unknown error";
      if (message.includes("Upload preset must be whitelisted")) {
        throw new Error(
          "Cloudinary Error: Your upload preset must be set to 'Unsigned' in Cloudinary settings.",
        );
      }
      throw new Error(`Upload failed: ${message}`);
    }

    const data = await response.json();

    if (!data.secure_url) {
      throw new Error("Failed to get image URL from Cloudinary");
    }

    return data.secure_url as string;
  } catch (error) {
    console.error("Image upload error:", error);
    throw new Error(error instanceof Error ? error.message : "Failed to upload image");
  }
}
