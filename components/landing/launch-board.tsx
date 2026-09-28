import Link from "next/link";
import { ArrowRight, ChevronUp, Crown, MapPin, MessageSquare, Trophy } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatDayMonth, formatLaunchDay } from "@/lib/format-date";
import { indiaStateName } from "@/lib/india-states";
import type { BoardScope } from "@/lib/home-feed";
import { ProductLogo } from "@/components/products/product-logo";
import { Numeric } from "@/components/ui/typography";
import { FadeIn } from "@/components/ui/motion";
import { SECTION_SHELL } from "@/components/landing/section-header";
import type { LaunchCardProduct } from "@/components/landing/launch-card";

export type BoardProduct = LaunchCardProduct & {
  rank: number;
  comment_count?: number | null;
};

export type HuntOfTheDay = LaunchCardProduct & {
  comment_count?: number | null;
  pricing_type?: string | null;
};

/** The board heading, written from the window it was actually built from. */
function boardCopy(scope: BoardScope): { title: string; subtitle: string } {
  switch (scope.kind) {
    case "today":
      return {
        title: "Today’s Top Launches",
        subtitle: "Ranked by community upvotes. The board resets at midnight IST.",
      };
    case "day":
      return {
        title: `Top Launches · ${formatDayMonth(`${scope.day}T12:00:00+05:30`) ?? scope.day}`,
        subtitle: "The most recent launch day, ranked by community upvotes.",
      };
    case "week":
      return {
        title: "This Week’s Top Launches",
        subtitle: "Launches from the last seven days, ranked by community upvotes.",
      };
    case "all-time":
      return {
        title: "Most Upvoted Launches",
        subtitle: "The community’s all-time favourites.",
      };
  }
}

/**
 * Hunt of the Day beside the daily board — the editorial pick and the ranking
 * that produced it, in one glance.
 *
 * The pick is not chosen here and never at random: it is `getLeadingLaunch`,
 * the launch leading the current IST day (or the most recent day that had
 * launches), cached under that day's key — so it is the same for everyone and
 * only changes when the board does.
 */
export function LaunchBoard({
  hunt,
  huntDay,
  board,
  scope,
}: {
  hunt: HuntOfTheDay | null;
  /** IST `YYYY-MM-DD` the pick led, or null when it is the all-time stand-in. */
  huntDay: string | null;
  board: BoardProduct[];
  scope: BoardScope;
}) {
  if (!hunt && board.length === 0) return null;
  const copy = boardCopy(scope);

  return (
    <section className={`${SECTION_SHELL} py-6 md:py-10`}>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        {hunt && <HuntCard product={hunt} day={huntDay} />}

        {board.length > 0 && (
          <FadeIn className="flex flex-col rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight text-ink sm:text-2xl">
                  <Trophy className="size-5 text-primary" aria-hidden="true" />
                  {copy.title}
                </h2>
                <p className="text-sm text-body">{copy.subtitle}</p>
              </div>
            </div>

            <ol className="mt-5 flex flex-col divide-y divide-border">
              {board.map((product) => (
                <li key={product.id}>
                  <Link
                    href={`/products/${product.slug}`}
                    className="group -mx-2 flex items-center gap-3 rounded-2xl px-2 py-3 transition-colors hover:bg-secondary-bg/60"
                  >
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                        product.rank === 1
                          ? "bg-[linear-gradient(135deg,#ff6b1a,#ff8a3d)] text-white"
                          : "bg-secondary-bg text-body",
                      )}
                    >
                      <span className="sr-only">Rank </span>
                      {product.rank}
                    </span>
                    <ProductLogo
                      src={product.hero_image_url}
                      name={product.name}
                      size="sm"
                      loading="lazy"
                      className="size-11"
                    />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-semibold text-ink group-hover:text-primary">
                        {product.name}
                      </span>
                      <span className="truncate text-sm text-body">{product.tagline}</span>
                      <span className="mt-0.5 truncate text-xs text-muted">{product.category}</span>
                    </div>
                    <span className="flex shrink-0 flex-col items-center rounded-xl border border-border px-2.5 py-1 text-ink transition-colors group-hover:border-primary/40">
                      <ChevronUp className="size-4 text-primary" aria-hidden="true" />
                      <Numeric className="text-sm font-bold">{product.upvote_count ?? 0}</Numeric>
                      <span className="sr-only">upvotes</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>

            <Link
              href="/marketplace?sort=top-rated"
              className="mt-4 inline-flex items-center gap-1 self-start text-sm font-semibold text-primary transition-colors hover:text-primary-active"
            >
              View all launches
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </FadeIn>
        )}
      </div>
    </section>
  );
}

const PRICING_LABEL: Record<string, string> = { free: "Free", freemium: "Freemium", paid: "Paid" };

function HuntCard({ product, day }: { product: HuntOfTheDay; day: string | null }) {
  const dayLabel = day ? formatLaunchDay(day) : null;
  const upvotes = product.upvote_count ?? 0;
  const comments = product.comment_count ?? 0;
  const state = indiaStateName(product.launch_state);
  const launched = formatDayMonth(product.published_at);

  /*
   * "Why it's interesting", from facts only. There is no editorial blurb in the
   * database and inventing one per product would be exactly the fabricated
   * praise this page refuses to print — so the reasons are the signals the
   * community actually produced, each one checkable on the product page.
   */
  const reasons = [
    upvotes > 0 &&
      (dayLabel
        ? `Leading ${dayLabel === "today" ? "today’s" : `${dayLabel}’s`} board with ${upvotes} ${upvotes === 1 ? "upvote" : "upvotes"}`
        : `${upvotes} community ${upvotes === 1 ? "upvote" : "upvotes"}`),
    comments > 0 && `${comments} ${comments === 1 ? "comment" : "comments"} from the community`,
    state && `Built in ${state}`,
    product.pricing_type &&
      PRICING_LABEL[product.pricing_type] &&
      `${PRICING_LABEL[product.pricing_type]} to try`,
  ].filter((reason): reason is string => Boolean(reason));

  return (
    <article className="relative flex flex-col overflow-hidden rounded-3xl bg-surface-dark p-6 text-on-dark shadow-[0_30px_70px_-30px_rgba(23,20,15,0.5)] sm:p-8">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_80%_at_100%_0%,rgba(255,107,26,0.35),transparent_60%)]"
      />
      <div className="relative flex flex-1 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-bold tracking-wide text-white uppercase">
            <Crown className="size-3.5" aria-hidden="true" />
            Hunt of the Day
          </span>
          {dayLabel && (
            <span className="text-xs font-medium text-on-dark-soft">
              {dayLabel === "today" ? "Today" : dayLabel === "yesterday" ? "Yesterday" : dayLabel}
            </span>
          )}
        </div>

        <div className="mt-6 flex items-center gap-4">
          <ProductLogo src={product.hero_image_url} name={product.name} size="lg" className="size-16 sm:size-20" />
          <div className="min-w-0">
            <h2 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">{product.name}</h2>
            <p className="mt-1 truncate text-sm text-on-dark-soft">
              {product.category}
              {product.creator?.display_name ? <> · by {product.creator.display_name}</> : null}
            </p>
          </div>
        </div>

        <p className="mt-5 line-clamp-3 text-lg leading-relaxed text-white/90">{product.tagline}</p>

        {reasons.length > 0 && (
          <div className="mt-6">
            <h3 className="text-xs font-semibold tracking-wider text-on-dark-soft uppercase">
              Why it&rsquo;s interesting
            </h3>
            <ul className="mt-2.5 flex flex-col gap-2 text-sm text-white/85">
              {reasons.map((reason) => (
                <li key={reason} className="flex items-start gap-2">
                  <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                  {reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-on-dark-soft">
          <span className="inline-flex items-center gap-1.5">
            <ChevronUp className="size-4 text-primary" aria-hidden="true" />
            <Numeric className="font-semibold text-on-dark">{upvotes}</Numeric> upvotes
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MessageSquare className="size-4 text-primary" aria-hidden="true" />
            <Numeric className="font-semibold text-on-dark">{comments}</Numeric> comments
          </span>
          {state && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-4 text-primary" aria-hidden="true" />
              {state}
            </span>
          )}
          {launched && <span>Launched {launched}</span>}
        </div>

        <Link
          href={`/products/${product.slug}`}
          className="btn-gradient mt-8 flex h-12 w-full items-center justify-center gap-2 rounded-2xl px-4 text-base font-semibold sm:w-fit sm:self-start sm:px-6"
        >
          <span className="min-w-0 truncate">View {product.name}</span>
          <ArrowRight className="size-5 shrink-0" aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}
