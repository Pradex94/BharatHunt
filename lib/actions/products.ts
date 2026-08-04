"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isMissingColumnError } from "@/lib/supabase/errors";
import { getIsAdmin } from "@/lib/admin";
import { cacheInvalidatePrefix } from "@/lib/cache";
import { ensureProfile } from "@/lib/ensure-profile";
import { getUserProductCount, PRODUCTS_CACHE_PREFIX } from "@/services/products";
import { MAX_PRODUCTS_PER_USER, PRODUCT_PLATFORMS } from "@/lib/constants";
import { hostnameOf, moderateProduct } from "@/lib/moderation";

export type ProductFormState = { error?: string } | undefined;

const PRICING_TYPES = ["free", "freemium", "paid"];

/** Trim a form value and keep it only if it's an http(s) URL, else null. */
function cleanUrl(value: FormDataEntryValue | null): string | null {
  const raw = String(value ?? "").trim();
  return /^https?:\/\//i.test(raw) ? raw : null;
}

/** Trim and cap a free-text field, returning null when empty. */
function cleanText(value: FormDataEntryValue | null, max: number): string | null {
  const raw = String(value ?? "").trim();
  return raw ? raw.slice(0, max) : null;
}

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
  videoUrl: string | null;
  heroImageUrl: string | null;
  screenshotUrls: string[];
  tags: string[];
  // Phase 2 launch fields
  ctaText: string | null;
  ctaUrl: string | null;
  platformLinks: Record<string, string>;
  techStack: string[];
  couponCode: string | null;
  offerDescription: string | null;
  offerExpiresAt: string | null;
  roadmapUrl: string | null;
  changelogUrl: string | null;
  availableForHire: boolean;
  hirePitch: string | null;
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
  const screenshotUrls = formData
    .getAll("screenshotUrls")
    .map((value) => String(value).trim())
    .filter((value) => /^https?:\/\//i.test(value))
    .filter((value, index, all) => all.indexOf(value) === index)
    .slice(0, 8);
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

  // Phase 2 launch fields
  const platformLinks: Record<string, string> = {};
  for (const platform of PRODUCT_PLATFORMS) {
    const url = cleanUrl(formData.get(`platform_${platform.key}`));
    if (url) platformLinks[platform.key] = url;
  }

  const techStack = String(formData.get("techStack") ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, all) => all.indexOf(item) === index)
    .slice(0, 12);

  const offerExpiresRaw = String(formData.get("offerExpiresAt") ?? "").trim();
  let offerExpiresAt: string | null = null;
  if (offerExpiresRaw) {
    const parsedDate = new Date(offerExpiresRaw);
    offerExpiresAt = Number.isNaN(parsedDate.getTime()) ? null : parsedDate.toISOString();
  }

  return {
    fields: {
      name,
      tagline,
      description: description || null,
      category,
      pricingType,
      websiteUrl: websiteUrl || null,
      githubUrl: githubUrl || null,
      videoUrl: cleanUrl(formData.get("videoUrl")),
      heroImageUrl: heroImageUrl || null,
      screenshotUrls,
      tags,
      ctaText: cleanText(formData.get("ctaText"), 40),
      ctaUrl: cleanUrl(formData.get("ctaUrl")),
      platformLinks,
      techStack,
      couponCode: cleanText(formData.get("couponCode"), 40),
      offerDescription: cleanText(formData.get("offerDescription"), 200),
      offerExpiresAt,
      roadmapUrl: cleanUrl(formData.get("roadmapUrl")),
      changelogUrl: cleanUrl(formData.get("changelogUrl")),
      availableForHire: formData.get("availableForHire") === "on",
      hirePitch: cleanText(formData.get("hirePitch"), 300),
    },
  };
}

/** `\`, `%` and `_` are LIKE wildcards — escape them before building a pattern. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

/**
 * Guards against the same product being listed twice — the cheapest signal
 * that a launch is a duplicate or an impersonation of someone else's product.
 * Matches on the exact name (case-insensitive) or the website's hostname, and
 * returns a ready-to-show message (or null when the launch is unique).
 */
async function findDuplicateLaunch(
  supabase: ReturnType<typeof createClient>,
  { name, websiteUrl, excludeId }: { name: string; websiteUrl: string | null; excludeId?: string },
): Promise<string | null> {
  const host = websiteUrl ? hostnameOf(websiteUrl) : null;

  const [byName, byHost] = await Promise.all([
    supabase.from("products").select("id, name, website_url").ilike("name", escapeLike(name)).limit(5),
    host
      ? supabase
          .from("products")
          .select("id, name, website_url")
          .ilike("website_url", `%${escapeLike(host)}%`)
          .limit(10)
      : null,
  ]);

  const nameClash = (byName.data ?? []).find((row) => row.id !== excludeId);
  if (nameClash) {
    return `A product called "${nameClash.name}" is already on Bharat Hunt. Pick a different name, or edit your existing launch.`;
  }

  if (host) {
    // `ilike` only narrows the candidates — compare parsed hostnames so
    // "notion.so" doesn't collide with "mynotion.social".
    const hostClash = (byHost?.data ?? []).find(
      (row) => row.id !== excludeId && row.website_url && hostnameOf(row.website_url) === host,
    );
    if (hostClash) {
      return `"${hostClash.name}" has already been launched with that website. Each product can only be listed once.`;
    }
  }

  return null;
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

  // Enforce the per-maker launch limit before doing any work — admins are exempt.
  if (!(await getIsAdmin())) {
    const existingCount = await getUserProductCount(userId);
    if (existingCount >= MAX_PRODUCTS_PER_USER) {
      return {
        error: `You've reached the ${MAX_PRODUCTS_PER_USER}-product launch limit. Delete an existing product to launch a new one.`,
      };
    }
  }

  const parsed = parseProductForm(formData);
  if ("error" in parsed) {
    return parsed;
  }

  // Launch rules: no adult/NSFW or fraudulent listings, and no fake launches
  // (see lib/moderation.ts). Runs before anything is written.
  const moderation = moderateProduct(parsed.fields);
  if (!moderation.ok) {
    return { error: moderation.message };
  }

  const duplicate = await findDuplicateLaunch(supabase, {
    name: parsed.fields.name,
    websiteUrl: parsed.fields.websiteUrl,
  });
  if (duplicate) {
    return { error: duplicate };
  }

  const {
    name,
    tagline,
    description,
    category,
    pricingType,
    websiteUrl,
    githubUrl,
    videoUrl,
    heroImageUrl,
    screenshotUrls,
    tags,
    ctaText,
    ctaUrl,
    platformLinks,
    techStack,
    couponCode,
    offerDescription,
    offerExpiresAt,
    roadmapUrl,
    changelogUrl,
    availableForHire,
    hirePitch,
  } = parsed.fields;

  // Make sure the creator has a profile row before inserting — products.creator_id
  // has a FK to profiles.id, and the Clerk webhook may not have run for this user.
  try {
    await ensureProfile();
  } catch (profileError) {
    return {
      error:
        profileError instanceof Error
          ? profileError.message
          : "Could not prepare your profile. Please try again.",
    };
  }

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

  const basePayload = {
    creator_id: userId,
    slug,
    name,
    tagline,
    description,
    category,
    pricing_type: pricingType,
    website_url: websiteUrl,
    github_url: githubUrl,
    video_url: videoUrl,
    hero_image_url: heroImageUrl,
    screenshot_urls: screenshotUrls,
    tags,
    status: "published",
    published_at: new Date().toISOString(),
  };
  const launchFields = {
    cta_text: ctaText,
    cta_url: ctaUrl,
    platform_links: platformLinks,
    tech_stack: techStack,
    coupon_code: couponCode,
    offer_description: offerDescription,
    offer_expires_at: offerExpiresAt,
    roadmap_url: roadmapUrl,
    changelog_url: changelogUrl,
    available_for_hire: availableForHire,
    hire_pitch: hirePitch,
  };

  let { data: product, error } = await supabase
    .from("products")
    .insert({ ...basePayload, ...launchFields })
    .select("slug")
    .single();

  // If the Phase 2 launch columns aren't migrated yet, publish with the base
  // fields so submitting never hard-fails (run db/product-launch-fields.sql to
  // persist the launch fields).
  if (error && isMissingColumnError(error)) {
    ({ data: product, error } = await supabase
      .from("products")
      .insert(basePayload)
      .select("slug")
      .single());
  }

  if (error || !product) {
    return { error: error?.message ?? "Could not publish your product. Please try again." };
  }

  // A new product changes lists, featured, counts, stats and the sitemap.
  await cacheInvalidatePrefix(PRODUCTS_CACHE_PREFIX);
  // …and it's a new row on the maker's dashboard.
  revalidatePath("/dashboard");

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

  // Same launch rules as create — an edit can't smuggle in banned content.
  const moderation = moderateProduct(parsed.fields);
  if (!moderation.ok) {
    return { error: moderation.message };
  }

  const duplicate = await findDuplicateLaunch(supabase, {
    name: parsed.fields.name,
    websiteUrl: parsed.fields.websiteUrl,
    excludeId: productId,
  });
  if (duplicate) {
    return { error: duplicate };
  }

  const {
    name,
    tagline,
    description,
    category,
    pricingType,
    websiteUrl,
    githubUrl,
    videoUrl,
    heroImageUrl,
    screenshotUrls,
    tags,
    ctaText,
    ctaUrl,
    platformLinks,
    techStack,
    couponCode,
    offerDescription,
    offerExpiresAt,
    roadmapUrl,
    changelogUrl,
    availableForHire,
    hirePitch,
  } = parsed.fields;

  // Admins may edit any product (service-role client bypasses RLS); everyone
  // else is scoped to their own rows.
  const isAdmin = await getIsAdmin();
  const db = isAdmin ? createServiceClient() : supabase;

  const basePayload = {
    name,
    tagline,
    description,
    category,
    pricing_type: pricingType,
    website_url: websiteUrl,
    github_url: githubUrl,
    video_url: videoUrl,
    hero_image_url: heroImageUrl,
    screenshot_urls: screenshotUrls,
    tags,
  };
  const launchFields = {
    cta_text: ctaText,
    cta_url: ctaUrl,
    platform_links: platformLinks,
    tech_stack: techStack,
    coupon_code: couponCode,
    offer_description: offerDescription,
    offer_expires_at: offerExpiresAt,
    roadmap_url: roadmapUrl,
    changelog_url: changelogUrl,
    available_for_hire: availableForHire,
    hire_pitch: hirePitch,
  };

  const runUpdate = async (payload: typeof basePayload | (typeof basePayload & typeof launchFields)) => {
    let query = db.from("products").update(payload).eq("id", productId);
    if (!isAdmin) {
      query = query.eq("creator_id", userId);
    }
    return query;
  };

  let { error } = await runUpdate({ ...basePayload, ...launchFields });
  // Fall back to base fields if the Phase 2 launch columns aren't migrated yet.
  if (error && isMissingColumnError(error)) {
    ({ error } = await runUpdate(basePayload));
  }

  if (error) {
    return { error: error.message };
  }

  await cacheInvalidatePrefix(PRODUCTS_CACHE_PREFIX);
  // The dashboard shows name/tagline/status, so an edit changes it too.
  revalidatePath("/dashboard");
  revalidatePath("/admin");

  redirect(`/products/${productSlug}`);
}

export type DeleteProductState = { error?: string } | undefined;

/**
 * Deletes a product and refreshes every view that listed it.
 *
 * `redirectTo` is where the caller lands afterwards: the product page passes
 * "/marketplace" (the page it's on is about to 404), while the admin dashboard
 * passes `null` to stay put — the revalidated table just drops the row. A
 * failed delete returns an error instead of silently pretending it worked.
 */
export async function deleteProduct(
  productId: string,
  redirectTo: string | null = "/marketplace",
): Promise<DeleteProductState> {
  const { userId } = await auth();

  if (!userId) {
    redirect("/login");
  }

  const supabase = createClient();

  // Admins may delete any product; everyone else only their own.
  const isAdmin = await getIsAdmin();
  const db = isAdmin ? createServiceClient() : supabase;
  let query = db.from("products").delete().eq("id", productId);
  if (!isAdmin) {
    query = query.eq("creator_id", userId);
  }
  // `select()` makes the delete return the rows it removed, so we can tell a
  // real deletion apart from one RLS silently matched nothing for.
  const { data: deleted, error } = await query.select("slug");

  if (error) {
    return { error: `Couldn't delete that product: ${error.message}` };
  }
  if (!deleted || deleted.length === 0) {
    return {
      error: "That product no longer exists, or you don't have permission to delete it.",
    };
  }

  await cacheInvalidatePrefix(PRODUCTS_CACHE_PREFIX);

  // Drop the row from every cached render that showed it. Revalidating the two
  // dashboards is what lets them refresh in place instead of navigating away.
  revalidatePath("/admin");
  revalidatePath("/dashboard");
  revalidatePath("/marketplace");
  for (const { slug } of deleted) {
    revalidatePath(`/products/${slug}`);
  }

  if (redirectTo) {
    redirect(redirectTo);
  }
}
