"use client";

/* Design system: design.md (Bharat Hunt — orange) · /promote/checkout
 *
 * The real payment card. Everything the demo bid panel simulates, this does for
 * money.
 *
 * ── What changed when Razorpay became Dodo Payments ──────────────────────────
 * Razorpay Standard Checkout opened a modal over this page and handed the
 * payment back to a JavaScript callback. Dodo's hosted checkout is a page on
 * Dodo's own origin: the customer leaves, pays, and comes back to
 * `/promote/checkout?status=success&promotion=<id>`. So this component no longer
 * loads a third-party script, and there is no in-page `paying` state to be
 * stranded in — the browser is simply gone for that part of the flow.
 *
 * What survives the change is the rule that mattered: **arriving back with
 * `status=success` is not success.** It is a claim the URL makes, and the server
 * has to ask Dodo. `confirm` below is that call, and nothing renders a paid
 * screen without it.
 *
 * ── The state machine ────────────────────────────────────────────────────────
 *   idle → creating → (navigates away to Dodo)
 *   returning → confirming → paid
 *                    ↓ ↓
 *                  idle  pending
 *
 * `pending` is new and is not a failure. Dodo can return a customer whose UPI
 * mandate or 3DS step has not finished; telling them the payment failed would
 * send them to pay twice.
 *
 * ── Double-submit ────────────────────────────────────────────────────────────
 * Guarded twice, because the two guards fail differently. `disabled` on the
 * button stops the pointer, but React batches state updates, so a fast double
 * click can dispatch two handlers before the first re-render lands. The
 * `inFlight` ref is synchronous and closes that window. Neither alone is enough.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  Clock,
  Loader2,
  Lock,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";
import { Button, buttonVariants } from "@/components/ui/button";
import { H2, H3, Numeric } from "@/components/ui/typography";
import {
  formatDuration,
  formatPaise,
  PAYMENT_CANCELLED_MESSAGE,
  type PromotableProduct,
  type PromotionPackage,
  type PromotionSummary,
} from "@/lib/promotions";
import {
  confirmPromotionPayment,
  createPromotionCheckout,
  recordPromotionCheckoutCancelled,
} from "@/lib/actions/promotions";

type Status = "idle" | "creating" | "confirming" | "pending" | "paid";

type Props = {
  packages: PromotionPackage[];
  products: PromotableProduct[];
  /**
   * What Dodo sent us back to, read from the URL on the server.
   *
   * A pointer, never a credential. `promotionId` is looked up among the caller's
   * own rows and the outcome comes from Dodo's API; a customer who edits it can
   * at most point at a promotion that is not theirs and be told so.
   */
  ret: { status: "success" | "cancelled" | null; promotionId: string | null };
};

export function PromotionCheckout({ packages, products, ret }: Props) {
  const headingId = useId();
  const errorId = useId();
  const router = useRouter();

  const promotable = products.filter((product) => !product.hasActivePromotion);

  const [packageId, setPackageId] = useState(() => packages[0]?.id ?? "");
  const [productId, setProductId] = useState(() => promotable[0]?.id ?? "");
  /* A return from Dodo starts mid-flow rather than at `idle`, so the customer
   * never sees the empty form flash before the confirmation resolves. */
  const [status, setStatus] = useState<Status>(() =>
    ret.status === "success" && ret.promotionId ? "confirming" : "idle",
  );
  const [error, setError] = useState<string | null>(
    ret.status === "cancelled" ? PAYMENT_CANCELLED_MESSAGE : null,
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [summary, setSummary] = useState<PromotionSummary | null>(null);

  /*
   * Synchronous double-submit guard, and the "is this component still mounted"
   * flag. A payment round trip outlives a navigation easily, and setting state
   * after unmount is both a warning and a leak.
   */
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const selectedPackage = packages.find((entry) => entry.id === packageId) ?? null;
  const selectedProduct = promotable.find((entry) => entry.id === productId) ?? null;
  const busy = status === "creating" || status === "confirming";

  /*
   * Confirm a return from Dodo.
   *
   * Guarded on "is one already running" rather than "has one ever run", because
   * this is called from two places with different needs: the effect below, which
   * must fire exactly once on arrival, and the Check again button on the pending
   * screen, which exists precisely to ask a second time. A once-ever guard would
   * make that button do nothing.
   */
  const confirming = useRef(false);

  const confirm = useCallback(async (promotionId: string) => {
    if (confirming.current) return;
    confirming.current = true;

    setStatus("confirming");
    try {
      const result = await confirmPromotionPayment({ promotionId });
      if (!mounted.current) return;

      if (!result.ok) {
        // Never a success screen on a failed confirmation, however convincing
        // the URL looked.
        trackEvent("promote_checkout_unverified", { location: "promote_checkout" });
        setStatus("idle");
        setError(result.error);
        return;
      }

      if (result.state === "pending") {
        trackEvent("promote_checkout_pending", { location: "promote_checkout" });
        setStatus("pending");
        setNotice(result.message);
        setError(null);
        return;
      }

      trackEvent("promote_checkout_paid", { location: "promote_checkout" });
      setSummary(result.summary);
      setStatus("paid");
      setError(null);
      /* The history list below this card, and the dashboard, both changed. */
      router.refresh();
    } finally {
      confirming.current = false;
    }
  }, [router]);

  /*
   * The arrival. An effect rather than a click, because the customer's "action"
   * was navigating back — there is nothing for them to press. The `arrived` ref
   * keeps it to once per promotion even under React's development double-invoke
   * of effects, which would otherwise fire two calls at the rate limiter for
   * every return.
   */
  const arrived = useRef<string | null>(null);
  useEffect(() => {
    const promotionId = ret.promotionId;
    if (ret.status !== "success" || !promotionId) return;
    if (arrived.current === promotionId) return;
    arrived.current = promotionId;

    void confirm(promotionId);
  }, [confirm, ret.promotionId, ret.status]);

  /* A cancelled return is recorded so the maker's own history says so rather
   * than leaving a purchase that reads as still awaiting payment forever. */
  const cancelled = useRef<string | null>(null);
  useEffect(() => {
    const promotionId = ret.promotionId;
    if (ret.status !== "cancelled" || !promotionId) return;
    if (cancelled.current === promotionId) return;
    cancelled.current = promotionId;

    trackEvent("promote_checkout_dismissed", { location: "promote_checkout" });
    void recordPromotionCheckoutCancelled({ promotionId });
  }, [ret.promotionId, ret.status]);

  const pay = useCallback(async () => {
    // Guard one: synchronous, closes the batching window `disabled` leaves open.
    if (inFlight.current) return;
    if (!selectedPackage || !selectedProduct) {
      setError("Choose a product and a promotion package.");
      return;
    }

    inFlight.current = true;
    setError(null);
    setNotice(null);
    setStatus("creating");

    trackEvent("promote_checkout_start", {
      location: "promote_checkout",
      package_id: selectedPackage.id,
    });

    // The amount is not sent. Only these two ids are, and the server prices them
    // against Dodo's own catalogue before opening anything.
    const result = await createPromotionCheckout({
      packageId: selectedPackage.id,
      productId: selectedProduct.id,
    });

    if (!mounted.current) return;

    if (!result.ok) {
      inFlight.current = false;
      setStatus("idle");
      setError(result.error);
      return;
    }

    /*
     * A full navigation, not `router.push`. The destination is Dodo's origin, so
     * the client router cannot handle it — and the guard is deliberately left
     * closed: this tab is on its way out, and re-arming the Pay button during
     * the handover is how a second checkout gets opened for one purchase.
     */
    window.location.assign(result.checkoutUrl);
  }, [selectedPackage, selectedProduct]);

  // ── Success ────────────────────────────────────────────────────────────
  if (status === "paid" && summary) {
    return <PaidScreen summary={summary} />;
  }

  // ── Confirming a return from Dodo ──────────────────────────────────────
  if (status === "confirming") {
    return (
      <div
        className="flex flex-col items-center gap-4 rounded-3xl border border-border bg-card p-10 text-center shadow-soft"
        aria-live="polite"
      >
        <Loader2 className="size-6 animate-spin text-primary" aria-hidden="true" />
        <H3 className="text-xl">Confirming your payment</H3>
        <p className="max-w-sm text-sm leading-relaxed text-body">
          Do not close this page or pay again — we are checking with Dodo Payments.
        </p>
      </div>
    );
  }

  // ── Paid, but not settled yet ──────────────────────────────────────────
  if (status === "pending") {
    return (
      <div className="rounded-3xl border border-border bg-card p-6 shadow-soft sm:p-8">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-secondary-bg text-primary">
          <Clock className="size-6" aria-hidden="true" />
        </span>
        <H2 className="mt-5 text-2xl sm:text-3xl">Payment in progress</H2>
        <p className="mt-2 text-body">{notice}</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button
            type="button"
            size="lg"
            onClick={() => ret.promotionId && void confirm(ret.promotionId)}
          >
            Check again
          </Button>
          <Link href="/dashboard" className={buttonVariants({ variant: "outline", size: "lg" })}>
            Go to your dashboard
          </Link>
        </div>
      </div>
    );
  }

  // ── Nothing to sell / nothing to promote ───────────────────────────────
  if (packages.length === 0) {
    return (
      <EmptyState
        title="Promotions are unavailable right now"
        body="We could not load the promotion packages. Please try again in a few minutes."
      />
    );
  }

  if (promotable.length === 0) {
    const allPromoted = products.length > 0;
    return (
      <EmptyState
        title={allPromoted ? "Every product is already promoted" : "Launch a product first"}
        body={
          allPromoted
            ? "Each of your published products already has a promotion running. You can buy the next slot once one ends."
            : "Promotion slots are bought for a published product. Submit a launch and, once it is approved, come back to promote it."
        }
        action={
          allPromoted
            ? { href: "/dashboard", label: "View your dashboard" }
            : { href: "/submit", label: "Submit a product" }
        }
      />
    );
  }

  return (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <H2 id={headingId} className="text-2xl sm:text-3xl">
            Choose your promotion
          </H2>
          <p className="mt-1.5 text-sm text-body">
            A fixed price for a fixed window. No auction, no bidding war.
          </p>
        </div>
        <span className="flex items-center gap-1.5 rounded-full border border-success/25 bg-success/[0.07] px-3 py-1 text-[11px] font-semibold tracking-[0.12em] text-success uppercase">
          <Lock className="size-3" aria-hidden="true" />
          Secure
        </span>
      </div>

      {/* ── Packages ──────────────────────────────────────────────────── */}
      <fieldset className="mt-6" disabled={busy}>
        <legend className="text-sm font-semibold text-ink">Promotion package</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {packages.map((entry) => {
            const checked = entry.id === packageId;
            return (
              <label
                key={entry.id}
                className={cn(
                  "relative flex cursor-pointer flex-col gap-2 rounded-2xl border p-4 transition-colors duration-200",
                  checked
                    ? "border-primary bg-primary/[0.06] shadow-sm"
                    : "border-border bg-card hover:border-primary/30 hover:bg-secondary-bg",
                  busy && "cursor-not-allowed opacity-60",
                )}
              >
                <input
                  type="radio"
                  name="promotion-package"
                  value={entry.id}
                  checked={checked}
                  onChange={() => {
                    setPackageId(entry.id);
                    setError(null);
                  }}
                  className="sr-only"
                />
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-ink">{entry.name}</span>
                  {checked && <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />}
                </span>
                <Numeric className="text-2xl font-bold text-ink">
                  {formatPaise(entry.amountPaise)}
                </Numeric>
                <span className="flex items-center gap-1.5 text-xs text-muted">
                  <Clock className="size-3.5" aria-hidden="true" />
                  {formatDuration(entry.durationDays)}
                </span>
                {entry.description && (
                  <span className="text-xs leading-relaxed text-body">{entry.description}</span>
                )}
              </label>
            );
          })}
        </div>
      </fieldset>

      {/* ── Product ───────────────────────────────────────────────────── */}
      <fieldset className="mt-6" disabled={busy}>
        <legend className="text-sm font-semibold text-ink">Product to promote</legend>
        <div className="mt-3 flex flex-col gap-2">
          {promotable.map((product) => {
            const checked = product.id === productId;
            return (
              <label
                key={product.id}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-xl border p-3.5 transition-colors duration-200",
                  checked
                    ? "border-primary bg-primary/[0.06]"
                    : "border-border bg-card hover:border-primary/30 hover:bg-secondary-bg",
                  busy && "cursor-not-allowed opacity-60",
                )}
              >
                <input
                  type="radio"
                  name="promotion-product"
                  value={product.id}
                  checked={checked}
                  onChange={() => {
                    setProductId(product.id);
                    setError(null);
                  }}
                  className="sr-only"
                />
                <span
                  aria-hidden
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-full border-2",
                    checked ? "border-primary" : "border-border",
                  )}
                >
                  {checked && <span className="size-2 rounded-full bg-primary" />}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-semibold text-ink">{product.name}</span>
                  <span className="text-xs text-muted">{product.category}</span>
                </span>
              </label>
            );
          })}
        </div>

        {products.some((product) => product.hasActivePromotion) && (
          <p className="mt-3 text-xs text-muted">
            Products with a promotion already running are not listed. You can buy the next slot
            once the current one ends.
          </p>
        )}
      </fieldset>

      {/* ── Pay ───────────────────────────────────────────────────────── */}
      <div className="mt-7 flex flex-col gap-4 border-t border-border pt-6">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-sm font-semibold text-ink">Total</span>
          <Numeric className="text-3xl font-bold text-ink">
            {selectedPackage ? formatPaise(selectedPackage.amountPaise) : "—"}
          </Numeric>
        </div>

        {/*
          Said before the button, not after the charge. Dodo Payments is the
          Merchant of Record, so it is the legal seller and adds the sales tax
          for the customer's country on top of this figure. A customer who reads
          "Total ₹4,999" and is then debited more has been surprised by us, not
          by their bank.
        */}
        <p className="-mt-2 text-xs text-muted">
          Tax is calculated by Dodo Payments at checkout and added to this amount.
        </p>

        <Button
          type="button"
          size="lg"
          onClick={() => void pay()}
          disabled={busy || !selectedPackage || !selectedProduct}
          aria-describedby={error ? errorId : undefined}
          className="h-12 w-full text-base"
        >
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Opening secure checkout…
            </>
          ) : (
            <>
              Pay {selectedPackage ? formatPaise(selectedPackage.amountPaise) : ""}
              <ArrowRight className="size-4" aria-hidden="true" />
            </>
          )}
        </Button>

        {/*
          Assertive rather than polite. A failed payment is the one message on
          this page that must interrupt whatever is being read.
        */}
        <div aria-live="assertive">
          {error && (
            <p
              id={errorId}
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-error/25 bg-error/[0.06] p-3.5 text-sm text-error"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}
        </div>

        <p className="flex items-center justify-center gap-2 text-center text-xs text-muted">
          <ShieldCheck className="size-3.5 shrink-0 text-success" aria-hidden="true" />
          Payments are processed by Dodo Payments. Bharat Hunt never sees your card, UPI or bank
          details.
        </p>
      </div>
    </div>
  );
}

/** Shown only after the server confirmed the payment with Dodo. */
function PaidScreen({ summary }: { summary: PromotionSummary }) {
  return (
    <div className="rounded-3xl border border-success/30 bg-success/[0.05] p-6 shadow-soft sm:p-8">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-success/15 text-success">
        <BadgeCheck className="size-6" aria-hidden="true" />
      </span>

      <H2 className="mt-5 text-2xl sm:text-3xl">Payment successful</H2>
      <p className="mt-2 text-body">
        <strong className="font-semibold text-ink">{summary.productName}</strong> is promoted with
        the {summary.packageName} placement. Your slot is active now.
      </p>

      <dl className="mt-6 grid gap-3 sm:grid-cols-2">
        {/*
          The charged total, not the quoted one, whenever Dodo told us what it
          actually took. This is the number on the customer's card statement, and
          a receipt that disagrees with a statement is a support ticket.
        */}
        <Fact
          label="Amount paid"
          value={
            summary.chargedAmount !== null
              ? formatCharged(summary.chargedAmount, summary.chargedCurrency)
              : formatPaise(summary.amountPaise)
          }
        />
        <Fact label="Payment reference" value={summary.reference} mono />
        {summary.chargedTax !== null && summary.chargedTax > 0 && (
          <Fact
            label="Of which tax"
            value={formatCharged(summary.chargedTax, summary.chargedCurrency)}
          />
        )}
        {summary.startsAt && (
          <Fact label="Starts" value={new Date(summary.startsAt).toLocaleString("en-IN")} />
        )}
        {summary.endsAt && (
          <Fact label="Ends" value={new Date(summary.endsAt).toLocaleString("en-IN")} />
        )}
      </dl>

      <p className="mt-5 text-xs leading-relaxed text-muted">
        Keep the payment reference for your records — quote it if you need to contact us about
        this promotion. Dodo Payments is the merchant of record for this purchase and emails you
        a tax invoice for it.
      </p>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Link href="/dashboard" className={buttonVariants({ size: "lg" })}>
          Go to your dashboard
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
        <Link href="/promote" className={buttonVariants({ variant: "outline", size: "lg" })}>
          Back to Promote
        </Link>
      </div>
    </div>
  );
}

/**
 * A charged total in whatever currency Dodo took it in.
 *
 * `formatPaise` is the rupee formatter and hard-codes ₹, which is right for
 * every price this site quotes. What was *charged* can carry a currency we did
 * not choose if a Dodo-side setting ever changes, and printing that with a ₹ in
 * front would be a lie on a receipt — so anything other than INR is rendered
 * with its ISO code instead of a symbol we cannot vouch for.
 */
function formatCharged(amount: number, currency: string | null): string {
  if (!currency || currency === "INR") return formatPaise(amount);
  return `${currency} ${(amount / 100).toFixed(2)}`;
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <dt className="text-[11px] font-medium tracking-[0.12em] text-muted uppercase">{label}</dt>
      <dd
        className={cn(
          "mt-1 text-sm font-semibold break-all text-ink",
          mono && "font-mono text-[0.8rem]",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="rounded-3xl border border-border bg-card p-8 text-center shadow-soft">
      <H3 className="text-xl">{title}</H3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-body">{body}</p>
      {action && (
        <Link href={action.href} className={buttonVariants({ className: "mt-6" })}>
          {action.label}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
