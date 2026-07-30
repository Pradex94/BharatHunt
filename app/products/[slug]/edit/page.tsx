import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isMissingColumnError } from "@/lib/supabase/errors";
import { getIsAdmin } from "@/lib/admin";
import { ProductForm } from "@/components/products/product-form";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { userId } = await auth();

  if (!userId) {
    redirect("/login");
  }

  // Admins can edit any product (service-role read reaches drafts too); other
  // users only their own rows via the RLS-scoped client.
  const isAdmin = await getIsAdmin();
  const supabase = isAdmin ? createServiceClient() : createClient();

  let { data: product, error } = await supabase
    .from("products")
    .select(
      "id, slug, creator_id, name, tagline, description, category, pricing_type, website_url, github_url, hero_image_url, screenshot_urls, tags, cta_text, cta_url, platform_links, tech_stack, coupon_code, offer_description, offer_expires_at, roadmap_url, changelog_url, available_for_hire, hire_pitch",
    )
    .eq("slug", slug)
    .maybeSingle();

  // Fall back to base columns if the Phase 2 launch columns aren't migrated yet.
  if (error && isMissingColumnError(error)) {
    const fallback = await supabase
      .from("products")
      .select(
        "id, slug, creator_id, name, tagline, description, category, pricing_type, website_url, github_url, hero_image_url, screenshot_urls, tags",
      )
      .eq("slug", slug)
      .maybeSingle();
    error = fallback.error;
    product = fallback.data as unknown as typeof product;
  }

  if (error) {
    throw new Error(`Failed to load product: ${error.message}`);
  }
  if (!product) {
    notFound();
  }
  if (product.creator_id !== userId && !isAdmin) {
    redirect(`/products/${slug}`);
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 px-4 py-10">
      <h1 className="text-2xl font-semibold text-foreground">Edit product</h1>
      <ProductForm product={product} />
    </div>
  );
}
