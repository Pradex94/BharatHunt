/* Design system: design.md (Bharat Hunt — orange) · /dashboard/launch-agent/[slug]
 * One product's Launch Agent campaign. Server-rendered from the maker's own
 * rows; every interaction goes through lib/actions/launch-agent.ts. */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { ArrowLeft, Clock } from "lucide-react";

import { CampaignDashboard } from "@/components/launch-agent/campaign-dashboard";
import { buttonVariants } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { authorizeCampaignAccess } from "@/lib/launch-agent/ownership";
import { buildCampaignView, getOrAnalyzeCampaign, getProductForSession, LaunchAgentNotConfiguredError } from "@/services/launch-agent";

export const metadata: Metadata = {
  title: "Launch Agent",
  robots: { index: false, follow: false },
};

// Reads the signed-in identity and private campaign rows. Never prerender.
export const dynamic = "force-dynamic";

export default async function LaunchCampaignPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { userId } = await auth();
  if (!userId) redirect(`/login?redirect_url=${encodeURIComponent(`/dashboard/launch-agent/${slug}`)}`);

  if (!/^[a-z0-9-]{1,80}$/.test(slug)) notFound();
  const product = await getProductForSession({ slug });
  const decision = authorizeCampaignAccess({
    userId,
    product: product ? { creatorId: product.creatorId, status: product.status } : null,
    intent: "write",
  });

  if (!decision.ok) {
    // Someone else's product and a missing one are the same 404.
    if (decision.status !== 403) notFound();
    return (
      <Shell>
        <div className="mx-auto flex max-w-xl flex-col items-center gap-4 rounded-3xl border border-border bg-card p-8 text-center shadow-soft">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Clock className="size-6" aria-hidden="true" />
          </span>
          <h1 className="text-xl font-bold text-ink">Launch Agent starts once {product!.name} is live</h1>
          <p className="text-sm text-body">
            Your product is {product!.status === "pending" ? "in review" : "a draft"}. As soon as it&apos;s published on BharatHunt,
            we&apos;ll analyse where it has the best opportunities for discovery.
          </p>
          <Link href="/dashboard" className={buttonVariants({ variant: "outline" })}>
            Back to your products
          </Link>
        </div>
      </Shell>
    );
  }

  let view: Awaited<ReturnType<typeof buildCampaignView>> | null = null;
  try {
    const campaign = await getOrAnalyzeCampaign(product!);
    view = await buildCampaignView(product!, campaign);
  } catch (error) {
    // Anything else reaches error.tsx: "Your BharatHunt product is safe. Try Again".
    if (!(error instanceof LaunchAgentNotConfiguredError)) throw error;
  }

  if (!view) {
    return (
      <Shell>
        <p className="mx-auto max-w-xl rounded-3xl border border-border bg-card p-8 text-center text-sm text-body shadow-soft">
          Launch Agent isn&apos;t switched on yet. Your BharatHunt product is safe — check back soon.
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <CampaignDashboard view={view} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-background py-8 md:py-12">
      <Container>
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          <Link href="/dashboard/launch-agent" className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-semibold text-body hover:text-ink">
            <ArrowLeft className="size-4" aria-hidden="true" /> All products
          </Link>
          {children}
        </div>
      </Container>
    </main>
  );
}
