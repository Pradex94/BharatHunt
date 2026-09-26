"use client";

/* Design system: design.md (Bharat Hunt — orange) · Launch Agent campaign.
 * The founder's launch command center for one product: score, progress,
 * platform cards, timeline, performance and Copilot. Cream canvas, white
 * 24px cards, one orange gradient CTA per card. Single column on phones. */

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronDown, RefreshCw, TriangleAlert, X } from "lucide-react";

import { ProductLogo } from "@/components/products/product-logo";
import { Button } from "@/components/ui/button";
import { FadeIn } from "@/components/ui/motion";
import { Numeric } from "@/components/ui/typography";
import { prepareLaunchPlatform, reanalyzeLaunchCampaign } from "@/lib/actions/launch-agent";
import { STATUS_META } from "@/lib/launch-agent/status";
import { utmSourceFor } from "@/lib/launch-agent/utm";
import { launchStats, type CampaignView } from "@/lib/launch-agent/view";
import { cn } from "@/lib/utils";
import { ProgressBar, ScoreRing, StatusPill } from "./badges";
import { LaunchCopilot } from "./launch-copilot";
import { LaunchMission } from "./launch-mission";
import { LaunchTimeline } from "./launch-timeline";
import { PlatformCard } from "./platform-card";
import { PlatformSheet } from "./platform-sheet";
import { useLaunchAction } from "./use-launch-action";

function Card({ className, ...props }: React.ComponentProps<"section">) {
  return <section className={cn("rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6", className)} {...props} />;
}

export function CampaignDashboard({ view }: { view: CampaignView }) {
  const runner = useLaunchAction();
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [showOthers, setShowOthers] = useState(false);
  const [reviewQueue, setReviewQueue] = useState<string[] | null>(null);

  const { product, campaign } = view;
  const stats = launchStats(view.platforms);
  const recommended = view.platforms.filter((platform) => platform.campaign?.recommended);
  const others = view.platforms.filter((platform) => !platform.campaign?.recommended);
  const openPlatform = view.platforms.find((platform) => platform.slug === openSlug) ?? null;
  const analysis = campaign.analysis;

  const launchedCount = recommended.filter((p) => p.campaign?.status === "SUBMITTED" || p.campaign?.status === "PUBLISHED").length;
  const ready = recommended.filter((p) => p.campaign?.preparedAt && (p.campaign.status === "READY" || p.campaign.status === "READY_TO_SUBMIT"));
  // Next step, in the order a maker would want it: finish what's blocked, then
  // hand off what's ready, then prepare what hasn't been started.
  const nextPlatform =
    recommended.find((p) => p.campaign?.status === "MISSING_INFORMATION" || p.campaign?.status === "FAILED") ??
    ready[0] ??
    recommended.find((p) => !p.campaign?.preparedAt) ??
    null;
  const nextLabel = !nextPlatform
    ? null
    : !nextPlatform.campaign?.preparedAt
      ? `Prepare ${nextPlatform.name}`
      : nextPlatform.campaign.status === "MISSING_INFORMATION"
        ? `Finish ${nextPlatform.name} requirements`
        : nextPlatform.campaign.status === "FAILED"
          ? `Retry ${nextPlatform.name}`
          : `Continue: ${nextPlatform.name}`;
  const queueIndex = reviewQueue && openSlug ? reviewQueue.indexOf(openSlug) : -1;

  function closeSheet() {
    setOpenSlug(null);
    setReviewQueue(null);
    runner.setNotice(null);
  }

  if (campaign.status === "FAILED" || (campaign.status !== "READY" && !analysis)) {
    const analyzing = campaign.status === "ANALYZING" || campaign.status === "NOT_STARTED";
    return (
      <Card className="mx-auto flex max-w-xl flex-col items-center gap-4 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          {analyzing ? <RefreshCw className="size-6 animate-spin motion-reduce:animate-none" /> : <TriangleAlert className="size-6" />}
        </span>
        <div>
          <h2 className="text-lg font-bold text-ink">
            {analyzing ? "Your Launch Agent is analysing your product…" : "We couldn't generate your launch kit right now."}
          </h2>
          <p className="mt-1 text-sm text-body">Your BharatHunt product is safe.</p>
        </div>
        {runner.notice?.kind === "error" && <p role="alert" className="text-sm text-destructive">{runner.notice.text}</p>}
        <Button disabled={runner.pending} onClick={() => runner.run("reanalyze", () => reanalyzeLaunchCampaign(product.id))}>
          <RefreshCw className={cn("size-4", runner.pendingKey === "reanalyze" && "animate-spin")} aria-hidden="true" />
          {analyzing ? "Refresh" : "Try Again"}
        </Button>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Page-level notices when no sheet is open. */}
      {runner.notice && !openSlug && (
        <div
          role={runner.notice.kind === "error" ? "alert" : "status"}
          className={cn(
            "fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-lg items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-sm shadow-soft sm:bottom-6",
            runner.notice.kind === "error" ? "border-destructive/30 bg-card text-destructive" : "border-success/30 bg-card text-ink",
          )}
        >
          <span>{runner.notice.text}</span>
          <button type="button" onClick={() => runner.setNotice(null)} aria-label="Dismiss" className="-m-1 p-1 text-muted hover:text-ink">
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Hero */}
      <FadeIn>
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <ProductLogo src={product.heroImageUrl} name={product.name} size="md" />
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-[0.12em] text-primary uppercase">🚀 Launch Agent</p>
              <h1 className="truncate text-2xl font-bold tracking-tight text-ink sm:text-3xl">{product.name}</h1>
              <p className="mt-0.5 flex items-center gap-1.5 text-sm text-body">
                <span className="size-2 rounded-full bg-success" aria-hidden="true" /> Your product is live on BharatHunt
              </p>
            </div>
          </div>
          <Link
            href={`/products/${product.slug}`}
            className="inline-flex min-h-11 items-center gap-1.5 self-start rounded-md border border-border bg-card px-4 text-sm font-semibold text-ink hover:bg-secondary-bg sm:self-auto"
          >
            View on BharatHunt <ArrowUpRight className="size-4" aria-hidden="true" />
          </Link>
        </header>
      </FadeIn>

      {recommended.length > 0 && (
        <LaunchMission
          productName={product.name}
          totalRecommended={recommended.length}
          launchedCount={launchedCount}
          readyCount={ready.length}
          nextActionLabel={nextLabel}
          onContinue={() => nextPlatform && setOpenSlug(nextPlatform.slug)}
          onLaunchAll={() => {
            const queue = ready.map((p) => p.slug);
            setReviewQueue(queue);
            setOpenSlug(queue[0] ?? null);
          }}
        />
      )}

      {campaign.productChanged && (
        <div className="flex flex-col gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink">You edited your listing since this plan was made. Refresh it to re-score platforms and re-check requirements — your edits and progress are kept.</p>
          <Button size="sm" variant="outline" disabled={runner.pending} onClick={() => runner.run("reanalyze", () => reanalyzeLaunchCampaign(product.id))}>
            <RefreshCw className={cn("size-3.5", runner.pendingKey === "reanalyze" && "animate-spin")} aria-hidden="true" /> Refresh plan
          </Button>
        </div>
      )}

      {/* Score + progress */}
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="flex flex-col gap-5 sm:flex-row sm:items-center lg:col-span-3">
          <ScoreRing value={analysis?.productFit ?? 0} label="Distribution Score" size={128} />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-ink">Distribution Score</h2>
            <p className="mt-1 text-sm text-body">{analysis?.summary}</p>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                { label: "Platform fit", value: analysis?.breakdown.platformFit ?? 0 },
                { label: "Listing completeness", value: analysis?.breakdown.listingCompleteness ?? 0 },
              ].map((item) => (
                <div key={item.label}>
                  <dt className="flex justify-between text-xs text-muted">
                    {item.label} <Numeric className="text-ink">{item.value}</Numeric>
                  </dt>
                  <dd className="mt-1">
                    <ProgressBar value={item.value} />
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-muted">Scored from your listing against each platform&apos;s audience rules — not a prediction of traffic or votes.</p>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="text-lg font-bold text-ink">Launch progress</h2>
          <ul className="mt-3 divide-y divide-border">
            <li className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className="font-semibold text-ink">BharatHunt</span>
              <span className="inline-flex rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-semibold text-success">Published</span>
            </li>
            {recommended.map((platform) => (
              <li key={platform.slug}>
                <button
                  type="button"
                  onClick={() => setOpenSlug(platform.slug)}
                  className="flex min-h-11 w-full items-center justify-between gap-3 py-2 text-left text-sm hover:text-primary"
                >
                  <span className="truncate font-medium text-ink">{platform.name}</span>
                  {platform.campaign && platform.campaign.status !== "NOT_STARTED" ? (
                    <StatusPill status={platform.campaign.status} />
                  ) : (
                    <span className="text-xs text-muted">{STATUS_META.NOT_STARTED.label}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Platform cards */}
      <section aria-labelledby="platforms-title" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="platforms-title" className="text-xl font-bold text-ink">Here are the best places to launch</h2>
            <p className="text-sm text-body">
              {recommended.length} recommended {recommended.length === 1 ? "platform" : "platforms"} · BharatHunt never posts on your behalf where a platform doesn&apos;t allow it.
            </p>
          </div>
        </div>
        {recommended.length === 0 ? (
          <Card className="text-sm text-body">
            No platform is a strong match yet. A fuller description, a logo and screenshots will change that —{" "}
            <Link href={`/products/${product.slug}/edit`} className="font-semibold text-primary hover:underline">edit your listing</Link>.
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {recommended.map((platform) => (
              <PlatformCard
                key={platform.slug}
                platform={platform}
                preparing={runner.pendingKey === `prepare-${platform.slug}`}
                disabled={runner.pending}
                onOpen={() => setOpenSlug(platform.slug)}
                onPrepare={() =>
                  runner.run(`prepare-${platform.slug}`, () => prepareLaunchPlatform(product.id, platform.slug), () => setOpenSlug(platform.slug))
                }
              />
            ))}
          </div>
        )}

        {others.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowOthers((value) => !value)}
              aria-expanded={showOthers}
              className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-body hover:text-ink"
            >
              <ChevronDown className={cn("size-4 transition-transform", showOthers && "rotate-180")} aria-hidden="true" />
              {showOthers ? "Hide" : "Show"} {others.length} lower-fit {others.length === 1 ? "platform" : "platforms"}
            </button>
            {showOthers && (
              <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {others.map((platform) => (
                  <PlatformCard
                    key={platform.slug}
                    platform={platform}
                    preparing={runner.pendingKey === `prepare-${platform.slug}`}
                    disabled={runner.pending}
                    onOpen={() => setOpenSlug(platform.slug)}
                    onPrepare={() =>
                      runner.run(`prepare-${platform.slug}`, () => prepareLaunchPlatform(product.id, platform.slug), () => setOpenSlug(platform.slug))
                    }
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Timeline */}
      <section aria-labelledby="timeline-title" className="flex flex-col gap-3">
        <div>
          <h2 id="timeline-title" className="text-xl font-bold text-ink">Your recommended launch plan</h2>
          <p className="text-sm text-body">A suggested sequence based on each platform&apos;s launch rhythm. It&apos;s a recommendation, not a guarantee — change any date.</p>
        </div>
        <LaunchTimeline productId={product.id} publishedAt={product.publishedAt} platforms={view.platforms} runner={runner} />
      </section>

      {/* Performance + Copilot */}
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <Card>
          <h2 className="text-lg font-bold text-ink">Launch performance</h2>
          <dl className="mt-4 grid grid-cols-3 gap-3">
            {[
              { label: "Platforms prepared", value: stats.prepared },
              { label: "Submissions completed", value: stats.submitted },
              { label: "Published", value: stats.published },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl bg-secondary-bg/70 p-3">
                <dd className="text-2xl font-bold text-ink">
                  <Numeric>{item.value}</Numeric>
                </dd>
                <dt className="mt-0.5 text-xs leading-tight text-muted">{item.label}</dt>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-muted">Submitted and published counts are what you&apos;ve marked; BharatHunt can&apos;t see other platforms.</p>

          <h3 className="mt-5 text-sm font-bold text-ink">Traffic from launches</h3>
          <p className="mt-1 text-sm text-body">
            BharatHunt can&apos;t measure visits that land on your website from other platforms, so we don&apos;t show numbers here. Every link in your kits is tagged — look for these sources in your own analytics:
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[18rem] text-left text-sm">
              <thead>
                <tr className="text-xs text-muted">
                  <th className="py-1.5 font-medium">Platform</th>
                  <th className="py-1.5 font-medium">utm_source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recommended.map((platform) => (
                  <tr key={platform.slug}>
                    <td className="py-2 text-ink">{platform.name}</td>
                    <td className="py-2 font-mono text-xs text-body">{utmSourceFor(platform.slug)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <LaunchCopilot productId={product.id} productName={product.name} />
      </div>

      <PlatformSheet
        open={Boolean(openPlatform)}
        onOpenChange={(open) => {
          if (!open) closeSheet();
        }}
        platform={openPlatform}
        productId={product.id}
        productSlug={product.slug}
        runner={runner}
        queue={
          reviewQueue && queueIndex >= 0
            ? {
                index: queueIndex,
                total: reviewQueue.length,
                onNext: () => {
                  const next = reviewQueue[queueIndex + 1];
                  runner.setNotice(null);
                  if (next) setOpenSlug(next);
                  else closeSheet();
                },
              }
            : null
        }
      />
    </div>
  );
}
