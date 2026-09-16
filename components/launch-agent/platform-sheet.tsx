"use client";

/* Design system: design.md (Bharat Hunt — orange) · Launch Agent platform sheet.
 * Everything for one platform: readiness, checklist, hand-off, progress
 * reporting and the launch kit. Full-width on phones, a wide panel on desktop. */

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Circle, ExternalLink, Loader2, Send, Sparkles } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { markLaunchPlatformStatus, prepareLaunchPlatform, submitLaunchPlatform } from "@/lib/actions/launch-agent";
import { HANDOFF_MESSAGE } from "@/lib/launch-agent/adapters";
import { AUTOMATION_META, canMarkManually } from "@/lib/launch-agent/status";
import type { RequirementCheck } from "@/lib/launch-agent/types";
import type { PlatformView } from "@/lib/launch-agent/view";
import { cn } from "@/lib/utils";
import { AutomationBadge, ProgressBar, StatusPill } from "./badges";
import { CopyButton } from "./copy-button";
import { LaunchKitView } from "./launch-kit";
import type { useLaunchAction } from "./use-launch-action";

type Runner = ReturnType<typeof useLaunchAction>;

function CheckRow({ check, productSlug }: { check: RequirementCheck; productSlug: string }) {
  const Icon = check.status === "ok" ? CheckCircle2 : check.status === "missing" ? AlertTriangle : Circle;
  return (
    <li className="flex items-start gap-2.5 py-2">
      <Icon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          check.status === "ok" && "text-success",
          check.status === "missing" && (check.required ? "text-warning" : "text-muted"),
          check.status === "manual" && "text-muted",
        )}
        aria-hidden="true"
      />
      <div className="min-w-0 text-sm">
        <p className={cn("text-ink", check.status === "ok" && "text-body")}>
          <span className="sr-only">{check.status === "ok" ? "Done: " : check.status === "missing" ? "Missing: " : "You do this: "}</span>
          {check.label}
          {!check.required && <span className="text-muted"> (optional)</span>}
          {check.verified && <span className="ml-1.5 rounded bg-secondary-bg px-1 py-0.5 text-[10px] text-muted">from the platform&apos;s site</span>}
        </p>
        {check.hint && <p className="mt-0.5 text-xs text-muted">{check.hint}</p>}
        {check.status === "missing" && check.fix === "edit_product" && (
          <Link href={`/products/${productSlug}/edit`} className="mt-1 inline-block text-xs font-semibold text-primary hover:underline">
            Edit your listing →
          </Link>
        )}
      </div>
    </li>
  );
}

export function PlatformSheet({
  open,
  onOpenChange,
  platform,
  productId,
  productSlug,
  runner,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  platform: PlatformView | null;
  productId: string;
  productSlug: string;
  runner: Runner;
}) {
  const [publishedUrl, setPublishedUrl] = useState("");
  const [askUrl, setAskUrl] = useState(false);

  const row = platform?.campaign ?? null;
  const prepared = Boolean(row?.preparedAt);
  const checks = row?.checks ?? [];
  const checkable = checks.filter((check) => check.status !== "manual");
  const manual = checks.filter((check) => check.status === "manual");
  const missingGenerated = checks.some((check) => check.status === "missing" && check.fix === "generate");
  const slug = platform?.slug ?? "";
  const level = platform?.automationLevel ?? "AI_PREPARED";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 bg-background p-0 sm:max-w-2xl data-[side=right]:sm:max-w-2xl">
        {platform && (
          <>
            <SheetHeader className="border-b border-border bg-card px-5 pt-5 pb-4 pr-14">
              <SheetTitle className="text-lg font-bold text-ink">{platform.name}</SheetTitle>
              <SheetDescription className="text-sm text-body">{platform.description}</SheetDescription>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <AutomationBadge level={level} />
                {row && <StatusPill status={row.status} />}
                {row && <span className="text-xs text-muted">Fit {row.fitScore}/100</span>}
              </div>
            </SheetHeader>

            <div className="flex flex-col gap-6 px-5 py-5">
              {runner.notice && (
                <div
                  role={runner.notice.kind === "error" ? "alert" : "status"}
                  className={cn(
                    "rounded-xl border px-3.5 py-3 text-sm",
                    runner.notice.kind === "error" ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-success/30 bg-success/5 text-ink",
                  )}
                >
                  {runner.notice.text}
                  {runner.notice.url && (
                    <a href={runner.notice.url} target="_blank" rel="noopener noreferrer" className="ml-2 font-semibold text-primary underline">
                      Open submission
                    </a>
                  )}
                </div>
              )}

              {row?.status === "FAILED" && row.errorMessage && (
                <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3.5 text-sm text-destructive">
                  <p className="font-semibold">{platform.name} connection failed.</p>
                  <p className="mt-0.5">Your launch campaign has not been published.</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    disabled={runner.pending}
                    onClick={() => runner.run(`submit-${slug}`, () => submitLaunchPlatform(productId, slug))}
                  >
                    Retry
                  </Button>
                </div>
              )}

              {/* Readiness */}
              <section className="rounded-2xl border border-border bg-card p-4">
                {prepared && row ? (
                  <>
                    <div className="flex items-baseline justify-between">
                      <h3 className="text-base font-bold text-ink">{platform.name} launch</h3>
                      <p className="font-mono text-2xl font-bold text-ink tabular-nums">{row.readiness}% <span className="text-sm font-sans font-medium text-muted">ready</span></p>
                    </div>
                    <ProgressBar value={row.readiness} className="mt-2" />
                    <p className="mt-3 text-sm text-body">{AUTOMATION_META[level].description}</p>
                  </>
                ) : (
                  <>
                    <h3 className="text-base font-bold text-ink">Not prepared yet</h3>
                    <p className="mt-1 text-sm text-body">
                      Preparing checks {platform.name}&apos;s requirements against your listing, drafts platform-specific copy,
                      and saves a checklist.
                    </p>
                    <Button
                      className="mt-3 w-full sm:w-auto"
                      disabled={runner.pending}
                      onClick={() => runner.run(`prepare-${slug}`, () => prepareLaunchPlatform(productId, slug))}
                    >
                      {runner.pendingKey === `prepare-${slug}` ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Sparkles className="size-4" aria-hidden="true" />}
                      {level === "AI_PREPARED" ? "Generate Launch Kit" : "Prepare Submission"}
                    </Button>
                  </>
                )}
              </section>

              {/* Requirements */}
              <section aria-labelledby={`req-${slug}`}>
                <h3 id={`req-${slug}`} className="text-base font-bold text-ink">Requirements</h3>
                <p className="text-xs text-muted">
                  Items marked &ldquo;from the platform&apos;s site&rdquo; were checked against {platform.name}&apos;s own pages
                  {platform.guidelinesUrl ? (
                    <>
                      {" "}
                      —{" "}
                      <a href={platform.guidelinesUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        read their rules
                      </a>
                    </>
                  ) : null}
                  . Platforms change their forms; check before you submit.
                </p>
                {prepared ? (
                  <>
                    {checkable.length > 0 && (
                      <ul className="mt-2 divide-y divide-border rounded-2xl border border-border bg-card px-3">
                        {checkable.map((check) => <CheckRow key={check.key} check={check} productSlug={productSlug} />)}
                      </ul>
                    )}
                    {manual.length > 0 && (
                      <>
                        <h4 className="mt-4 text-sm font-semibold text-ink">You&apos;ll do these on {platform.name}</h4>
                        <ul className="mt-1 divide-y divide-border rounded-2xl border border-border bg-card px-3">
                          {manual.map((check) => <CheckRow key={check.key} check={check} productSlug={productSlug} />)}
                        </ul>
                      </>
                    )}
                  </>
                ) : (
                  <ul className="mt-2 divide-y divide-border rounded-2xl border border-border bg-card px-3">
                    {platform.requirementsConfig.map((requirement) => (
                      <li key={requirement.key} className="flex items-start gap-2.5 py-2 text-sm text-ink">
                        <Circle className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
                        <span>
                          {requirement.label}
                          {!requirement.required && <span className="text-muted"> (optional)</span>}
                          {requirement.note && <span className="block text-xs text-muted">{requirement.note}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {platform.launchNote && <p className="mt-2 text-xs text-muted">Timing: {platform.launchNote}</p>}
                {platform.instructions && <p className="mt-2 rounded-xl bg-secondary-bg p-3 text-sm text-body">{platform.instructions}</p>}
              </section>

              {/* Hand-off and progress */}
              {prepared && row && (
                <section className="rounded-2xl border border-primary/20 bg-secondary-bg/60 p-4">
                  <p className="text-sm font-semibold text-ink">{level === "AUTOMATED" ? "Ready to connect" : HANDOFF_MESSAGE}</p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    {missingGenerated && (
                      <Button
                        variant="outline"
                        disabled={runner.pending}
                        onClick={() => runner.run(`prepare-${slug}`, () => prepareLaunchPlatform(productId, slug))}
                      >
                        <Sparkles className="size-4" aria-hidden="true" /> Generate Missing Content
                      </Button>
                    )}
                    {level === "AUTOMATED" ? (
                      <Button disabled={runner.pending} onClick={() => runner.run(`submit-${slug}`, () => submitLaunchPlatform(productId, slug))}>
                        <Send className="size-4" aria-hidden="true" /> Submit
                      </Button>
                    ) : (
                      row.submissionUrl && (
                        <a href={row.submissionUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants()}>
                          Open Submission <ExternalLink className="size-4" aria-hidden="true" />
                        </a>
                      )
                    )}
                    {canMarkManually(level, row.status, "SUBMITTED") && row.status !== "SUBMITTED" && (
                      <Button
                        variant="outline"
                        disabled={runner.pending}
                        onClick={() => runner.run(`mark-${slug}`, () => markLaunchPlatformStatus(productId, slug, "SUBMITTED"))}
                      >
                        I&apos;ve submitted it
                      </Button>
                    )}
                    {canMarkManually(level, row.status, "PUBLISHED") && !askUrl && (
                      <Button variant="outline" onClick={() => setAskUrl(true)}>
                        It&apos;s live — add link
                      </Button>
                    )}
                    {row.status === "PUBLISHED" && canMarkManually(level, row.status, "SUBMITTED") && (
                      <Button variant="ghost" disabled={runner.pending} onClick={() => runner.run(`mark-${slug}`, () => markLaunchPlatformStatus(productId, slug, "SUBMITTED"))}>
                        Undo published
                      </Button>
                    )}
                    {row.status === "SUBMITTED" && (
                      <Button variant="ghost" disabled={runner.pending} onClick={() => runner.run(`mark-${slug}`, () => markLaunchPlatformStatus(productId, slug, "READY"))}>
                        Undo submitted
                      </Button>
                    )}
                  </div>
                  {askUrl && (
                    <form
                      className="mt-3 flex flex-col gap-2 sm:flex-row"
                      onSubmit={(event) => {
                        event.preventDefault();
                        runner.run(`mark-${slug}`, () => markLaunchPlatformStatus(productId, slug, "PUBLISHED", publishedUrl), () => {
                          setAskUrl(false);
                          setPublishedUrl("");
                        });
                      }}
                    >
                      <Input
                        type="url"
                        required
                        inputMode="url"
                        placeholder={`https://… your live ${platform.name} listing`}
                        value={publishedUrl}
                        onChange={(event) => setPublishedUrl(event.target.value)}
                        aria-label={`Link to your live ${platform.name} listing`}
                        className="bg-card sm:flex-1"
                      />
                      <Button type="submit" disabled={runner.pending}>Mark published</Button>
                    </form>
                  )}
                  {row.publishedUrl && (
                    <p className="mt-3 text-xs text-muted">
                      You marked this published:{" "}
                      <a href={row.publishedUrl} target="_blank" rel="noopener noreferrer" className="break-all text-primary hover:underline">
                        {row.publishedUrl}
                      </a>
                    </p>
                  )}
                  {row.utmUrl && (
                    <div className="mt-3 flex flex-col gap-1.5 rounded-xl bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-ink">Tracked link for {platform.name}</p>
                        <p className="truncate font-mono text-xs text-muted">{row.utmUrl}</p>
                      </div>
                      <CopyButton text={row.utmUrl} label="Copy link" />
                    </div>
                  )}
                </section>
              )}

              {prepared && row?.kit && (
                <LaunchKitView
                  productId={productId}
                  platformSlug={slug}
                  platformName={platform.name}
                  kit={row.kit}
                  editedFields={row.editedFields}
                  runner={runner}
                />
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
