"use client";

/* Design system: design.md (Bharat Hunt — orange) · /investors
 *
 * The free preview grid: the handful of investors anyone can look at, and the
 * detail panel they open into.
 *
 * A client component solely because the panel is stateful. The rows themselves
 * arrive as props from the server, which fetched exactly
 * `INVESTOR_FREE_PREVIEW_LIMIT` of them — there is no "show the rest" branch
 * here to get wrong, because the rest was never sent.
 */

import { useState } from "react";

import { trackEvent } from "@/lib/analytics";
import { InvestorCard } from "@/components/investors/investor-card";
import { InvestorDetailSheet } from "@/components/investors/investor-detail-sheet";
import { FadeInItem, FadeInStagger } from "@/components/ui/motion";
import type { InvestorFull, InvestorPreview } from "@/lib/investors";

export function InvestorPreviewGrid({ investors }: { investors: InvestorPreview[] }) {
  const [open, setOpen] = useState<InvestorPreview | InvestorFull | null>(null);

  return (
    <>
      {/*
        Safe to animate: this section is below the hero, so nothing here is a
        Largest Contentful Paint candidate. The rule components/ui/motion.tsx
        sets out — never wrap first-viewport content in these — is what keeps
        the hero above plain.
      */}
      <FadeInStagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {investors.map((investor) => (
          <FadeInItem key={investor.id} className="h-full">
            <InvestorCard
              investor={investor}
              onOpen={(record) => {
                setOpen(record);
                // Two events on purpose. `investor_detail_view` counts profile
                // opens across every tier and is the number that answers "is
                // anyone reading these"; `free_investor_view` is scoped to the
                // free four and is the top of the conversion funnel.
                trackEvent("investor_detail_view", { location: "investors", tier: "free" });
                trackEvent("free_investor_view", { location: "investors" });
              }}
            />
          </FadeInItem>
        ))}
      </FadeInStagger>

      <InvestorDetailSheet investor={open} onClose={() => setOpen(null)} />
    </>
  );
}
