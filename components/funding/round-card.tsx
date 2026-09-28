import Link from "next/link";
import { ArrowUpRight, BadgeCheck, ChevronDown, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import { Numeric } from "@/components/ui/typography";
import { FUNDING_STAGE_BADGE, type FundingStage } from "@/lib/funding/constants";
import {
  confidenceBand,
  convertedInrEstimate,
  formatDay,
  formatReportedAmount,
  hostOf,
  initialsOf,
  relativeTime,
  sourceFaviconUrl,
  UNDISCLOSED_LABEL,
} from "@/lib/funding/format";
import { cityLabel, investorHref, startupHref } from "@/lib/funding/links";
import type { FundingRoundRow } from "@/services/funding";

/**
 * One funding round.
 *
 * Hierarchy, top to bottom, and it is the whole design of this card:
 *
 *   [logo] Company  ·  trust label                    ₹25 Cr   ← dominant
 *   Headline as the source wrote it                    (≈ conversion)
 *   [Stage] [Industry] [City]
 *   Led by X  ·  with Y, Z +2
 *   Source · date · N more sources ▾             Read full story →
 *
 * The amount is the largest thing on it because it is what someone scanning a
 * funding feed is scanning for. The company name and the headline are separate
 * lines at separate weights: the name is the entity (and links to its funding
 * history), the headline is the *report* (and belongs to its source).
 *
 * What this card will not do
 * --------------------------
 * Show a zero. A round with no reported figure renders "Undisclosed" in muted
 * text where the amount would be — the absence of a number is a fact about the
 * round, and "₹0" is a claim nobody made.
 *
 * Replace the reported figure. The amount shown is the figure the source
 * reported, in its currency, typeset one way ("Rs 12.5 Crore" → "₹12.5 Cr";
 * the verbatim wording is on hover and on the company page). A dollar round additionally gets a small "≈ ₹X Cr" line,
 * labelled as a conversion, from the rupee figure stamped on the row at
 * extraction time — never instead of the original.
 *
 * Present extraction as verification. "Verified" appears only when a person
 * checked the record against its source; otherwise the card says it was
 * extracted automatically, with a confidence band where one exists.
 *
 * No state and no handlers — the "more sources" disclosure is a native
 * `<details>`, so twenty of these cost no client JavaScript beyond the list
 * that holds them.
 */
export function FundingRoundCard({
  round,
  className,
}: {
  round: FundingRoundRow;
  className?: string;
}) {
  const amount = formatReportedAmount(round);
  const reported = round.amount?.trim() || null;
  const converted = amount ? convertedInrEstimate(round) : null;
  const stageClass =
    FUNDING_STAGE_BADGE[round.funding_stage as FundingStage] ?? FUNDING_STAGE_BADGE.Undisclosed;
  const place = round.city ? cityLabel(round.city) : round.location;

  const lead = round.lead_investor;
  const others = round.investors.filter(
    (name) => name.toLowerCase() !== (lead ?? "").toLowerCase(),
  );
  // Three names fit one line at 375px; the rest collapse to a count.
  const shownOthers = others.slice(0, 3);
  const hiddenOthers = others.length - shownOthers.length;

  return (
    <article
      className={cn(
        "group/round flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 transition-[border-color,box-shadow] duration-200 hover:border-primary/25 hover:shadow-soft sm:p-6",
        className,
      )}
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-x-4">
        <CompanyMark name={round.startup_name} logoUrl={round.logo_url} />

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              href={startupHref(round.startup_slug)}
              className="text-base font-bold tracking-tight text-ink transition-colors hover:text-primary sm:text-lg"
            >
              {round.startup_name}
            </Link>
            <TrustLabel round={round} />
          </div>
          <h3 className="mt-1 line-clamp-2 text-sm leading-snug text-body">{round.headline}</h3>
        </div>

        {/* The amount. Its own column from `sm`, so it keeps its scale beside
            the name; on a phone it spans the full width under the header. */}
        <div className="col-span-2 flex items-baseline gap-2 sm:col-span-1 sm:flex-col sm:items-end sm:gap-1 sm:text-right">
          {amount ? (
            <Numeric
              className="text-[26px] leading-none font-bold text-ink sm:text-[30px]"
              title={reported ? `As reported by ${round.source_name}: ${reported}` : undefined}
            >
              {amount}
            </Numeric>
          ) : (
            <span
              className="text-lg leading-none font-semibold text-muted-soft"
              title="The source did not report an amount"
            >
              {UNDISCLOSED_LABEL}
            </span>
          )}
          {converted && (
            <span
              className="text-[11px] text-muted"
              title="Converted to rupees at the reference rate recorded when this round was added. The figure above is what the source reported."
            >
              ≈ {converted} <span className="text-muted-soft">converted</span>
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
            stageClass,
          )}
        >
          {round.funding_stage}
        </span>
        {round.industry && <MetaChip>{round.industry}</MetaChip>}
        {round.sub_industry && round.sub_industry !== round.industry && (
          <MetaChip>{round.sub_industry}</MetaChip>
        )}
        {place && <MetaChip>{place}</MetaChip>}
      </div>

      <InvestorLine lead={lead} others={shownOthers} hidden={hiddenOthers} />

      <Attribution round={round} />
    </article>
  );
}

/**
 * The company's logo, or its initials on a tinted tile. Ingestion does not
 * fetch logos (a publisher's article image is not the company's mark), so the
 * tile is the common case and is designed as one rather than as a broken image.
 */
export function CompanyMark({
  name,
  logoUrl,
  size = "md",
}: {
  name: string;
  logoUrl: string | null;
  size?: "md" | "lg";
}) {
  const box = size === "lg" ? "size-14 rounded-2xl text-lg" : "size-11 rounded-xl text-sm";
  if (logoUrl) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element -- an admin-set URL
         on an arbitrary host; next/image would need every host allow-listed. */
      <img
        src={logoUrl}
        alt=""
        width={size === "lg" ? 56 : 44}
        height={size === "lg" ? 56 : 44}
        loading="lazy"
        decoding="async"
        className={cn("shrink-0 border border-border bg-card object-contain", box)}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center bg-secondary-bg font-bold text-primary",
        box,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

/**
 * Where this record's facts came from, in one label.
 *
 * Three cases, never merged: a person checked it (Verified); a person entered
 * it (Added by editor); software read it from the article (AI extracted, with
 * a confidence band when one was stored).
 */
export function TrustLabel({ round }: { round: FundingRoundRow }) {
  if (round.verified) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success"
        title="A Bharat Hunt reviewer checked this record against its source"
      >
        <BadgeCheck className="size-3.5" aria-hidden="true" />
        Verified
      </span>
    );
  }

  if (round.extraction_method === "manual") {
    return (
      <span
        className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted"
        title="Entered by a Bharat Hunt editor from the source report; not independently verified"
      >
        Added by editor
      </span>
    );
  }

  const band = confidenceBand(round.confidence_score);
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted"
      title={
        "Extracted automatically from the source article and not checked by a person. Open the source before relying on it." +
        (band ? ` Extraction confidence: ${band}.` : "")
      }
    >
      <Sparkles className="size-3 text-muted-soft" aria-hidden="true" />
      AI extracted
      {band && band !== "high" && <span className="text-muted-soft">· {band} confidence</span>}
    </span>
  );
}

function InvestorLine({
  lead,
  others,
  hidden,
}: {
  lead: string | null;
  others: string[];
  hidden: number;
}) {
  if (!lead && others.length === 0) {
    return <p className="text-xs text-muted-soft">Investors not disclosed</p>;
  }

  return (
    <dl className="flex flex-col gap-1 text-sm sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-5">
      {lead && (
        <div className="flex min-w-0 items-baseline gap-2">
          <dt className="shrink-0 text-xs text-muted">Led by</dt>
          <dd className="min-w-0 truncate">
            <InvestorLink name={lead} strong />
          </dd>
        </div>
      )}
      {others.length > 0 && (
        <div className="flex min-w-0 items-baseline gap-2">
          <dt className="shrink-0 text-xs text-muted">{lead ? "With" : "Investors"}</dt>
          <dd className="min-w-0 text-body">
            {others.map((name, index) => (
              <span key={name}>
                {index > 0 && <span className="text-muted-soft">, </span>}
                <InvestorLink name={name} />
              </span>
            ))}
            {hidden > 0 && <span className="text-muted"> +{hidden} more</span>}
          </dd>
        </div>
      )}
    </dl>
  );
}

function InvestorLink({ name, strong = false }: { name: string; strong?: boolean }) {
  return (
    <Link
      href={investorHref(name)}
      className={cn(
        "transition-colors hover:text-primary",
        strong ? "font-semibold text-ink" : "text-body",
      )}
    >
      {name}
    </Link>
  );
}

/**
 * Source line. Never optional, never a bare domain when a name exists, and
 * when other outlets reported the same round they are listed — the round was
 * merged from their articles, so their attribution travels with it.
 */
function Attribution({ round }: { round: FundingRoundRow }) {
  const favicon = sourceFaviconUrl(round.source_url);
  const published = round.source_published_at ?? round.announcement_date;
  // `?? []`: a feed page cached in Redis before coverage existed has no field.
  const coverage = round.coverage ?? [];

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          {favicon && (
            /* eslint-disable-next-line @next/next/no-img-element -- a remote
               favicon from an arbitrary publisher. */
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
          <span>
            Source: <span className="font-medium text-body">{round.source_name}</span>
          </span>
          <span aria-hidden="true">·</span>
          <time dateTime={published} title={formatDay(published) ?? undefined}>
            {relativeTime(published) ?? formatDay(published)}
          </time>
        </div>

        <a
          href={round.source_url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="inline-flex min-h-8 shrink-0 items-center gap-1 text-xs font-semibold text-primary transition-colors pointer-coarse:min-h-11 hover:text-primary-active"
        >
          Read full story
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </a>
      </div>

      {coverage.length > 0 && (
        <details className="group/sources text-xs">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 font-medium text-body transition-colors marker:hidden hover:text-primary pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden">
            {coverage.length + 1} sources reporting this round
            <ChevronDown
              className="size-3.5 transition-transform group-open/sources:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <ul className="mt-2 flex flex-col gap-1.5 rounded-lg bg-secondary-bg/60 p-3">
            {coverage.map((item) => (
              <li key={item.url} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-body">
                  {item.source_name || hostOf(item.url)}
                  {item.published_at && (
                    <span className="text-muted-soft"> · {formatDay(item.published_at)}</span>
                  )}
                </span>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex items-center gap-0.5 font-semibold text-primary hover:text-primary-active"
                >
                  Read
                  <ArrowUpRight className="size-3" aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function MetaChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md bg-secondary-bg px-2 py-0.5 text-xs font-medium text-body">
      {children}
    </span>
  );
}
