"use client";

import { useActionState } from "react";
import { createProduct, updateProduct, type ProductFormState } from "@/lib/actions/products";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const CATEGORIES = [
  "Developer Tools",
  "Productivity",
  "Finance",
  "Food & Drink",
  "Design Tools",
  "Marketing",
  "Health & Fitness",
  "Education",
  "Social",
  "Other",
];

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

  return (
    <form action={formAction} className="flex flex-col gap-4">
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
          {CATEGORIES.map((category) => (
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
        <Label htmlFor="heroImageUrl">Image URL</Label>
        <Input
          id="heroImageUrl"
          name="heroImageUrl"
          type="url"
          defaultValue={product?.hero_image_url ?? ""}
          placeholder="https://…"
        />
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
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? (product ? "Saving…" : "Publishing…") : product ? "Save changes" : "Publish product"}
      </Button>
    </form>
  );
}
