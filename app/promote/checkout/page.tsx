/* Design system: design.md (Bharat Hunt — orange) · Promote → checkout
 *
 * The paid half of /promote. A dedicated route rather than a section on the
 * marketing page, for two reasons:
 *
 *   1. /promote is prerendered (`app/page.tsx` documents what that cost to get
 *      right). Every read here is per-person — the maker's own products, their
 *      promotion history — so putting them on that page would make it dynamic
 *      and undo the work.
 *   2. Paying deserves one screen with one thing on it. The auction board is a
 *      preview of a feature that does not take money; this is the page that
 *      does, and mixing them is how a customer ends up unsure which one just
 *      charged them.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { ArrowLeft, Clock, ReceiptText, ShieldCheck, Sparkles } from "lucide-react";
import type { Metadata } from "next";

import { Container } from "@/components/ui/container";
import { H1, H3, Lead, Numeric } from "@/components/ui/typography";
import { buttonVariants } from "@/components/ui/button";
import { Breadcrumbs, type Crumb } from "@/components/seo/breadcrumbs";
import { PromotionCheckout } from "@/components/promote/promotion-checkout";
import {
  getPromotableProducts,
  getPromotionPackages,
  getUserPromotions,
  type PromotionHistoryRow,
} from "@/services/promotions";
import { formatPaise } from "@/lib/promotions";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Buy a promotion",
  description: "Promote your product on Bharat Hunt with a fixed-price placement.",
  // A personalised, authenticated page. Nothing here belongs in an index, and a
  // canonical would point a crawler at a login redirect.
  robots: { index: false, follow: false },
};

// Reads the signed-in identity and their rows — never prerender.
export const dynamic = "force-dynamic";

const CRUMBS: Crumb[] = [
  { name: "Home", path: "/" },
  { name: "Promote", path: "/promote" },
  { name: "Checkout", path: "/promote/checkout" },
];

const ASSURANCES = [
  {
    Icon: ShieldCheck,
    title: "Payments handled by Dodo Payments",
    body: "Card, UPI, netbanking and wallet details are collected by Dodo Payments on their own checkout. Bharat Hunt never sees or stores them, and Dodo is the merchant of record, so it issues the tax invoice.",
  },
  {
    Icon: Clock,
    title: "A fixed window, priced up front",
    body: "You pay a stated amount for a stated number of days. No auction, no surprise renewal, no charge you did not press a button for.",
  },
  {
    Icon: Sparkles,
    title: "Placement is labelled, rankings are not for sale",
    body: "A promoted slot carries a visible “Promoted” label and sits alongside the organic listing. Upvotes and comments are untouched.",
  },
];

const STATUS_LABEL: Record<string, string> = {
  pending_payment: "awaiting payment",
  active: "active",
  expired: "ended",
  cancelled: "cancelled",
  refunded: "refunded",
};

const STATUS_BADGE: Record<string, string> = {
  active: "bg-success/10 text-success",
  pending_payment: "bg-secondary-bg text-muted",
  expired: "bg-secondary-bg text-muted",
  cancelled: "bg-secondary-bg text-muted",
  refunded: "bg-amber-100 text-amber-700",
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Where Dodo Payments sends the customer back to.
 *
 * Read on the server and handed to the client component as plain props rather
 * than being pulled out of `useSearchParams()` there, so the confirmation starts
 * on the first render instead of after a hydration round trip -- this is the
 * screen someone stares at immediately after paying.
 *
 * Neither value is trusted. `status` only decides which screen to draw, and
 * `promotion` is a pointer the server action looks up among the caller's own
 * rows before asking Dodo what actually happened.
 */
function readReturn(params: Record<string, string | string[] | undefined>): {
  status: "success" | "cancelled" | null;
  promotionId: string | null;
} {
  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;

  const status = first(params.status);
  const promotion = first(params.promotion);

  return {
    status: status === "success" || status === "cancelled" ? status : null,
    // Shape-checked here so a crafted query string never reaches an action as
    // anything but a uuid-looking string.
    promotionId:
      typeof promotion === "string" && /^[0-9a-f-]{36}$/i.test(promotion) ? promotion : null,
  };
}

export default async function PromoteCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { userId } = await auth();
  if (!userId) {
    redirect("/login");
  }

  const [params, packages, products, history] = await Promise.all([
    searchParams,
    getPromotionPackages(),
    getPromotableProducts(userId),
    getUserPromotions(userId),
  ]);

  const ret = readReturn(params);

  return (
    <div className="flex flex-col">
      <section className="border-b border-border bg-secondary-bg/40">
        <Container className="flex flex-col gap-5 py-10 md:py-14">
          <Breadcrumbs items={CRUMBS} />

          <span className="flex items-center gap-3 text-xs font-semibold tracking-[0.22em] text-primary uppercase">
            <span className="h-px w-8 bg-primary" />
            Promote your product
          </span>

          <H1 className="max-w-[18ch] text-balance">Buy a promotion slot.</H1>
          <Lead className="max-w-2xl">
            Put a published product at the top of the pages people are already browsing, for a
            fixed price and a fixed window.
          </Lead>
        </Container>
      </section>

      <section>
        <Container className="grid gap-10 py-12 md:py-16 lg:grid-cols-[1.25fr_0.75fr] lg:gap-14">
          <div className="min-w-0">
            <PromotionCheckout packages={packages} products={products} ret={ret} />

            {history.length > 0 && <PromotionHistory rows={history} />}
          </div>

          <aside className="flex min-w-0 flex-col gap-4">
            {ASSURANCES.map(({ Icon, title, body }) => (
              <div key={title} className="flex gap-4 rounded-2xl border border-border bg-card p-5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary-bg text-primary">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <span className="flex flex-col gap-1.5">
                  <span className="text-sm font-bold text-ink">{title}</span>
                  <span className="text-sm leading-relaxed text-body">{body}</span>
                </span>
              </div>
            ))}

            <Link
              href="/promote"
              className={buttonVariants({ variant: "outline", className: "mt-2 w-full" })}
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              How promotion works
            </Link>
          </aside>
        </Container>
      </section>
    </div>
  );
}

/**
 * The maker's own record of what they have bought. Deliberately shows
 * `pending_payment` rows too: a purchase whose payment failed is exactly what
 * someone comes back to check on, and hiding it would read as the money having
 * vanished.
 */
function PromotionHistory({ rows }: { rows: PromotionHistoryRow[] }) {
  return (
    <div className="mt-8 rounded-3xl border border-border bg-card p-5 sm:p-7">
      <div className="flex items-center gap-2.5">
        <ReceiptText className="size-4 text-muted" aria-hidden="true" />
        <H3 className="text-lg sm:text-xl">Your promotions</H3>
      </div>

      <ul className="mt-4 flex flex-col divide-y divide-border">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3.5">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="truncate text-sm font-semibold text-ink">{row.productName}</span>
              <span className="text-xs text-muted">
                {row.packageName}
                {row.endsAt ? ` · ends ${formatDate(row.endsAt)}` : ""}
              </span>
              {row.paymentReference && (
                <span className="font-mono text-[11px] break-all text-muted">
                  {row.paymentReference}
                </span>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-3">
              <Numeric className="text-sm font-semibold text-ink">
                {formatPaise(row.amountPaise)}
              </Numeric>
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-[0.08em] uppercase",
                  STATUS_BADGE[row.status] ?? "bg-secondary-bg text-muted",
                )}
              >
                {STATUS_LABEL[row.status] ?? row.status}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
