import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { ProductCard, type ProductCardProduct } from "@/components/products/product-card";

export default async function Home() {
  const { userId } = await auth();
  const supabase = createClient();

  const { data: products, error } = await supabase
    .from("products")
    .select(
      "id, slug, name, tagline, category, pricing_type, upvote_count, comment_count, hero_image_url, creator:profiles!products_creator_id_fkey(display_name, username)",
    )
    .eq("status", "published")
    .order("trend_score", { ascending: false });

  if (error) {
    throw new Error(`Failed to load products: ${error.message}`);
  }

  let upvotedIds = new Set<string>();
  if (userId) {
    const { data: upvotes } = await supabase
      .from("upvotes")
      .select("product_id")
      .eq("user_id", userId);
    upvotedIds = new Set(upvotes?.map((u) => u.product_id));
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-10">
      <h1 className="text-2xl font-semibold text-foreground">Trending today</h1>
      {products.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No products yet — be the first to launch one.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product as ProductCardProduct}
              isUpvoted={upvotedIds.has(product.id)}
              isLoggedIn={Boolean(userId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
