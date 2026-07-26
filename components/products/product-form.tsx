"use client";

import { useActionState, useState } from "react";
import Image from "next/image";
import { createProduct, updateProduct, type ProductFormState } from "@/lib/actions/products";
import { PRODUCT_CATEGORIES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { uploadProductImage } from "@/lib/upload";
import { X } from "lucide-react";

const selectClassName =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export type ExistingProduct = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string | null;
  category: string;
  pricing_type: string;
  website_url: string | null;
  github_url: string | null;
  hero_image_url: string | null;
  tags: string[] | null;
};

export function ProductForm({ product }: { product?: ExistingProduct }) {
  const action = product
    ? updateProduct.bind(null, product.id, product.slug)
    : createProduct;
  const [state, formAction, pending] = useActionState<ProductFormState, FormData>(
    action,
    undefined,
  );
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(product?.hero_image_url ?? null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      setUploadError("Please select an image file");
      return;
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      setUploadError("Image must be smaller than 5MB");
      return;
    }

    setImageFile(file);
    setUploadError(null);

    // Create preview
    const reader = new FileReader();
    reader.onload = (event) => {
      setImagePreview(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreview(null);
    setUploadError(null);
  };

  const handleFormSubmit = async (formData: FormData) => {
    // If there's a new image file, upload it first
    if (imageFile) {
      setUploadingImage(true);
      try {
        const uploadedUrl = await uploadProductImage(imageFile);
        formData.set("heroImageUrl", uploadedUrl);
      } catch (error) {
        setUploadError(error instanceof Error ? error.message : "Failed to upload image");
        setUploadingImage(false);
        return;
      }
      setUploadingImage(false);
    }

    formAction(formData);
  };

  return (
    <form action={handleFormSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          maxLength={60}
          defaultValue={product?.name}
          placeholder="AI Code Reviewer"
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tagline">Tagline</Label>
        <Input
          id="tagline"
          name="tagline"
          maxLength={120}
          defaultValue={product?.tagline}
          placeholder="Catch bugs before your teammates do"
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          rows={4}
          defaultValue={product?.description ?? ""}
          placeholder="What does it do? Who is it for?"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="category">Category</Label>
        <select
          id="category"
          name="category"
          required
          defaultValue={product?.category ?? ""}
          className={selectClassName}
        >
          <option value="" disabled>
            Choose a category
          </option>
          {PRODUCT_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pricingType">Pricing</Label>
        <select
          id="pricingType"
          name="pricingType"
          defaultValue={product?.pricing_type ?? "free"}
          className={selectClassName}
        >
          <option value="free">Free</option>
          <option value="freemium">Freemium</option>
          <option value="paid">Paid</option>
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="websiteUrl">Website URL</Label>
        <Input
          id="websiteUrl"
          name="websiteUrl"
          type="url"
          defaultValue={product?.website_url ?? ""}
          placeholder="https://example.com"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="githubUrl">GitHub URL</Label>
        <Input
          id="githubUrl"
          name="githubUrl"
          type="url"
          defaultValue={product?.github_url ?? ""}
          placeholder="https://github.com/you/repo"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Product Image</Label>
        <div className="flex flex-col gap-2">
          {/* Image Preview */}
          {imagePreview && (
            <div className="relative w-full rounded-lg border border-input overflow-hidden bg-muted">
              <img
                src={imagePreview}
                alt="Product preview"
                className="w-full h-48 object-cover"
              />
              <button
                type="button"
                onClick={handleRemoveImage}
                className="absolute top-2 right-2 p-1 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                <X size={16} />
              </button>
            </div>
          )}

          {/* File Input */}
          <div className="flex gap-2">
            <Input
              id="imageUpload"
              name="imageUpload"
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              disabled={uploadingImage || pending}
              className="flex-1"
            />
          </div>

          {/* Upload Error */}
          {uploadError && (
            <p className="text-sm text-destructive">{uploadError}</p>
          )}

          {/* File Info */}
          {imageFile && (
            <p className="text-xs text-muted-foreground">
              Selected: {imageFile.name} ({(imageFile.size / 1024).toFixed(1)} KB)
            </p>
          )}

          {/* Fallback: URL Input */}
          <div className="relative">
            <p className="text-xs text-muted-foreground mb-1">Or paste image URL:</p>
            <Input
              id="heroImageUrl"
              name="heroImageUrl"
              type="url"
              defaultValue={product?.hero_image_url ?? ""}
              placeholder="https://…"
              disabled={!!imageFile}
            />
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tags">Tags</Label>
        <Input
          id="tags"
          name="tags"
          defaultValue={product?.tags?.join(", ") ?? ""}
          placeholder="ai, devtools, productivity (up to 5, comma separated)"
        />
      </div>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending || uploadingImage} className="w-full">
        {uploadingImage ? "Uploading image…" : pending ? (product ? "Saving…" : "Publishing…") : product ? "Save changes" : "Publish product"}
      </Button>
    </form>
  );
}
