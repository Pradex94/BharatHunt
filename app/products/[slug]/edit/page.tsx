import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isMissingColumnError } from "@/lib/supabase/errors";
import { getIsAdmin } from "@/lib/admin";
import { ProductForm } from "@/components/products/product-form";
import { Container } from "@/components/ui/container";

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
      "id, slug, creator_id, name, tagline, description, category, pricing_type, website_url, github_url, video_url, hero_image_url, screenshot_urls, tags, cta_text, cta_url, platform_links, tech_stack, coupon_code, offer_description, offer_expires_at, roadmap_url, changelog_url, available_for_hire, hire_pitch",
    )
    .eq("slug", slug)
    .maybeSingle();

  // Fall back to base columns if the Phase 2 launch columns aren't migrated yet.
  if (error && isMissingColumnError(error)) {
    const fallback = await supabase
      .from("products")
      .select(
        "id, slug, creator_id, name, tagline, description, category, pricing_type, website_url, github_url, video_url, hero_image_url, screenshot_urls, tags",
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
    <main className="min-h-screen bg-background py-12 md:py-16">
      <Container>
        <div className="mx-auto w-full max-w-5xl">
          <div className="mb-8 space-y-3">
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Edit product
            </h1>
            <p className="text-base text-body">
              Update your product&apos;s details below. Changes go live instantly.
            </p>
          </div>
          <ProductForm product={product} />
        </div>
      </Container>
    </main>
  );
}
