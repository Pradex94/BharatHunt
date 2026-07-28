"use client";

import { useActionState, useState } from "react";
import { Loader2, Plus, Sparkles, X } from "lucide-react";

import { createProduct, updateProduct, type ProductFormState } from "@/lib/actions/products";
import { fetchUrlMetadata } from "@/lib/actions/fetch-metadata";
import { PRODUCT_CATEGORIES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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
  const action = product ? updateProduct.bind(null, product.id, product.slug) : createProduct;
  const [state, formAction, pending] = useActionState<ProductFormState, FormData>(action, undefined);

  const [fields, setFields] = useState({
    name: product?.name ?? "",
    tagline: product?.tagline ?? "",
    description: product?.description ?? "",
    websiteUrl: product?.website_url ?? "",
    githubUrl: product?.github_url ?? "",
    heroImageUrl: product?.hero_image_url ?? "",
    tags: product?.tags?.join(", ") ?? "",
  });
  const update =
    (key: keyof typeof fields) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setFields((prev) => ({ ...prev, [key]: event.target.value }));

  const [gallery, setGallery] = useState<string[]>(product?.screenshot_urls ?? []);
  const updateGalleryItem = (index: number) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setGallery((prev) => prev.map((url, i) => (i === index ? event.target.value : url)));
  const removeGalleryItem = (index: number) => () =>
    setGallery((prev) => prev.filter((_, i) => i !== index));
  const addGalleryItem = () => setGallery((prev) => [...prev, ""]);

  const [importUrl, setImportUrl] = useState(product?.website_url ?? "");
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<{ type: "error" | "success"; text: string } | null>(
    null,
  );

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
      setFields((prev) => ({
        ...prev,
        name: data.name || prev.name,
        tagline: data.description ? toTagline(data.description) : prev.tagline,
        description: data.description || prev.description,
        heroImageUrl: data.icon || prev.heroImageUrl,
        websiteUrl: data.url || url,
      }));
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

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {/* Import-from-URL — auto-fills the fields below, Product-Hunt style. */}
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-secondary-bg/60 p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" aria-hidden="true" />
          <p className="text-sm font-semibold text-ink">Import from a URL</p>
        </div>
        <p className="text-xs text-muted">
          Paste your product&apos;s link and we&apos;ll auto-fill the details for you.
        </p>
        <div className="mt-1 flex flex-col gap-2 sm:flex-row">
          <Input
            type="url"
            value={importUrl}
            onChange={(event) => setImportUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
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
                <Loader2 className="animate-spin" aria-hidden="true" /> Fetching…
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

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          maxLength={60}
          value={fields.name}
          onChange={update("name")}
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
          value={fields.tagline}
          onChange={update("tagline")}
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
          value={fields.description}
          onChange={update("description")}
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
          value={fields.websiteUrl}
          onChange={update("websiteUrl")}
          placeholder="https://example.com"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="githubUrl">GitHub URL</Label>
        <Input
          id="githubUrl"
          name="githubUrl"
          type="url"
          value={fields.githubUrl}
          onChange={update("githubUrl")}
          placeholder="https://github.com/you/repo"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="heroImageUrl">Icon / logo URL</Label>
        <p className="text-xs text-muted">
          The square logo shown as your product&apos;s avatar.
        </p>
        <div className="flex items-center gap-3">
          {fields.heroImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={fields.heroImageUrl}
              src={fields.heroImageUrl}
              alt=""
              className="size-12 shrink-0 rounded-lg border border-border bg-secondary-bg object-cover"
              onError={(event) => {
                event.currentTarget.style.display = "none";
              }}
            />
          )}
          <Input
            id="heroImageUrl"
            name="heroImageUrl"
            type="url"
            value={fields.heroImageUrl}
            onChange={update("heroImageUrl")}
            placeholder="https://…/logo.png"
            className="flex-1"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Gallery images</Label>
        <p className="text-xs text-muted">
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
                  onError={(event) => {
                    event.currentTarget.style.visibility = "hidden";
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
                className="shrink-0 text-muted hover:text-destructive"
              >
                <X />
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
            <Plus /> Add image
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tags">Tags</Label>
        <Input
          id="tags"
          name="tags"
          value={fields.tags}
          onChange={update("tags")}
          placeholder="ai, devtools, productivity (up to 5, comma separated)"
        />
      </div>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending} className="w-full">
        {pending
          ? product
            ? "Saving…"
            : "Publishing…"
          : product
            ? "Save changes"
            : "Publish product"}
      </Button>
    </form>
  );
}
