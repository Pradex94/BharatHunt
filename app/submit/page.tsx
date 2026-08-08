import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { PackageCheck } from "lucide-react";

import { ProductForm } from "@/components/products/product-form";
import { Container } from "@/components/ui/container";
import { buttonVariants } from "@/components/ui/button";
import { MAX_PRODUCTS_PER_USER } from "@/lib/constants";
import { getUserProductCount } from "@/services/products";
import { getIsAdmin } from "@/lib/admin";
import { detectStateCode } from "@/lib/request-geo";

export const metadata = {
  title: "Launch Your Product",
  description: "Share your product with the Bharat Hunt community.",
  // Sign-in-gated action, not a landing page. robots.txt disallows crawling;
  // this stops it being indexed if it's ever linked directly.
  robots: { index: false, follow: true },
};

export default async function SubmitPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/login");
  }

  const [count, isAdmin, detectedState] = await Promise.all([
    getUserProductCount(userId),
    getIsAdmin(),
    detectStateCode(),
  ]);
  const atLimit = !isAdmin && count >= MAX_PRODUCTS_PER_USER;

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
              Share what you&apos;ve built with the Bharat Hunt community. Fill in the details below
              and your product will be live instantly.
            </p>
            <p className="text-sm text-muted">
              {isAdmin
                ? `Admin — unlimited launches (you've launched ${count}).`
                : `You've launched ${count} of ${MAX_PRODUCTS_PER_USER} products.`}{" "}
              <Link href="/dashboard" className="text-primary hover:underline">
                Manage them
              </Link>
              .
            </p>
          </div>

          {atLimit ? (
            <div className="mx-auto flex max-w-xl flex-col items-center gap-4 rounded-2xl border border-border bg-card p-10 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <PackageCheck className="size-6" />
              </span>
              <h2 className="text-xl font-bold text-ink">You&apos;ve reached your launch limit</h2>
              <p className="max-w-md text-sm text-body">
                Each maker can launch up to {MAX_PRODUCTS_PER_USER} products on Bharat Hunt. To
                launch a new one, delete an existing product from your dashboard to free a slot.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Link href="/dashboard" className={buttonVariants()}>
                  Manage your products
                </Link>
                <Link href="/marketplace" className={buttonVariants({ variant: "outline" })}>
                  Browse the marketplace
                </Link>
              </div>
            </div>
          ) : (
            <ProductForm detectedState={detectedState} />
          )}
        </div>
      </Container>
    </main>
  );
}
