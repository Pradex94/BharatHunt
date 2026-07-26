import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { ProductForm } from "@/components/products/product-form";
import { Container } from "@/components/ui/container";

export const metadata = {
  title: "Launch Your Product | Bharat Hunt",
  description: "Share your product with the Bharat Hunt community.",
};

export default async function SubmitPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen bg-background py-12 md:py-16">
      <Container>
        <div className="mx-auto w-full max-w-5xl">
          {/* Header */}
          <div className="mb-8 space-y-3">
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Launch Your Product
            </h1>
            <p className="text-base text-body">
              Share what you've built with the Bharat Hunt community. Fill in the details below and your product will be live instantly.
            </p>
          </div>

          {/* Form */}
          <ProductForm />
        </div>
      </Container>
    </main>
  );
}
