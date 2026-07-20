import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { ProductForm } from "@/components/products/product-form";

export default async function SubmitPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/login");
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 px-4 py-10">
      <h1 className="text-2xl font-semibold text-foreground">Submit a product</h1>
      <p className="text-sm text-muted-foreground">
        Share what you&apos;ve built with the community.
      </p>
      <ProductForm />
    </div>
  );
}
