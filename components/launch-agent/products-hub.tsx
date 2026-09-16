/* Design system: design.md (Bharat Hunt — orange) · Launch Agent product list.
 * Server component: every product the maker owns, with its campaign summary. */

import Link from "next/link";
import { ArrowRight, Clock, Plus, Rocket } from "lucide-react";

import { ProductLogo } from "@/components/products/product-logo";
import { buttonVariants } from "@/components/ui/button";
import { Numeric } from "@/components/ui/typography";
import type { MakerCampaignSummary } from "@/lib/launch-agent/view";
import { ProgressBar } from "./badges";

export function LaunchAgentEmptyState() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-3xl border border-dashed border-border bg-card p-10 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#FF6B1A,#FF8A3D)] text-white">
        <Rocket className="size-7" aria-hidden="true" />
      </span>
      <div>
        <h2 className="text-xl font-bold text-ink">🚀 Your Launch Agent is waiting</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-body">
          Publish a product on BharatHunt and we&apos;ll analyse where your product has the best opportunities for discovery.
        </p>
      </div>
      <Link href="/submit" className={buttonVariants()}>
        <Plus className="size-4" aria-hidden="true" /> Launch a Product
      </Link>
    </div>
  );
}

export function ProductsHub({ items }: { items: MakerCampaignSummary[] }) {
  if (items.length === 0) return <LaunchAgentEmptyState />;
  const live = items.filter((item) => item.productStatus === "published");

  return (
    <div className="flex flex-col gap-4">
      {live.length === 0 && <LaunchAgentEmptyState />}
      <ul className="grid gap-4 md:grid-cols-2">
        {items.map((item) => {
          const isLive = item.productStatus === "published";
          const analysed = item.campaignStatus === "READY";
          return (
            <li key={item.productId} className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-5 shadow-soft">
              <div className="flex items-center gap-3">
                <ProductLogo src={item.heroImageUrl} name={item.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-base font-bold text-ink">{item.name}</h2>
                  <p className="line-clamp-1 text-sm text-body">{item.tagline}</p>
                </div>
                {analysed && item.overallScore !== null && (
                  <div className="shrink-0 text-right">
                    <p className="text-[11px] text-muted uppercase">Score</p>
                    <p className="font-bold text-ink"><Numeric>{item.overallScore}</Numeric></p>
                  </div>
                )}
              </div>

              {isLive ? (
                analysed ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold text-ink">{item.averageReadiness}% Ready</span>
                      <span className="text-muted">
                        {item.recommended} recommended {item.recommended === 1 ? "platform" : "platforms"}
                      </span>
                    </div>
                    <ProgressBar value={item.averageReadiness} />
                  </div>
                ) : (
                  <p className="text-sm text-body">Your distribution plan is ready to generate — it takes a moment when you open it.</p>
                )
              ) : (
                <p className="flex items-center gap-1.5 text-sm text-muted">
                  <Clock className="size-4" aria-hidden="true" />
                  {item.productStatus === "pending" ? "In review — Launch Agent starts when it's live." : "Draft — submit it for review to start."}
                </p>
              )}

              {isLive && (
                <Link href={`/dashboard/launch-agent/${item.slug}`} className={buttonVariants({ className: "mt-auto w-full sm:w-auto sm:self-start" })}>
                  Open Campaign <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
