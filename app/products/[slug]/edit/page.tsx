import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isMissingColumnError } from "@/lib/supabase/errors";
import { getIsAdmin } from "@/lib/admin";
import { ProductForm } from "@/components/products/product-form";
import { Container } from "@/components/ui/container";

/** Every column the form can edit. A literal, so Supabase infers the row type. */
const FULL_COLUMNS =
  "id, slug, creator_id, name, tagline, description, category, pricing_type, website_url, github_url, video_url, hero_image_url, screenshot_urls, tags, cta_text, cta_url, platform_links, tech_stack, coupon_code, offer_description, offer_expires_at, roadmap_url, changelog_url, available_for_hire, hire_pitch, launch_state";

/** Columns owned by a migration that may not have been applied yet. */
const LAUNCH_COLUMNS = [
  "cta_text",
  "cta_url",
  "platform_links",
  "tech_stack",
  "coupon_code",
  "offer_description",
  "offer_expires_at",
  "roadmap_url",
  "changelog_url",
  "available_for_hire",
  "hire_pitch",
];
const LOCATION_COLUMNS = ["launch_state"];

/** `FULL_COLUMNS` minus `drop` — the narrower sets are derived, never retyped. */
const without = (drop: string[]) =>
  FULL_COLUMNS.split(", ")
    .filter((column) => !drop.includes(column))
    .join(", ");

/** Tried in order when a migration behind `FULL_COLUMNS` hasn't been applied. */
const NARROWER_COLUMNS = [
  without(LOCATION_COLUMNS),
  without(LAUNCH_COLUMNS),
  without([...LAUNCH_COLUMNS, ...LOCATION_COLUMNS]),
];

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

  // The launch fields and the launch-location fields come from separate
  // migrations that may not both have been applied, so ask for the most
  // complete row the database can answer and narrow only on "column does not
  // exist". Rows from a narrower set are still typed as the full row — the
  // form reads every optional field with `??`, so a missing one reads as empty.
  const readColumns = (columns: string) =>
    supabase
      .from("products")
      .select(columns as typeof FULL_COLUMNS)
      .eq("slug", slug)
      .maybeSingle();

  let { data: product, error } = await readColumns(FULL_COLUMNS);

  for (let i = 0; i < NARROWER_COLUMNS.length && error && isMissingColumnError(error); i++) {
    ({ data: product, error } = await readColumns(NARROWER_COLUMNS[i]));
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
    <main className="min-h-dvh bg-background py-12 md:py-16">
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
