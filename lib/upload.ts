"use client";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Create a Supabase client for storage operations
 * Uses public anon key for client-side uploads
 */
function createStorageClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/**
 * Upload a product image to Supabase Storage
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

  const supabase = createStorageClient();

  // Generate a unique filename
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const filename = `${timestamp}-${random}.${ext}`;
  const filepath = `product-images/${filename}`;

  try {
    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from("products")
      .upload(filepath, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (error) {
      throw new Error(`Upload failed: ${error.message}`);
    }

    // Get the public URL
    const { data: publicUrlData } = supabase.storage
      .from("products")
      .getPublicUrl(filepath);

    if (!publicUrlData?.publicUrl) {
      throw new Error("Failed to generate public URL");
    }

    return publicUrlData.publicUrl;
  } catch (error) {
    console.error("Image upload error:", error);
    throw new Error(
      error instanceof Error ? error.message : "Failed to upload image"
    );
  }
}
