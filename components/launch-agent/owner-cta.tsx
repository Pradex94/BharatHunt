/* Design system: design.md (Bharat Hunt — orange) · product page owner CTA.
 * Rendered only when the server has established the viewer is the creator;
 * visitors never receive this markup, and it carries no campaign data. */

import Link from "next/link";
import { ArrowRight, Rocket } from "lucide-react";

export function LaunchAgentOwnerCta({ slug }: { slug: string }) {
  return (
    <Link
      href={`/dashboard/launch-agent/${slug}`}
      className="group flex items-center gap-4 rounded-2xl border border-primary/25 bg-[linear-gradient(135deg,rgb(255_107_26/0.08),rgb(255_138_61/0.04))] p-4 transition-colors hover:border-primary/50"
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#FF6B1A,#FF8A3D)] text-white">
        <Rocket className="size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-ink">🚀 Launch this product everywhere</span>
        <span className="block text-xs text-muted">Powered by BharatHunt Launch Agent · only you can see this</span>
      </span>
      <ArrowRight className="size-5 shrink-0 text-primary transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
    </Link>
  );
}
