"use client";

/* Highlighted launch-offer box on the product page: shows the promo details and
 * a one-click copy for the coupon code, with an optional expiry line. */

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Tag } from "lucide-react";

export function OfferBox({
  code,
  description,
  expiresAt,
}: {
  code: string | null;
  description: string | null;
  expiresAt: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  if (!code && !description) return null;

  // Format the expiry deterministically from props (no `Date.now()` during
  // render — the repo's purity rule forbids it). Hiding a lapsed offer is done
  // upstream on the server page.
  const expiryDate = expiresAt ? new Date(expiresAt) : null;
  const expiryLabel =
    expiryDate && !Number.isNaN(expiryDate.getTime())
      ? expiryDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
      : null;

  async function copyCode() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 p-5">
      <div className="flex items-center gap-2">
        <Tag className="size-4 text-primary" />
        <h2 className="text-sm font-bold text-ink">Exclusive launch offer</h2>
      </div>

      {description && <p className="text-sm text-body">{description}</p>}

      {code && (
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded-lg border border-dashed border-primary/40 bg-card px-3 py-2 text-sm font-semibold tracking-wide text-ink">
            {code}
          </code>
          <button
            type="button"
            onClick={copyCode}
            className="flex h-10 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-medium text-white transition-opacity duration-150 hover:opacity-90"
          >
            {copied ? (
              <>
                <Check className="size-4" /> Copied
              </>
            ) : (
              <>
                <Copy className="size-4" /> Copy code
              </>
            )}
          </button>
        </div>
      )}

      {expiryLabel && <p className="text-xs text-muted">Offer ends {expiryLabel}</p>}
    </div>
  );
}
