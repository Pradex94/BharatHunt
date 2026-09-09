import Link from "next/link";
import { ArrowUpRight, BadgeCheck, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import { Numeric } from "@/components/ui/typography";
import { cardInteractiveClassName } from "@/components/ui/card";
import { FUNDING_STAGE_BADGE, type FundingStage } from "@/lib/funding/constants";
import {
  displayAmount,
  formatDay,
  relativeTime,
  sourceFaviconUrl,
  UNDISCLOSED_LABEL,
} from "@/lib/funding/format";
import type { FundingRoundRow } from "@/services/funding";

/**
 * One funding round.
 *
 * The hierarchy is deliberate and is the whole design of this card: the
 * **amount** is the largest thing on it, because it is what a reader scanning a
 * feed of funding news is actually scanning for. Then the company, then the
 * headline, then the stage and sector as badges, then the investors as chips,
 * then — always, never optional — the source and a link to it.
 *
 * What this card will not do
 * --------------------------
 * Show a zero. A round with no reported figure renders the word "Undisclosed"
 * in muted text at the same size the amount would occupy, because the absence
 * of a number is a fact about the round and "₹0" is a claim nobody made.
 *
 * Show a converted figure. `displayAmount` returns what the source reported, in
 * the currency it reported. The rupee equivalent exists on the row and is used
 * only by the charts, which say so underneath themselves.
 *
 * Server component: no state, no handlers, nothing to hydrate. A feed of twenty
 * of these costs no client JavaScript at all.
 */

export function FundingRoundCard({
  round,
  className,
}: {
  round: FundingRoundRow;
  className?: string;
}) {
  const amount = displayAmount(round);
  const stageClass =
    FUNDING_STAGE_BADGE[round.funding_stage as FundingStage] ?? FUNDING_STAGE_BADGE.Undisclosed;
  const favicon = sourceFaviconUrl(round.source_url);
  const published = round.source_published_at ?? round.announcement_date;

  // Four chips is what fits on a 320px screen without wrapping to a third row.
  const shownInvestors = round.investors.slice(0, 4);
  const remainingInvestors = round.investors.length - shownInvestors.length;

  return (
    <article
      className={cn(
        "group/round flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-xs sm:p-6",
        cardInteractiveClassName,
        className,
      )}
    >
      {/* Company + amount. Stacked on a phone so the amount keeps its scale
          rather than being squeezed beside the name. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              href={`/funding/${round.startup_slug}`}
              className="text-base font-bold tracking-tight text-ink transition-colors hover:text-primary"
            >
              {round.startup_name}
            </Link>
            {round.verified && (
              /* Only ever true when a person checked the record against its
                 source — extraction cannot set it. */
              <span
                className="inline-flex items-center gap-1 text-xs font-medium text-success"
                title="A Bharat Hunt reviewer checked this against the source"
              >
                <BadgeCheck className="size-3.5" aria-hidden="true" />
                Verified
              </span>
            )}
          </div>

          <h3 className="mt-1 text-sm leading-snug text-body">{round.headline}</h3>
        </div>

        <div className="shrink-0 sm:text-right">
          {amount ? (
            <Numeric className="block text-2xl leading-none font-bold text-ink sm:text-[26px]">
              {amount}
            </Numeric>
          ) : (
            <span className="block text-lg leading-none font-semibold text-muted-soft">
              {UNDISCLOSED_LABEL}
            </span>
          )}
          <span
            className={cn(
              "mt-2 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
              stageClass,
            )}
          >
            {round.funding_stage}
          </span>
        </div>
      </div>

      {round.summary && (
        <p className="text-sm leading-relaxed text-body">{round.summary}</p>
      )}

      {/* Sector and geography. Plain neutral chips — the stage badge above is
          the only coloured thing on the card, so it stays the thing you see. */}
      {(round.industry || round.city || round.location) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {round.industry && <MetaChip>{round.industry}</MetaChip>}
          {round.sub_industry && <MetaChip>{round.sub_industry}</MetaChip>}
          {(round.location || round.city) && <MetaChip>{round.location ?? round.city}</MetaChip>}
        </div>
      )}

      {round.investors.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-muted">Investors</span>
          {shownInvestors.map((investor) => (
            <span
              key={investor}
              className={cn(
                "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs",
                // The lead is marked, because "who led" is the single most
                // informative fact in an investor list.
                investor === round.lead_investor
                  ? "border-primary/30 bg-primary/8 font-semibold text-primary"
                  : "border-border bg-card text-body",
              )}
            >
              {investor}
              {investor === round.lead_investor && (
                <span className="ml-1 text-[10px] font-medium opacity-70">lead</span>
              )}
            </span>
          ))}
          {remainingInvestors > 0 && (
            <span className="text-xs text-muted">+{remainingInvestors} more</span>
          )}
        </div>
      )}

      {/* Attribution. Never optional, and never a bare domain when a name
          exists — the reader has to be able to judge the source. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <div className="flex min-w-0 items-center gap-2 text-xs text-muted">
          {favicon && (
            /* eslint-disable-next-line @next/next/no-img-element -- a remote
               favicon from an arbitrary publisher; next/image would need every
               such host allow-listed in next.config.ts. */
            <img
              src={favicon}
              alt=""
              width={16}
              height={16}
              loading="lazy"
              decoding="async"
              className="size-4 shrink-0 rounded-sm"
            />
          )}
          <span className="truncate">
            Source: <span className="font-medium text-body">{round.source_name}</span>
          </span>
          <span aria-hidden="true">·</span>
          {/* The machine-readable date is the title, so hovering a relative
              time gives the absolute one rather than nothing. */}
          <time dateTime={published} title={formatDay(published) ?? undefined} className="shrink-0">
            {relativeTime(published) ?? formatDay(published)}
          </time>
          {round.extraction_method !== "manual" && !round.verified && (
            <span
              className="inline-flex shrink-0 items-center gap-1 text-muted-soft"
              title="These fields were extracted automatically from the article and have not been checked by a person"
            >
              <Sparkles className="size-3" aria-hidden="true" />
              AI extracted
            </span>
          )}
        </div>

        <a
          href={round.source_url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary transition-colors hover:text-primary-active"
        >
          Read full story
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </a>
      </div>
    </article>
  );
}

function MetaChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md bg-secondary-bg px-2 py-0.5 text-xs font-medium text-body">
      {children}
    </span>
  );
}
