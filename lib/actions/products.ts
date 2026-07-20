"use server";

import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";

export type ProductFormState = { error?: string } | undefined;

const PRICING_TYPES = ["free", "freemium", "paid"];

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "")
      .slice(0, 60) || "product"
  );
}

type ParsedProductForm = {
  name: string;
  tagline: string;
  description: string | null;
  category: string;
  pricingType: string;
  websiteUrl: string | null;
  githubUrl: string | null;
  heroImageUrl: string | null;
  tags: string[];
};

function parseProductForm(formData: FormData): { error: string } | { fields: ParsedProductForm } {
  const name = String(formData.get("name") ?? "").trim();
  const tagline = String(formData.get("tagline") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const pricingType = String(formData.get("pricingType") ?? "free");
  const websiteUrl = String(formData.get("websiteUrl") ?? "").trim();
  const githubUrl = String(formData.get("githubUrl") ?? "").trim();
  const heroImageUrl = String(formData.get("heroImageUrl") ?? "").trim();
  const tagsRaw = String(formData.get("tags") ?? "");

  if (!name || name.length > 60) {
    return { error: "Name is required and must be 60 characters or fewer." };
  }
  if (!tagline || tagline.length > 120) {
    return { error: "Tagline is required and must be 120 characters or fewer." };
  }
  if (!category) {
    return { error: "Please choose a category." };
  }
  if (!PRICING_TYPES.includes(pricingType)) {
    return { error: "Invalid pricing type." };
  }

  const tags = tagsRaw
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 5);

  return {
    fields: {
      name,
      tagline,
      description: description || null,
      category,
      pricingType,
      websiteUrl: websiteUrl || null,
      githubUrl: githubUrl || null,
      heroImageUrl: heroImageUrl || null,
      tags,
    },
  };
}

export async function createProduct(
  _prevState: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const { userId } = await auth();

  if (!userId) {
    redirect("/login");
  }

  const supabase = createClient();

  const parsed = parseProductForm(formData);
  if ("error" in parsed) {
    return parsed;
  }
  const { name, tagline, description, category, pricingType, websiteUrl, githubUrl, heroImageUrl, tags } =
    parsed.fields;

  const baseSlug = slugify(name);
  let slug = baseSlug;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: existing } = await supabase
      .from("products")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!existing) break;
    slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
  }

  const { data: product, error } = await supabase
    .from("products")
    .insert({
      creator_id: userId,
      slug,
      name,
      tagline,
      description,
      category,
      pricing_type: pricingType,
      website_url: websiteUrl,
      github_url: githubUrl,
      hero_image_url: heroImageUrl,
      tags,
      status: "published",
      published_at: new Date().toISOString(),
    })
    .select("slug")
    .single();

  if (error) {
    return { error: error.message };
  }

  redirect(`/products/${product.slug}`);
}

export async function updateProduct(
  productId: string,
  productSlug: string,
  _prevState: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const { userId } = await auth();

  if (!userId) {
    redirect("/login");
  }

  const supabase = createClient();

  const parsed = parseProductForm(formData);
  if ("error" in parsed) {
    return parsed;
  }
  const { name, tagline, description, category, pricingType, websiteUrl, githubUrl, heroImageUrl, tags } =
    parsed.fields;

  const { error } = await supabase
    .from("products")
    .update({
      name,
      tagline,
      description,
      category,
      pricing_type: pricingType,
      website_url: websiteUrl,
      github_url: githubUrl,
      hero_image_url: heroImageUrl,
      tags,
    })
    .eq("id", productId)
    .eq("creator_id", userId);

  if (error) {
    return { error: error.message };
  }

  redirect(`/products/${productSlug}`);
}

export async function deleteProduct(productId: string) {
  const { userId } = await auth();

  if (!userId) {
    redirect("/login");
  }

  const supabase = createClient();

  await supabase.from("products").delete().eq("id", productId).eq("creator_id", userId);

  redirect("/");
}
