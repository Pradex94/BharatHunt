import { NextResponse } from "next/server";
import { requireAgentAccount } from "@agentonboard/sdk/next";
import { getAgentAudience, resolveAgentAccount } from "@/lib/agentonboard/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { CATEGORIES } from "@/lib/constants";

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

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
  if (hasScheme && !/^https?:\/\//i.test(trimmed)) return null;
  const withScheme = hasScheme ? trimmed : `https://${trimmed.replace(/^\/+/, "")}`;
  try {
    const parsed = new URL(withScheme);
    if (!parsed.hostname.includes(".")) return null;
    return withScheme;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  const category = searchParams.get("category")?.trim();
  const sort = searchParams.get("sort") || "trending";
  const rawLimit = Number.parseInt(searchParams.get("limit") || "20", 10);
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 20, 1), 50);

  const supabase = createServiceClient();
  let query = supabase
    .from("products")
    .select("id, slug, name, tagline, description, category, website_url, hero_image_url, upvote_count, comment_count, created_at, published_at")
    .eq("status", "published");

  if (category) {
    query = query.eq("category", category);
  }

  if (q) {
    query = query.or(`name.ilike.%${q}%,tagline.ilike.%${q}%,description.ilike.%${q}%`);
  }

  if (sort === "top") {
    query = query.order("upvote_count", { ascending: false });
  } else if (sort === "newest") {
    query = query.order("published_at", { ascending: false });
  } else {
    // Trending / default
    query = query.order("upvote_count", { ascending: false }).order("created_at", { ascending: false });
  }

  query = query.limit(limit);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    products: data ?? [],
    count: data?.length ?? 0,
  });
}

export async function POST(request: Request) {
  const session = await requireAgentAccount(request, {
    audience: getAgentAudience(),
    resolveAccount: resolveAgentAccount,
  });

  if (!session.ok) {
    return session.response;
  }

  const userId = session.user;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const name = String(body.name ?? "").trim();
  const tagline = String(body.tagline ?? "").trim();
  const description = String(body.description ?? "").trim();
  const rawWebsite = String(body.website_url ?? "").trim();
  const categorySlug = String(body.category_slug ?? body.category ?? "").trim().toLowerCase();
  const pricingType = ["free", "freemium", "paid"].includes(body.pricing_type)
    ? body.pricing_type
    : "free";

  if (!name || name.length > 60) {
    return NextResponse.json(
      { error: "Name is required and must be 60 characters or fewer." },
      { status: 422 },
    );
  }

  if (!tagline || tagline.length > 120) {
    return NextResponse.json(
      { error: "Tagline is required and must be 120 characters or fewer." },
      { status: 422 },
    );
  }

  if (!description) {
    return NextResponse.json(
      { error: "Description is required." },
      { status: 422 },
    );
  }

  const websiteUrl = normalizeUrl(rawWebsite);
  if (!websiteUrl) {
    return NextResponse.json(
      { error: "A valid website_url (e.g. https://example.com) is required." },
      { status: 422 },
    );
  }

  const validCategories = CATEGORIES.map((c) => c.slug);
  if (!validCategories.includes(categorySlug)) {
    return NextResponse.json(
      {
        error: `Invalid category_slug. Must be one of: ${validCategories.join(", ")}`,
      },
      { status: 422 },
    );
  }

  const heroImageUrl = body.hero_image_url || body.logo_url
    ? normalizeUrl(String(body.hero_image_url || body.logo_url))
    : null;
  const tags: string[] = Array.isArray(body.tags)
    ? body.tags.map((t: unknown) => String(t).trim().toLowerCase()).filter(Boolean).slice(0, 5)
    : [];

  const supabase = createServiceClient();

  // Generate unique slug
  const baseSlug = slugify(name);
  const { data: nearSlugs } = await supabase
    .from("products")
    .select("slug")
    .ilike("slug", `${baseSlug}%`)
    .limit(100);

  const taken = new Set((nearSlugs ?? []).map((p) => p.slug));
  let slug = baseSlug;
  if (taken.has(slug)) {
    slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
    if (taken.has(slug)) {
      slug = `${baseSlug}-${Date.now().toString(36)}`;
    }
  }

  const { data: inserted, error: insertError } = await supabase
    .from("products")
    .insert({
      creator_id: userId,
      slug,
      name,
      tagline,
      description,
      category: categorySlug,
      pricing_type: pricingType,
      website_url: websiteUrl,
      hero_image_url: heroImageUrl,
      tags,
      status: "pending",
    })
    .select("id, slug, name, status, created_at")
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json(
    {
      id: inserted.id,
      slug: inserted.slug,
      name: inserted.name,
      status: inserted.status,
      message: "Product submitted for review.",
    },
    { status: 201 },
  );
}
