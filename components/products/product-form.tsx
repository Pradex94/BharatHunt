"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff, Loader2, Plus, Sparkles, Upload, X } from "lucide-react";

import { createProduct, updateProduct, type ProductFormState } from "@/lib/actions/products";
import { fetchUrlMetadata } from "@/lib/actions/fetch-metadata";
import { PRODUCT_CATEGORIES, PRICING_TYPE_LABELS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { uploadProductImage } from "@/lib/upload";
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
  screenshot_urls: string[] | null;
  tags: string[] | null;
};

/** Squeeze a long meta description down to a one-line tagline. */
function toTagline(description: string, max = 120): string {
  const clean = description.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export function ProductForm({ product }: { product?: ExistingProduct }) {
  const action = product
    ? updateProduct.bind(null, product.id, product.slug)
    : createProduct;
  const [state, formAction, pending] = useActionState<ProductFormState, FormData>(
    action,
    undefined,
  );

  // Text fields
  const [formData, setFormData] = useState({
    name: product?.name ?? "",
    tagline: product?.tagline ?? "",
    description: product?.description ?? "",
    category: product?.category ?? "",
    pricingType: product?.pricing_type ?? "free",
    websiteUrl: product?.website_url ?? "",
    githubUrl: product?.github_url ?? "",
    heroImageUrl: product?.hero_image_url ?? "",
    tags: product?.tags?.join(", ") ?? "",
  });

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Hero image (upload / paste / imported logo)
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(product?.hero_image_url ?? null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  // Gallery images (screenshot_urls)
  const [gallery, setGallery] = useState<string[]>(product?.screenshot_urls ?? []);
  const updateGalleryItem = (index: number) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setGallery((prev) => prev.map((url, i) => (i === index ? e.target.value : url)));
  const removeGalleryItem = (index: number) => () =>
    setGallery((prev) => prev.filter((_, i) => i !== index));
  const addGalleryItem = () => setGallery((prev) => [...prev, ""]);

  // Import from URL
  const [importUrl, setImportUrl] = useState(product?.website_url ?? "");
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<{ type: "error" | "success"; text: string } | null>(
    null,
  );

  // Live preview toggle
  const [showPreview, setShowPreview] = useState(false);

  async function handleImport() {
    const url = importUrl.trim();
    if (!url) {
      setImportMsg({ type: "error", text: "Paste your product's URL first." });
      return;
    }
    setImporting(true);
    setImportMsg(null);
    try {
      const result = await fetchUrlMetadata(url);
      if (!result.ok) {
        setImportMsg({ type: "error", text: result.error });
        return;
      }
      const data = result.data;
      setFormData((prev) => ({
        ...prev,
        name: data.name || prev.name,
        tagline: data.description ? toTagline(data.description) : prev.tagline,
        description: data.description || prev.description,
        websiteUrl: data.url || url,
        heroImageUrl: data.icon || prev.heroImageUrl,
      }));
      if (data.icon) {
        setImageFile(null);
        setImagePreview(data.icon);
      }
      setGallery((prev) => {
        const merged = [...prev];
        for (const image of data.images) {
          if (image && !merged.includes(image)) merged.push(image);
        }
        return merged.slice(0, 8);
      });
      setImportMsg({ type: "success", text: "Details imported — review and edit below." });
    } catch {
      setImportMsg({ type: "error", text: "Couldn't fetch that page. Fill the form in manually." });
    } finally {
      setImporting(false);
    }
  }

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
    reader.onload = (event) => setImagePreview(event.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processImageFile(file);
  };

  const handleDrag = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setIsDragActive(true);
    else if (e.type === "dragleave") setIsDragActive(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processImageFile(file);
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreview(null);
    setUploadError(null);
    setFormData((prev) => ({ ...prev, heroImageUrl: "" }));
  };

  const handleFormSubmit = async (submitData: FormData) => {
    if (imageFile) {
      setUploadingImage(true);
      try {
        const uploadedUrl = await uploadProductImage(imageFile);
        submitData.set("heroImageUrl", uploadedUrl);
      } catch (error) {
        setUploadError(error instanceof Error ? error.message : "Failed to upload image");
        setUploadingImage(false);
        return;
      }
      setUploadingImage(false);
    }
    formAction(submitData);
  };

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
      <form action={handleFormSubmit} className="flex flex-col gap-6 lg:col-span-2">
        {/* Import from URL — auto-fills the fields below, Product-Hunt style */}
        <div className="space-y-3 rounded-xl border border-border bg-secondary-bg/60 p-6">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-primary" aria-hidden="true" />
            <h2 className="text-lg font-semibold text-foreground">Import from a URL</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Paste your product&apos;s link and we&apos;ll auto-fill the details for you.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              type="url"
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleImport();
                }
              }}
              placeholder="https://yourproduct.com"
              aria-label="Product URL to import"
              className="flex-1"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleImport()}
              disabled={importing}
              className="shrink-0"
            >
              {importing ? (
                <>
                  <Loader2 size={16} className="animate-spin" aria-hidden="true" /> Fetching…
                </>
              ) : (
                "Fetch details"
              )}
            </Button>
          </div>
          {importMsg && (
            <p
              className={cn(
                "text-xs",
                importMsg.type === "error" ? "text-destructive" : "text-success",
              )}
              role="status"
            >
              {importMsg.text}
            </p>
          )}
        </div>

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

        {/* Product Image (icon / logo) */}
        <div className="space-y-4 rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">Product Image</h2>
          <p className="text-xs text-muted-foreground">
            The square logo shown as your product&apos;s avatar.
          </p>

          {imagePreview && (
            <div className="relative w-full overflow-hidden rounded-lg border border-input bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imagePreview} alt="Product preview" className="h-48 w-full object-cover" />
              <button
                type="button"
                onClick={handleRemoveImage}
                className="absolute top-2 right-2 rounded-full bg-destructive p-1.5 text-destructive-foreground transition-colors hover:bg-destructive/90"
                aria-label="Remove image"
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
                "flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 transition-all",
                isDragActive ? "border-primary bg-primary/5" : "border-border hover:bg-secondary-bg",
              )}
            >
              <Upload
                size={20}
                className={cn(
                  "transition-colors",
                  isDragActive ? "text-primary" : "text-muted-foreground",
                )}
              />
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

            {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}

            {imageFile && (
              <p className="text-xs text-muted-foreground">
                Selected: {imageFile.name} ({(imageFile.size / 1024).toFixed(1)} KB)
              </p>
            )}

            <div>
              <p className="mb-2 text-xs text-muted-foreground">Or paste an image URL:</p>
              <Input
                id="heroImageUrl"
                name="heroImageUrl"
                type="url"
                value={formData.heroImageUrl}
                onChange={handleInputChange}
                placeholder="https://…/logo.png"
                disabled={!!imageFile}
              />
            </div>
          </div>
        </div>

        {/* Gallery images (screenshot_urls) */}
        <div className="space-y-4 rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">Gallery images</h2>
          <p className="text-xs text-muted-foreground">
            Screenshots and previews shown on your product page (up to 8).
          </p>
          <div className="flex flex-col gap-2">
            {gallery.map((url, index) => (
              <div key={index} className="flex items-center gap-2">
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={url}
                    src={url}
                    alt=""
                    className="aspect-video h-11 shrink-0 rounded-md border border-border bg-secondary-bg object-cover"
                    onError={(e) => {
                      e.currentTarget.style.visibility = "hidden";
                    }}
                  />
                ) : (
                  <span className="aspect-video h-11 shrink-0 rounded-md border border-dashed border-border" />
                )}
                <Input
                  name="screenshotUrls"
                  type="url"
                  value={url}
                  onChange={updateGalleryItem(index)}
                  placeholder="https://…/screenshot.png"
                  aria-label={`Gallery image ${index + 1}`}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={removeGalleryItem(index)}
                  aria-label="Remove image"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                >
                  <X size={16} />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addGalleryItem}
              className="self-start"
            >
              <Plus size={16} /> Add image
            </Button>
          </div>
        </div>

        {/* Category & Pricing */}
        <div className="space-y-4 rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">Category &amp; Pricing</h2>

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

        {state?.error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
            <p className="text-sm text-destructive">{state.error}</p>
          </div>
        )}

        <Button type="submit" disabled={pending || uploadingImage} size="lg" className="w-full">
          {uploadingImage
            ? "Uploading image…"
            : pending
              ? product
                ? "Saving…"
                : "Publishing…"
              : product
                ? "Save changes"
                : "Publish product"}
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
              className="p-2 text-muted-foreground transition-colors hover:text-foreground"
              aria-label={showPreview ? "Hide preview" : "Show preview"}
            >
              {showPreview ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {showPreview && (
            <div className="space-y-3 rounded-xl border border-border bg-card p-4">
              <div className="flex size-14 items-center justify-center overflow-hidden rounded-lg bg-secondary-bg text-lg font-semibold text-muted">
                {previewData.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewData.imageUrl} alt="" className="size-full object-cover" />
                ) : (
                  previewData.name.slice(0, 1).toUpperCase()
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="line-clamp-2 text-sm font-semibold text-foreground">
                    {previewData.name}
                  </h3>
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    {PRICING_TYPE_LABELS[previewData.pricingType as keyof typeof PRICING_TYPE_LABELS]}
                  </span>
                </div>

                <p className="line-clamp-2 text-xs text-body">{previewData.tagline}</p>

                <div className="flex flex-wrap items-center gap-2 pt-2 text-xs text-muted">
                  <span className="rounded-full bg-secondary-bg px-2 py-0.5">
                    {previewData.category}
                  </span>
                </div>
              </div>

              <div className="space-y-2 rounded-lg bg-secondary-bg p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">✨ Tips for success:</p>
                <ul className="list-inside list-disc space-y-1">
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
