"use client";

/**
 * Upload a product image to Cloudinary
 * @param file - The image file to upload
 * @returns The public URL of the uploaded image
 */
export async function uploadProductImage(file: File): Promise<string> {
  // Validate file
  if (!file.type.startsWith("image/")) {
    throw new Error("File must be an image");
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error("File size must be less than 5MB");
  }

  try {
    // Create FormData for multipart upload
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!);

    // Upload to Cloudinary
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`,
      {
        method: "POST",
        body: formData,
      }
    );

    if (!response.ok) {
      const error = await response.json();
      const message = error.error?.message || "Unknown error";
      if (message.includes("Upload preset must be whitelisted")) {
        throw new Error("Cloudinary Error: Your upload preset must be set to 'Unsigned' in Cloudinary settings.");
      }
      throw new Error(`Upload failed: ${message}`);
    }

    const data = await response.json();

    if (!data.secure_url) {
      throw new Error("Failed to get image URL from Cloudinary");
    }

    return data.secure_url;
  } catch (error) {
    console.error("Image upload error:", error);
    throw new Error(
      error instanceof Error ? error.message : "Failed to upload image"
    );
  }
}
