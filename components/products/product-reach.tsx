"use client";

/* "Grow your reach" panel on the product page. Everyone can share the launch;
 * the founder additionally gets an embeddable "Featured on Bharat Hunt" badge
 * (self-contained inline HTML) to drop on their own site and drive traffic back. */

import { useEffect, useRef, useState } from "react";
import type { SVGProps } from "react";
import { Check, Copy, Link2, Megaphone } from "lucide-react";

import { Button } from "@/components/ui/button";

function XIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function LinkedInIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

function WhatsAppIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function FacebookIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function buildEmbedCode(productUrl: string): string {
  return `<a href="${productUrl}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:8px;padding:10px 16px;border:1px solid #efe6dd;border-radius:12px;background:#ffffff;color:#17140f;font-family:Inter,-apple-system,'Segoe UI',sans-serif;font-size:14px;font-weight:600;line-height:1;text-decoration:none;box-shadow:0 2px 8px -2px rgba(23,20,15,0.08);"><span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:6px;background:linear-gradient(135deg,#ff6b1a,#ff8a3d);color:#ffffff;font-weight:700;">B</span>Featured on Bharat Hunt</a>`;
}

export function ProductReach({
  productUrl,
  name,
  isOwner,
}: {
  productUrl: string;
  name: string;
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

  const shareText = `${name} on Bharat Hunt`;
  const shares = [
    {
      label: "Share on X",
      href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(productUrl)}`,
      Icon: XIcon,
    },
    {
      label: "Share on LinkedIn",
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(productUrl)}`,
      Icon: LinkedInIcon,
    },
    {
      label: "Share on WhatsApp",
      href: `https://wa.me/?text=${encodeURIComponent(`${shareText} ${productUrl}`)}`,
      Icon: WhatsAppIcon,
    },
    {
      label: "Share on Facebook",
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(productUrl)}`,
      Icon: FacebookIcon,
    },
  ];

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
        {shares.map(({ label, href, Icon }) => (
          <a
            key={label}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={label}
            className="flex size-10 items-center justify-center rounded-lg border border-border bg-card text-ink transition-colors duration-200 hover:border-primary/40 hover:text-primary"
          >
            <Icon className="size-4" />
          </a>
        ))}
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
