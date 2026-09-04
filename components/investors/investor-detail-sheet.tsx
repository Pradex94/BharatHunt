"use client";

/* Design system: design.md (Bharat Hunt — orange) · /investors
 *
 * The full investor profile, in the app's existing side panel.
 *
 * A Sheet rather than a route, and the reason is the product rather than
 * convenience: `/investors/[id]` would be a URL per investor, which is a URL a
 * crawler indexes, a link someone pastes, and a page whose access check has to
 * be re-derived from a path parameter. The dataset is the thing being sold; it
 * should have exactly one entrance. The panel also happens to be the better
 * mobile pattern — full-width, dismissible, no navigation to lose your filters
 * to — which is why the marketplace filters already use it.
 *
 * Renders only the fields that are actually present. A profile padded out with
 * "—" for every column an admin has not filled in looks like a broken import;
 * one that shows six real rows looks curated. That is also the honest rendering
 * of a directory whose rows are unevenly complete.
 */

import { ExternalLink, Globe, Mail, MapPin, Phone, Wallet } from "lucide-react";

import { cn } from "@/lib/utils";
import { ProductLogo } from "@/components/products/product-logo";
// lucide-react has no LinkedIn glyph (brand marks were removed from the set),
// and this repo already carries its own for the share menu. Reused rather than
// re-drawn so both places render the same mark.
import { LinkedInIcon } from "@/components/products/social-icons";
import { Badge } from "@/components/ui/badge";
import { Numeric } from "@/components/ui/typography";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  formatChequeRange,
  isFullInvestor,
  type InvestorFull,
  type InvestorPreview,
} from "@/lib/investors";

/** A labelled block. Renders nothing when there is nothing to say. */
function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  if (children === null || children === undefined || children === false) return null;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-[11px] font-medium tracking-[0.08em] text-muted uppercase">
        {label}
      </span>
      <div className="text-sm leading-relaxed text-body">{children}</div>
    </div>
  );
}

function TagList({ values, tone }: { values: string[]; tone?: "primary" }) {
  if (values.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((value) => (
        <Badge
          key={value}
          variant="outline"
          /* See the note in investor-card.tsx: badges are `whitespace-nowrap`,
             and portfolio entries are the longest tags in the system. */
          className={cn(
            "h-6 max-w-full px-2",
            tone === "primary" && "border-primary/25 text-primary",
          )}
        >
          {value}
        </Badge>
      ))}
    </div>
  );
}

/**
 * An outbound link to an investor's own site or profile.
 *
 * `rel="noopener noreferrer nofollow"`. The first two are the security default
 * for `target="_blank"`; `nofollow` is the honest one — these URLs are entered
 * by an admin into a paid directory, and passing link equity to every one of
 * them is precisely the pattern search engines treat as a paid link scheme.
 */
function OutboundLink({
  href,
  children,
  icon: Icon,
}: {
  href: string;
  children: React.ReactNode;
  /* `SVGProps` rather than a hand-written shape: the two icon sources have
     different prop types (lucide's own vs. this repo's plain `<svg>` helpers),
     and the SVG element props are the surface they genuinely share. */
  icon: (props: React.SVGProps<SVGSVGElement>) => React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="inline-flex min-h-9 items-center gap-2 text-sm font-medium text-primary transition-colors hover:text-primary-active"
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="break-all">{children}</span>
      <ExternalLink className="size-3 shrink-0 opacity-60" aria-hidden="true" />
    </a>
  );
}

export function InvestorDetailSheet({
  investor,
  onClose,
}: {
  /** The open investor, or null when the panel is closed. */
  investor: InvestorPreview | InvestorFull | null;
  onClose: () => void;
}) {
  // Base UI's Dialog controls open state; `investor` is both the flag and the
  // content, so a close hands back null and the panel empties as it leaves.
  const open = investor !== null;
  const full = investor && isFullInvestor(investor) ? investor : null;
  const cheque = investor
    ? formatChequeRange(investor.checkSizeMinInr, investor.checkSizeMaxInr)
    : null;

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg">
        {investor && (
          <>
            <SheetHeader className="gap-3 pr-12">
              <div className="flex items-start gap-3">
                <ProductLogo src={investor.logoUrl} name={investor.name} size="lg" />
                <div className="min-w-0 flex-1">
                  <SheetTitle className="text-lg leading-snug font-bold break-words text-ink">
                    {investor.name}
                  </SheetTitle>
                  {investor.title && (
                    <SheetDescription className="mt-0.5">{investor.title}</SheetDescription>
                  )}
                  {investor.firmName && (
                    <p className="mt-0.5 text-sm text-muted">{investor.firmName}</p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {investor.investorType && (
                      <Badge variant="secondary" className="h-5 px-2 text-[11px]">
                        {investor.investorType}
                      </Badge>
                    )}
                    {investor.isSample && (
                      <Badge variant="outline" className="h-5 px-2 text-[11px] text-muted">
                        Sample record
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </SheetHeader>

            <div className="flex flex-col gap-6 px-4 pb-8">
              {(investor.location || investor.country) && (
                <Field label="Location">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
                    {/* `location` has the country stripped at import, so the two
                        are recombined here rather than stored redundantly. */}
                    {[investor.location, investor.country].filter(Boolean).join(", ")}
                  </span>
                </Field>
              )}

              {investor.stages.length > 0 && (
                <Field label="Investment stage">
                  <TagList values={investor.stages} tone="primary" />
                </Field>
              )}

              {investor.sectors.length > 0 && (
                <Field label="Sector focus">
                  <TagList values={investor.sectors} />
                </Field>
              )}

              {cheque && (
                <Field label="Cheque size">
                  <span className="flex items-center gap-1.5">
                    <Wallet className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
                    <Numeric className="font-medium text-ink">{cheque}</Numeric>
                  </span>
                </Field>
              )}

              {investor.thesis && <Field label="Investment thesis">{investor.thesis}</Field>}

              {investor.portfolio.length > 0 && (
                <Field label="Portfolio">
                  <TagList values={investor.portfolio} />
                </Field>
              )}

              {/*
                The paid half. `full` is non-null only when the server fetched
                the contact columns, which it does only for an entitled caller —
                so this block cannot render for a free-preview row even if a
                future caller passes one in by mistake.
              */}
              {full ? (
                (full.website || full.email || full.phone || full.linkedin || full.contactDetails) && (
                  <div className="flex flex-col gap-3 rounded-2xl border border-border bg-secondary-bg/60 p-4">
                    <span className="text-[11px] font-medium tracking-[0.08em] text-muted uppercase">
                      Contact
                    </span>
                    {full.website && (
                      <OutboundLink href={full.website} icon={Globe}>
                        {full.website.replace(/^https?:\/\//, "")}
                      </OutboundLink>
                    )}
                    {full.email && (
                      <OutboundLink href={`mailto:${full.email}`} icon={Mail}>
                        {full.email}
                      </OutboundLink>
                    )}
                    {full.phone && (
                      /* `tel:` rather than plain text, so a tap dials on a
                         phone. The number is rendered exactly as recorded —
                         reformatting international numbers into one canonical
                         shape corrupts the ones that do not fit the guess. */
                      <OutboundLink href={`tel:${full.phone.replace(/\s+/g, "")}`} icon={Phone}>
                        {full.phone}
                      </OutboundLink>
                    )}
                    {full.linkedin && (
                      <OutboundLink href={full.linkedin} icon={LinkedInIcon}>
                        LinkedIn profile
                      </OutboundLink>
                    )}
                    {full.contactDetails && (
                      <p className="text-sm leading-relaxed text-body">{full.contactDetails}</p>
                    )}
                  </div>
                )
              ) : (
                <div className="rounded-2xl border border-dashed border-border bg-secondary-bg/60 p-4">
                  <p className="text-sm text-body">
                    Website, email and other contact details for this investor are part of the
                    full directory.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
