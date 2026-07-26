"use client";

import { useActionState, useState } from "react";
import { createProduct, updateProduct, type ProductFormState } from "@/lib/actions/products";
import { PRODUCT_CATEGORIES, PRICING_TYPE_LABELS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { uploadProductImage } from "@/lib/upload";
import { X, Upload, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

const selectClassName =
  "h-10 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

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

  // Form state
  const [formData, setFormData] = useState({
    name: product?.name ?? "",
    tagline: product?.tagline ?? "",
    description: product?.description ?? "",
    category: product?.category ?? "",
    pricingType: product?.pricing_type ?? "free",
    websiteUrl: product?.website_url ?? "",
    githubUrl: product?.github_url ?? "",
    tags: product?.tags?.join(", ") ?? "",
  });

  // Image upload state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(product?.hero_image_url ?? null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  // Preview state
  const [showPreview, setShowPreview] = useState(false);

  const processImageFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setUploadError("Please select an image file");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setUploadError("Image must be smaller than 5MB");
      return;
    }

    setImageFile(file);
    setUploadError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      setImagePreview(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processImageFile(file);
  };

  const handleDrag = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    processImageFile(file);
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreview(null);
    setUploadError(null);
  };

  const handleFormSubmit = async (formData: FormData) => {
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Live preview data
  const previewData = {
    name: formData.name || "Product Name",
    tagline: formData.tagline || "Your product tagline goes here",
    category: formData.category || "Category",
    pricingType: formData.pricingType || "free",
    imageUrl: imagePreview,
  };

  return (
    <div className="grid gap-8 lg:grid-cols-3">
      {/* Form Section */}
      <form action={handleFormSubmit} className="lg:col-span-2 flex flex-col gap-6">
        {/* Basic Info */}
        <div className="space-y-4 rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">Basic Information</h2>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Product Name *</Label>
            <Input
              id="name"
              name="name"
              maxLength={60}
              value={formData.name}
              onChange={handleInputChange}
              placeholder="AI Code Reviewer"
              required
            />
            <p className="text-xs text-muted-foreground">{formData.name.length}/60</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tagline">Tagline *</Label>
            <Input
              id="tagline"
              name="tagline"
              maxLength={120}
              value={formData.tagline}
              onChange={handleInputChange}
              placeholder="Catch bugs before your teammates do"
              required
            />
            <p className="text-xs text-muted-foreground">{formData.tagline.length}/120</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              rows={4}
              value={formData.description}
              onChange={handleInputChange}
              placeholder="What does it do? Who is it for? What problem does it solve?"
            />
          </div>
        </div>

        {/* Image Upload */}
        <div className="space-y-4 rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">Product Image</h2>

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
                className="absolute top-2 right-2 p-1.5 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <label
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 cursor-pointer transition-all",
                isDragActive
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-secondary-bg"
              )}
            >
              <Upload size={20} className={cn("transition-colors", isDragActive ? "text-primary" : "text-muted-foreground")} />
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">Click to upload or drag and drop</p>
                <p className="text-xs text-muted-foreground">PNG, JPG, WebP up to 5MB</p>
              </div>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                disabled={uploadingImage || pending}
                className="hidden"
              />
            </label>

            {uploadError && (
              <p className="text-sm text-destructive">{uploadError}</p>
            )}

            {imageFile && (
              <p className="text-xs text-muted-foreground">
                Selected: {imageFile.name} ({(imageFile.size / 1024).toFixed(1)} KB)
              </p>
            )}

            <div className="relative">
              <p className="text-xs text-muted-foreground mb-2">Or paste image URL:</p>
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

        {/* Category & Pricing */}
        <div className="space-y-4 rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">Category & Pricing</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="category">Category *</Label>
              <select
                id="category"
                name="category"
                required
                value={formData.category}
                onChange={handleInputChange}
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
                value={formData.pricingType}
                onChange={handleInputChange}
                className={selectClassName}
              >
                <option value="free">Free</option>
                <option value="freemium">Freemium</option>
                <option value="paid">Paid</option>
              </select>
            </div>
          </div>
        </div>

        {/* Links */}
        <div className="space-y-4 rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">Links</h2>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="websiteUrl">Website URL</Label>
            <Input
              id="websiteUrl"
              name="websiteUrl"
              type="url"
              value={formData.websiteUrl}
              onChange={handleInputChange}
              placeholder="https://example.com"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="githubUrl">GitHub URL</Label>
            <Input
              id="githubUrl"
              name="githubUrl"
              type="url"
              value={formData.githubUrl}
              onChange={handleInputChange}
              placeholder="https://github.com/you/repo"
            />
          </div>
        </div>

        {/* Tags */}
        <div className="space-y-4 rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">Tags</h2>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tags">Tags</Label>
            <Input
              id="tags"
              name="tags"
              value={formData.tags}
              onChange={handleInputChange}
              placeholder="ai, devtools, productivity (up to 5, comma separated)"
            />
            <p className="text-xs text-muted-foreground">
              {formData.tags.split(",").filter((t) => t.trim()).length}/5 tags
            </p>
          </div>
        </div>

        {/* Error State */}
        {state?.error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
            <p className="text-sm text-destructive">{state.error}</p>
          </div>
        )}

        {/* Submit Button */}
        <Button
          type="submit"
          disabled={pending || uploadingImage}
          size="lg"
          className="w-full"
        >
          {uploadingImage ? "Uploading image…" : pending ? (product ? "Saving…" : "Publishing…") : product ? "Save changes" : "Publish product"}
        </Button>
      </form>

      {/* Preview Section */}
      <div className="lg:col-span-1">
        <div className="sticky top-20 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Preview</h2>
            <button
              type="button"
              onClick={() => setShowPreview(!showPreview)}
              className="p-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showPreview ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {showPreview && (
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              {/* Image Tile */}
              <div className="flex size-14 items-center justify-center overflow-hidden rounded-lg bg-secondary-bg text-lg font-semibold text-muted">
                {previewData.imageUrl ? (
                  <img
                    src={previewData.imageUrl}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  previewData.name.slice(0, 1).toUpperCase()
                )}
              </div>

              {/* Product Info */}
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-foreground text-sm line-clamp-2">
                    {previewData.name}
                  </h3>
                  <span className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary">
                    {PRICING_TYPE_LABELS[previewData.pricingType as keyof typeof PRICING_TYPE_LABELS]}
                  </span>
                </div>

                <p className="text-xs text-body line-clamp-2">{previewData.tagline}</p>

                <div className="flex flex-wrap items-center gap-2 text-xs text-muted pt-2">
                  <span className="rounded-full bg-secondary-bg px-2 py-0.5">
                    {previewData.category}
                  </span>
                </div>
              </div>

              {/* Help Text */}
              <div className="rounded-lg bg-secondary-bg p-3 text-xs text-muted-foreground space-y-2">
                <p className="font-medium text-foreground">✨ Tips for success:</p>
                <ul className="space-y-1 list-disc list-inside">
                  <li>Use a clear, descriptive name</li>
                  <li>Write a compelling tagline</li>
                  <li>Add a high-quality image</li>
                  <li>Include relevant tags</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
