"use client";

import { useActionState, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Flame,
  Image as ImageIcon,
  Link2,
  Loader2,
  Plus,
  Rocket,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from "lucide-react";

import { createProduct, updateProduct, type ProductFormState } from "@/lib/actions/products";
import { fetchUrlMetadata } from "@/lib/actions/fetch-metadata";
import { PRODUCT_CATEGORIES, PRICING_TYPE_LABELS, PRODUCT_PLATFORMS } from "@/lib/constants";
import { moderateProduct, SUBMISSION_RULES, type ModerationCode } from "@/lib/moderation";
import type { Json } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ProductLogo } from "@/components/products/product-logo";
import { uploadProductImage } from "@/lib/upload";
import { cn } from "@/lib/utils";

const selectClassName =
  "h-10 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

/**
 * The form is split into steps (Product-Hunt style) because the full field set
 * is long enough to be intimidating in one scroll. Every panel stays MOUNTED
 * and is hidden with `display:none`, so a single <form> still submits every
 * field in one go — which is why no input carries `required`: the browser
 * refuses to validate a control it can't focus. Step gating is done in
 * `validateStep`, and the server re-checks everything regardless.
 */
const STEPS = [
  { id: "main", label: "Main info", icon: Rocket },
  { id: "media", label: "Images and media", icon: ImageIcon },
  { id: "links", label: "Links", icon: Link2 },
  { id: "extras", label: "Extras", icon: Flame },
  { id: "review", label: "Review and launch", icon: CircleCheck },
] as const;

type StepId = (typeof STEPS)[number]["id"];

/** Which step a rejected launch rule belongs to, so we can jump the maker there. */
const STEP_FOR_RULE: Record<ModerationCode, StepId> = {
  adult_content: "main",
  fraudulent_content: "main",
  placeholder_name: "main",
  low_quality: "main",
  spam_formatting: "main",
  missing_link: "links",
  untrusted_link: "links",
};

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
  video_url: string | null;
  hero_image_url: string | null;
  screenshot_urls: string[] | null;
  tags: string[] | null;
  // Phase 2 launch fields
  cta_text: string | null;
  cta_url: string | null;
  platform_links: Json;
  tech_stack: string[] | null;
  coupon_code: string | null;
  offer_description: string | null;
  offer_expires_at: string | null;
  roadmap_url: string | null;
  changelog_url: string | null;
  available_for_hire: boolean | null;
  hire_pitch: string | null;
};

/** Squeeze a long meta description down to a one-line tagline. */
function toTagline(description: string, max = 120): string {
  const clean = description.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** ["a","b","c"] → "a, b and c" */
function formatList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Comma-separated input → trimmed, non-empty entries. */
function splitList(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
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
    videoUrl: product?.video_url ?? "",
    heroImageUrl: product?.hero_image_url ?? "",
    tags: product?.tags?.join(", ") ?? "",
    // Phase 2 launch fields
    ctaText: product?.cta_text ?? "",
    ctaUrl: product?.cta_url ?? "",
    techStack: product?.tech_stack?.join(", ") ?? "",
    couponCode: product?.coupon_code ?? "",
    offerDescription: product?.offer_description ?? "",
    offerExpiresAt: product?.offer_expires_at ? product.offer_expires_at.slice(0, 10) : "",
    roadmapUrl: product?.roadmap_url ?? "",
    changelogUrl: product?.changelog_url ?? "",
    hirePitch: product?.hire_pitch ?? "",
  });

  // Multi-platform availability matrix + hire toggle (non-string state)
  const [platformLinks, setPlatformLinks] = useState<Record<string, string>>(
    () => (product?.platform_links as Record<string, string> | null) ?? {},
  );
  const [availableForHire, setAvailableForHire] = useState(product?.available_for_hire ?? false);

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
  const [importMsg, setImportMsg] = useState<{
    type: "error" | "success" | "warning";
    text: string;
  } | null>(
    null,
  );

  // Stepper
  const [step, setStep] = useState<StepId>("main");
  const [stepError, setStepError] = useState<string | null>(null);
  // Launch-rule failure caught before we hit the server (same rules, same module).
  const [ruleError, setRuleError] = useState<string | null>(null);

  const stepIndex = STEPS.findIndex((entry) => entry.id === step);

  const productLinks = [
    formData.websiteUrl,
    formData.githubUrl,
    formData.ctaUrl,
    ...Object.values(platformLinks),
  ];
  const hasProductLink = productLinks.some((link) => link.trim());

  /** Blocks Next when a step is missing something the launch can't go without. */
  function validateStep(id: StepId): string | null {
    if (id === "main") {
      if (!formData.name.trim()) return "Add your product's name.";
      if (!formData.tagline.trim()) return "Add a tagline so people know what it does.";
      if (!formData.category) return "Choose a category.";
    }
    if (id === "links" && !hasProductLink) {
      return "Add at least one link — a website, GitHub repo, or app store listing.";
    }
    return null;
  }

  /** Sidebar tick: required steps when satisfied, optional ones when filled in. */
  function isStepComplete(id: StepId): boolean {
    switch (id) {
      case "main":
        return Boolean(formData.name.trim() && formData.tagline.trim() && formData.category);
      case "media":
        return Boolean(imagePreview || formData.heroImageUrl.trim() || gallery.some(Boolean));
      case "links":
        return hasProductLink;
      case "extras":
        return Boolean(formData.tags.trim() || formData.techStack.trim() || formData.ctaText.trim());
      default:
        return false;
    }
  }

  function goToStep(next: StepId) {
    setStep(next);
    setStepError(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleNext() {
    const problem = validateStep(step);
    if (problem) {
      setStepError(problem);
      return;
    }
    goToStep(STEPS[Math.min(stepIndex + 1, STEPS.length - 1)].id);
  }

  function handleBack() {
    goToStep(STEPS[Math.max(stepIndex - 1, 0)].id);
  }

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
        tagline: data.tagline ? toTagline(data.tagline) : prev.tagline,
        description: data.description || prev.description,
        // Only a guess — never overwrite a category the maker already picked.
        category: prev.category || data.category || "",
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
      // A `notice` means the page couldn't be read at all and we fell back to
      // the URL and domain favicon — real information, so don't dress it up as
      // a clean success.
      if (result.notice) {
        setImportMsg({ type: "warning", text: result.notice });
        return;
      }

      // Name what the page didn't publish. Single-page apps very often ship a
      // <title> and nothing else, and "Details imported" over three still-empty
      // fields reads like the importer failed silently.
      const missing = [
        !data.tagline && "tagline",
        !data.description && "description",
        !data.icon && "logo",
        !data.category && "category",
      ].filter((label): label is string => Boolean(label));

      setImportMsg(
        missing.length === 0
          ? { type: "success", text: "Details imported — review and edit below." }
          : {
              type: "warning",
              text: `Imported what that page publishes. It doesn't list a ${formatList(missing)} — add ${missing.length > 1 ? "those" : "that"} below.`,
            },
      );
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
    // Check the launch rules before uploading anything — the server re-runs the
    // exact same check, this just saves a rejected round trip.
    const check = moderateProduct({
      name: formData.name,
      tagline: formData.tagline,
      description: formData.description,
      tags: splitList(formData.tags),
      techStack: splitList(formData.techStack),
      websiteUrl: formData.websiteUrl,
      githubUrl: formData.githubUrl,
      videoUrl: formData.videoUrl,
      ctaText: formData.ctaText,
      ctaUrl: formData.ctaUrl,
      platformLinks,
      couponCode: formData.couponCode,
      offerDescription: formData.offerDescription,
      hirePitch: availableForHire ? formData.hirePitch : null,
      heroImageUrl: imageFile ? null : formData.heroImageUrl,
      screenshotUrls: gallery.filter(Boolean),
    });
    if (!check.ok) {
      setRuleError(check.message);
      // Send them to the step that actually holds the problem.
      goToStep(STEP_FOR_RULE[check.code]);
      return;
    }
    setRuleError(null);

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

  const panel = (id: StepId) => cn("flex-col gap-6", step === id ? "flex" : "hidden");
  const card = "space-y-4 rounded-xl border border-border bg-card p-6";

  return (
    <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
      {/* Step nav — a sidebar on desktop, a scrollable chip row on mobile */}
      <nav aria-label="Launch steps" className="lg:sticky lg:top-20 lg:self-start">
        <ol className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0">
          {STEPS.map((entry, index) => {
            const Icon = entry.icon;
            const isActive = entry.id === step;
            const isDone = isStepComplete(entry.id);
            return (
              <li key={entry.id} className="shrink-0 lg:shrink">
                <button
                  type="button"
                  onClick={() => goToStep(entry.id)}
                  aria-current={isActive ? "step" : undefined}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                    isActive
                      ? "bg-secondary-bg font-semibold text-ink"
                      : "text-body hover:bg-secondary-bg/60",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full text-xs",
                      isDone
                        ? "bg-primary text-primary-foreground"
                        : isActive
                          ? "bg-primary/15 text-primary"
                          : "bg-secondary-bg text-muted",
                    )}
                  >
                    {isDone ? <Check size={13} strokeWidth={3} /> : <Icon size={13} />}
                  </span>
                  <span className="whitespace-nowrap lg:whitespace-normal">{entry.label}</span>
                  <span className="ml-auto hidden text-xs text-muted lg:inline">{index + 1}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <form
        action={handleFormSubmit}
        // Every panel is mounted, so a stray Enter on step 1 would otherwise
        // publish the whole form. Only the review step may submit that way.
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            step !== "review" &&
            (event.target as HTMLElement).tagName !== "TEXTAREA"
          ) {
            event.preventDefault();
          }
        }}
        className="flex flex-col gap-6"
      >
        {/* ── Step 1: Main info ───────────────────────────────────── */}
        <div className={panel("main")}>
          {/* Launch rules — enforced server-side in lib/moderation.ts */}
          <div className="space-y-3 rounded-xl border border-border bg-card p-6">
            <div className="flex items-center gap-2">
              <ShieldCheck size={18} className="text-primary" aria-hidden="true" />
              <h2 className="text-lg font-semibold text-foreground">Launch rules</h2>
            </div>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              {SUBMISSION_RULES.map((rule) => (
                <li key={rule} className="flex gap-2">
                  <span aria-hidden="true" className="text-primary">
                    •
                  </span>
                  <span>{rule}</span>
                </li>
              ))}
            </ul>
          </div>

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
                  importMsg.type === "error" && "text-destructive",
                  importMsg.type === "warning" && "text-warning",
                  importMsg.type === "success" && "text-success",
                )}
                role="status"
              >
                {importMsg.text}
              </p>
            )}
          </div>

          <div className={card}>
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

          <div className={card}>
            <h2 className="text-lg font-semibold text-foreground">Category &amp; Pricing</h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="category">Category *</Label>
                <select
                  id="category"
                  name="category"
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
        </div>

        {/* ── Step 2: Images and media ────────────────────────────── */}
        <div className={panel("media")}>
          <div className={card}>
            <h2 className="text-lg font-semibold text-foreground">Product Image</h2>
            <p className="text-xs text-muted-foreground">
              The square logo shown as your product&apos;s avatar.
            </p>

            {imagePreview && (
              <div className="relative w-full overflow-hidden rounded-lg border border-input bg-muted">
                {/* The uploaded file is a square logo, so show it whole. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imagePreview}
                  alt="Product preview"
                  className="h-48 w-full object-contain p-4"
                />
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
                  <p className="text-sm font-medium text-foreground">
                    Click to upload or drag and drop
                  </p>
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

          <div className={card}>
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

          <div className={card}>
            <h2 className="text-lg font-semibold text-foreground">Demo video</h2>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="videoUrl">Demo video URL</Label>
              <Input
                id="videoUrl"
                name="videoUrl"
                type="url"
                value={formData.videoUrl}
                onChange={handleInputChange}
                placeholder="YouTube, Loom, or Vimeo link"
              />
              <p className="text-xs text-muted-foreground">
                Shown as an embedded player on your product page.
              </p>
            </div>
          </div>
        </div>

        {/* ── Step 3: Links ───────────────────────────────────────── */}
        <div className={panel("links")}>
          <div className={card}>
            <h2 className="text-lg font-semibold text-foreground">Links</h2>
            <p className="text-xs text-muted-foreground">
              At least one link is required — it&apos;s how people (and we) verify the product is
              real.
            </p>

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

          <div className={card}>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Where to get it</h2>
              <p className="text-xs text-muted-foreground">
                Add the platforms your product is available on (optional).
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {PRODUCT_PLATFORMS.map((platform) => (
                <div key={platform.key} className="flex flex-col gap-1.5">
                  <Label htmlFor={`platform_${platform.key}`}>{platform.label}</Label>
                  <Input
                    id={`platform_${platform.key}`}
                    name={`platform_${platform.key}`}
                    type="url"
                    value={platformLinks[platform.key] ?? ""}
                    onChange={(e) =>
                      setPlatformLinks((prev) => ({ ...prev, [platform.key]: e.target.value }))
                    }
                    placeholder={platform.placeholder}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className={card}>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Primary call-to-action</h2>
              <p className="text-xs text-muted-foreground">
                The main button visitors see on your launch page.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ctaText">Button text</Label>
                <Input
                  id="ctaText"
                  name="ctaText"
                  maxLength={40}
                  value={formData.ctaText}
                  onChange={handleInputChange}
                  placeholder="Claim Lifetime Deal"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ctaUrl">Button link</Label>
                <Input
                  id="ctaUrl"
                  name="ctaUrl"
                  type="url"
                  value={formData.ctaUrl}
                  onChange={handleInputChange}
                  placeholder="https://yourproduct.com/get"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── Step 4: Extras ──────────────────────────────────────── */}
        <div className={panel("extras")}>
          <div className={card}>
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
                {splitList(formData.tags).length}/5 tags
              </p>
            </div>
          </div>

          <div className={card}>
            <h2 className="text-lg font-semibold text-foreground">Tech stack</h2>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="techStack">Built with</Label>
              <Input
                id="techStack"
                name="techStack"
                value={formData.techStack}
                onChange={handleInputChange}
                placeholder="Next.js, Supabase, OpenAI (comma separated)"
              />
              <p className="text-xs text-muted-foreground">Up to 12, comma separated.</p>
            </div>
          </div>

          <div className={card}>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Launch offer</h2>
              <p className="text-xs text-muted-foreground">
                Optional promo shown in a highlighted box on your page.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="couponCode">Coupon code</Label>
                <Input
                  id="couponCode"
                  name="couponCode"
                  maxLength={40}
                  value={formData.couponCode}
                  onChange={handleInputChange}
                  placeholder="LAUNCH50"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="offerExpiresAt">Expires</Label>
                <Input
                  id="offerExpiresAt"
                  name="offerExpiresAt"
                  type="date"
                  value={formData.offerExpiresAt}
                  onChange={handleInputChange}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="offerDescription">Offer details</Label>
              <Input
                id="offerDescription"
                name="offerDescription"
                maxLength={200}
                value={formData.offerDescription}
                onChange={handleInputChange}
                placeholder="50% off the first year for Bharat Hunt users"
              />
            </div>
          </div>

          <div className={card}>
            <h2 className="text-lg font-semibold text-foreground">Roadmap &amp; changelog</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="roadmapUrl">Roadmap URL</Label>
                <Input
                  id="roadmapUrl"
                  name="roadmapUrl"
                  type="url"
                  value={formData.roadmapUrl}
                  onChange={handleInputChange}
                  placeholder="https://…/roadmap"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="changelogUrl">Changelog URL</Label>
                <Input
                  id="changelogUrl"
                  name="changelogUrl"
                  type="url"
                  value={formData.changelogUrl}
                  onChange={handleInputChange}
                  placeholder="https://…/changelog"
                />
              </div>
            </div>
          </div>

          <div className={card}>
            <h2 className="text-lg font-semibold text-foreground">Available for services</h2>
            <label className="flex items-center gap-2.5">
              <input
                type="checkbox"
                name="availableForHire"
                checked={availableForHire}
                onChange={(e) => setAvailableForHire(e.target.checked)}
                className="size-4 rounded border-input accent-primary"
              />
              <span className="text-sm text-foreground">
                Show a &ldquo;Hire us&rdquo; badge on my product page
              </span>
            </label>
            {availableForHire && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="hirePitch">Services pitch</Label>
                <Textarea
                  id="hirePitch"
                  name="hirePitch"
                  rows={2}
                  maxLength={300}
                  value={formData.hirePitch}
                  onChange={handleInputChange}
                  placeholder="We build AI products for startups — available for consulting."
                />
              </div>
            )}
          </div>
        </div>

        {/* ── Step 5: Review and launch ───────────────────────────── */}
        <div className={panel("review")}>
          <div className={card}>
            <h2 className="text-lg font-semibold text-foreground">How your card will look</h2>
            <div className="max-w-sm space-y-3 rounded-xl border border-border bg-background p-4">
              <ProductLogo src={previewData.imageUrl} name={previewData.name} size="md" />

              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="line-clamp-2 text-sm font-semibold text-foreground">
                    {previewData.name}
                  </h3>
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    {
                      PRICING_TYPE_LABELS[
                        previewData.pricingType as keyof typeof PRICING_TYPE_LABELS
                      ]
                    }
                  </span>
                </div>

                <p className="line-clamp-2 text-xs text-body">{previewData.tagline}</p>

                <div className="flex flex-wrap items-center gap-2 pt-2 text-xs text-muted">
                  <span className="rounded-full bg-secondary-bg px-2 py-0.5">
                    {previewData.category}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className={card}>
            <h2 className="text-lg font-semibold text-foreground">Launch checklist</h2>
            <ul className="flex flex-col gap-2.5 text-sm">
              {STEPS.filter((entry) => entry.id !== "review").map((entry) => {
                const done = isStepComplete(entry.id);
                const optional = entry.id === "media" || entry.id === "extras";
                return (
                  <li key={entry.id} className="flex items-center gap-2.5">
                    <span
                      className={cn(
                        "flex size-5 items-center justify-center rounded-full",
                        done ? "bg-primary text-primary-foreground" : "bg-secondary-bg text-muted",
                      )}
                    >
                      {done ? <Check size={12} strokeWidth={3} /> : <X size={12} />}
                    </span>
                    <span className={done ? "text-body" : "text-muted"}>{entry.label}</span>
                    {!done && (
                      <>
                        <span className="text-xs text-muted">
                          {optional ? "(optional)" : "(required)"}
                        </span>
                        <button
                          type="button"
                          onClick={() => goToStep(entry.id)}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          Add
                        </button>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {stepError && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4" role="alert">
            <p className="text-sm text-amber-800">{stepError}</p>
          </div>
        )}

        {(ruleError || state?.error) && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4" role="alert">
            <p className="text-sm text-destructive">{ruleError ?? state?.error}</p>
          </div>
        )}

        {/* Step controls */}
        <div className="flex items-center justify-between gap-3 border-t border-border pt-6">
          <Button
            type="button"
            variant="outline"
            onClick={handleBack}
            disabled={stepIndex === 0}
            className={cn(stepIndex === 0 && "invisible")}
          >
            <ChevronLeft size={16} /> Back
          </Button>

          <span className="text-xs text-muted">
            Step {stepIndex + 1} of {STEPS.length}
          </span>

          {/* When editing, the fields are already filled — let them save from
              any step instead of clicking through to the end. */}
          <div className="flex items-center gap-2">
            {step !== "review" && (
              <Button type="button" variant={product ? "outline" : "default"} onClick={handleNext}>
                Next <ChevronRight size={16} />
              </Button>
            )}
            {(step === "review" || product) && (
              <Button type="submit" disabled={pending || uploadingImage} size="lg">
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
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
