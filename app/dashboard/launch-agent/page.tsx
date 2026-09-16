/* Design system: design.md (Bharat Hunt — orange) · /dashboard/launch-agent
 * Every product the maker owns, with its Launch Agent status. */

import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { ArrowLeft } from "lucide-react";

import { ProductsHub } from "@/components/launch-agent/products-hub";
import { Container } from "@/components/ui/container";
import { listMakerCampaigns } from "@/services/launch-agent";

export const metadata = {
  title: "Launch Agent",
  description: "Launch once on BharatHunt. Get your product ready for discovery everywhere.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function LaunchAgentDashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect("/login?redirect_url=%2Fdashboard%2Flaunch-agent");

  const { items } = await listMakerCampaigns(userId);

  return (
    <main className="min-h-dvh bg-background py-10 md:py-14">
      <Container>
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
          <Link href="/dashboard" className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-semibold text-body hover:text-ink">
            <ArrowLeft className="size-4" aria-hidden="true" /> Your products
          </Link>
          <header>
            <p className="text-xs font-semibold tracking-[0.12em] text-primary uppercase">🚀 Launch Agent</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink sm:text-4xl">Launch Agent</h1>
            <p className="mt-2 max-w-2xl text-base text-body">
              Launch once on BharatHunt. Get your product ready for discovery everywhere — a plan, platform-specific copy and a
              checklist for each place worth launching.
            </p>
          </header>
          <section aria-label="Your products">
            <h2 className="mb-3 text-lg font-bold text-ink">Your Products</h2>
            <ProductsHub items={items} />
          </section>
        </div>
      </Container>
    </main>
  );
}
