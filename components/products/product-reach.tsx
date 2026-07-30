"use client";

/* "Grow your reach" panel on the product page. Everyone can share the launch
 * (viral copy templates from lib/share); the founder additionally gets a
 * dofollow-backlink note and an embeddable "Featured on Bharat Hunt" badge
 * (self-contained inline HTML) to drop on their own site and drive traffic back. */

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Link2, Megaphone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { buildShareTargets } from "@/lib/share";
import { SHARE_ICONS } from "@/components/products/social-icons";

/** Best-effort hostname for display (e.g. "https://acme.com/x" → "acme.com"). */
function prettyHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function buildEmbedCode(productUrl: string): string {
  return `<a href="${productUrl}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:8px;padding:10px 16px;border:1px solid #efe6dd;border-radius:12px;background:#ffffff;color:#17140f;font-family:Inter,-apple-system,'Segoe UI',sans-serif;font-size:14px;font-weight:600;line-height:1;text-decoration:none;box-shadow:0 2px 8px -2px rgba(23,20,15,0.08);"><span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:6px;background:linear-gradient(135deg,#ff6b1a,#ff8a3d);color:#ffffff;font-weight:700;">B</span>Featured on Bharat Hunt</a>`;
}

export function ProductReach({
  productUrl,
  name,
  tagline,
  websiteUrl,
  isOwner,
}: {
  productUrl: string;
  name: string;
  tagline?: string | null;
  websiteUrl?: string | null;
  isOwner: boolean;
}) {
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  async function copy(text: string, which: "link" | "code") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(null), 1800);
    } catch {
      setCopied(null);
    }
  }

  const shares = buildShareTargets({ url: productUrl, name, tagline });

  return (
    <section className="flex flex-col gap-5 border-t border-border pt-8">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Megaphone className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-bold text-ink">
            {isOwner ? "Grow your reach" : "Share this product"}
          </h2>
          <p className="text-sm text-muted">
            {isOwner
              ? "Share your launch and add a badge to your site to drive more visibility."
              : "Help this maker get discovered."}
          </p>
        </div>
      </div>

      {/* Share row — available to everyone */}
      <div className="flex flex-wrap items-center gap-2">
        {shares.map((target) => {
          const Icon = SHARE_ICONS[target.key];
          return (
            <a
              key={target.key}
              href={target.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={target.label}
              className="flex size-10 items-center justify-center rounded-lg border border-border bg-card text-ink transition-colors duration-200 hover:border-primary/40 hover:text-primary"
            >
              <Icon className="size-4" />
            </a>
          );
        })}
        <button
          type="button"
          onClick={() => void copy(productUrl, "link")}
          className="flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-3.5 text-sm font-medium text-ink transition-colors duration-200 hover:border-primary/40 hover:text-primary"
        >
          {copied === "link" ? (
            <>
              <Check className="size-4 text-success" /> Copied
            </>
          ) : (
            <>
              <Link2 className="size-4" /> Copy link
            </>
          )}
        </button>
      </div>

      {/* Dofollow backlink note — founder-only */}
      {isOwner && websiteUrl && prettyHost(websiteUrl) && (
        <div className="flex items-start gap-2.5 rounded-xl border border-border bg-secondary-bg/50 p-4">
          <Link2 className="mt-0.5 size-4 shrink-0 text-primary" />
          <p className="text-sm text-body">
            Your listing links out to{" "}
            <span className="font-semibold text-ink">{prettyHost(websiteUrl)}</span> with a{" "}
            <span className="font-semibold text-ink">dofollow</span> backlink — permanent link
            equity from your Bharat Hunt page, plus referral traffic you can track in your
            analytics.
          </p>
        </div>
      )}

      {/* Embed badge — founder-only */}
      {isOwner && (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-secondary-bg/50 p-4">
          <div>
            <p className="text-sm font-semibold text-ink">Embed a badge on your site</p>
            <p className="text-xs text-muted">
              Paste this where you want it. Clicking it brings visitors to your Bharat Hunt page.
            </p>
          </div>

          {/* Live preview of the badge */}
          <div className="flex">
            <a
              href={productUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-ink shadow-sm"
            >
              <span className="flex size-[22px] items-center justify-center rounded-md bg-gradient-to-br from-[#ff6b1a] to-[#ff8a3d] text-xs font-bold text-white">
                B
              </span>
              Featured on Bharat&nbsp;Hunt
            </a>
          </div>

          <div className="relative">
            <pre className="max-h-32 overflow-auto rounded-lg border border-border bg-card p-3 pr-24 text-xs leading-relaxed break-all whitespace-pre-wrap text-body">
              {buildEmbedCode(productUrl)}
            </pre>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void copy(buildEmbedCode(productUrl), "code")}
              className="absolute top-2 right-2"
            >
              {copied === "code" ? (
                <>
                  <Check /> Copied
                </>
              ) : (
                <>
                  <Copy /> Copy code
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
