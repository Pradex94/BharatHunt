import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
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

  const supabase = createClient();

  const { data: product, error } = await supabase
    .from("products")
    .select(
      "id, slug, creator_id, name, tagline, description, category, pricing_type, website_url, github_url, hero_image_url, tags",
    )
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load product: ${error.message}`);
  }
  if (!product) {
    notFound();
  }
  if (product.creator_id !== userId) {
    redirect(`/products/${slug}`);
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 px-4 py-10">
      <h1 className="text-2xl font-semibold text-foreground">Edit product</h1>
      <ProductForm product={product} />
    </div>
  );
}
