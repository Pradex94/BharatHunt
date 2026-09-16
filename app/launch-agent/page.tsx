/* Design system: design.md (Bharat Hunt — orange) · /launch-agent
 * The feature's front door. Signed-in makers go straight to their products;
 * everyone else gets a short, honest explanation of what it does. */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { Bot, ClipboardCheck, Hand, Rocket, Sparkles } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { AUTOMATION_META } from "@/lib/launch-agent/status";

export const metadata: Metadata = {
  title: "Launch Agent",
  description: "Launch once on BharatHunt. Get your product ready for discovery everywhere.",
  alternates: { canonical: "/launch-agent" },
};

export const dynamic = "force-dynamic";

const STEPS = [
  { Icon: Rocket, title: "Launch on BharatHunt", body: "Once your product is approved and live, Launch Agent starts a campaign for it." },
  { Icon: Sparkles, title: "Get a distribution plan", body: "Each platform is scored against your listing, with the reason it fits and a suggested launch date." },
  { Icon: ClipboardCheck, title: "Prepare every launch", body: "Platform-specific copy, a requirements checklist and tracked links — ready to copy from any device." },
];

export default async function LaunchAgentLanding() {
  const { userId } = await auth();
  if (userId) redirect("/dashboard/launch-agent");

  return (
    <main className="min-h-dvh bg-background py-12 md:py-20">
      <Container>
        <div className="mx-auto flex max-w-4xl flex-col gap-12">
          <header className="flex flex-col items-center gap-5 text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-primary">
              🚀 BharatHunt Launch Agent · Free
            </span>
            <h1 className="text-4xl font-bold tracking-tight text-ink sm:text-5xl">Launch Agent</h1>
            <p className="max-w-2xl text-lg text-body">Launch once on BharatHunt. Get your product ready for discovery everywhere.</p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link href="/login?redirect_url=%2Fdashboard%2Flaunch-agent" className={buttonVariants({ size: "lg" })}>
                Open Launch Agent
              </Link>
              <Link href="/submit" className={buttonVariants({ size: "lg", variant: "outline" })}>
                Launch a Product
              </Link>
            </div>
          </header>

          <ol className="grid gap-4 md:grid-cols-3">
            {STEPS.map(({ Icon, title, body }, index) => (
              <li key={title} className="rounded-3xl border border-border bg-card p-6 shadow-soft">
                <span className="flex size-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#FF6B1A,#FF8A3D)] text-white">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <p className="mt-4 text-xs font-semibold text-muted">Step {index + 1}</p>
                <h2 className="text-lg font-bold text-ink">{title}</h2>
                <p className="mt-1 text-sm text-body">{body}</p>
              </li>
            ))}
          </ol>

          <section className="rounded-3xl bg-surface-dark p-6 text-on-dark sm:p-8">
            <h2 className="text-xl font-bold text-white">What we do, and what you do</h2>
            <p className="mt-1 text-sm text-white/70">
              We never claim a launch happened unless it actually did, and we never post where a platform doesn&apos;t allow it.
            </p>
            <ul className="mt-5 grid gap-3 md:grid-cols-3">
              {(["AUTOMATED", "ASSISTED", "AI_PREPARED"] as const).map((level) => {
                const Icon = level === "AUTOMATED" ? Bot : level === "ASSISTED" ? Hand : Sparkles;
                return (
                  <li key={level} className="rounded-2xl bg-surface-dark-elevated p-4">
                    <p className="flex items-center gap-2 font-semibold text-white">
                      <Icon className="size-4 text-primary" aria-hidden="true" /> {AUTOMATION_META[level].label}
                    </p>
                    <p className="mt-1 text-sm text-white/70">{AUTOMATION_META[level].description}</p>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </Container>
    </main>
  );
}
