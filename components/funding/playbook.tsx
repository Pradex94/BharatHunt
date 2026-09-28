import Link from "next/link";
import { ArrowRight, Clock } from "lucide-react";

import { SectionHeading } from "@/components/funding/trends";
import { FUNDING_GUIDES } from "@/lib/funding/guides";

/**
 * "Founder Fundraising Playbook" — the guides, as a resource shelf.
 *
 * Each card carries what a founder needs to decide whether to open it:
 * category, title, one-line description, reading time. Six on /funding, the
 * rest one click away on /funding/guides.
 */
export function FundraisingPlaybook({ limit = 6 }: { limit?: number }) {
  return (
    <section aria-labelledby="funding-guides" className="flex flex-col gap-6">
      <SectionHeading
        id="funding-guides"
        eyebrow="Guides"
        title="Founder Fundraising Playbook"
        subtitle="Practical guides for every stage of your fundraising journey."
        action={
          <Link
            href="/funding/guides"
            className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:text-primary-active"
          >
            All {FUNDING_GUIDES.length} guides
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FUNDING_GUIDES.slice(0, limit).map((guide) => (
          <Link
            key={guide.slug}
            href={`/funding/guides/${guide.slug}`}
            className="group/guide flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 transition-[border-color,box-shadow] duration-200 hover:border-primary/30 hover:shadow-soft"
          >
            <div className="flex items-center justify-between gap-3 text-[11px]">
              <span className="rounded-full bg-secondary-bg px-2 py-0.5 font-semibold text-primary">
                {guide.category}
              </span>
              <span className="inline-flex items-center gap-1 text-muted">
                <Clock className="size-3" aria-hidden="true" />
                {guide.readingMinutes} min read
              </span>
            </div>
            <h3 className="text-base leading-snug font-bold tracking-tight text-ink group-hover/guide:text-primary">
              {guide.title}
            </h3>
            <p className="line-clamp-3 flex-1 text-sm leading-relaxed text-body">{guide.excerpt}</p>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
              Read guide
              <ArrowRight
                className="size-3.5 transition-transform group-hover/guide:translate-x-0.5"
                aria-hidden="true"
              />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
