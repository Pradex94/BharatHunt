/**
 * Viral share targets — the single source of truth for the pre-filled copy used
 * on product cards and the product page. Framework-agnostic (no React / next
 * imports) so it's safe to import from client or server.
 */

import { SITE_NAME } from "@/lib/constants";

export type ShareKey = "whatsapp" | "x" | "linkedin" | "facebook";

export type ShareTarget = {
  key: ShareKey;
  label: string;
  href: string;
};

export type BuildShareInput = {
  /** Absolute, canonical product URL. */
  url: string;
  name: string;
  tagline?: string | null;
  /** Maker's X/Twitter handle without the `@`, when known (Phase 2). */
  makerHandle?: string | null;
};

export function buildShareTargets({
  url,
  name,
  tagline,
  makerHandle,
}: BuildShareInput): ShareTarget[] {
  const enc = encodeURIComponent;
  const taglineSuffix = tagline ? ` ${tagline}` : "";

  // WhatsApp: "Check out {Name} on {Platform}! {Tagline} - {URL}"
  const whatsappText = `Check out ${name} on ${SITE_NAME}!${taglineSuffix} - ${url}`;

  // X: "We just discovered {Name} ({Tagline}) by @{Handle}! Check it out here: {URL} 🚀 #ProductLaunch"
  const handlePart = makerHandle ? ` by @${makerHandle.replace(/^@/, "")}` : "";
  const taglinePart = tagline ? ` (${tagline})` : "";
  const xText = `We just discovered ${name}${taglinePart}${handlePart}! Check it out here: ${url} 🚀 #ProductLaunch`;

  return [
    {
      key: "whatsapp",
      label: "Share on WhatsApp",
      href: `https://wa.me/?text=${enc(whatsappText)}`,
    },
    {
      key: "x",
      label: "Share on X",
      href: `https://twitter.com/intent/tweet?text=${enc(xText)}`,
    },
    {
      key: "linkedin",
      label: "Share on LinkedIn",
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}`,
    },
    {
      key: "facebook",
      label: "Share on Facebook",
      href: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`,
    },
  ];
}
