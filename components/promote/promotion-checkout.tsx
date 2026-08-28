"use client";

/* Design system: design.md (Bharat Hunt — orange) · /promote/checkout
 *
 * The real payment card. Everything the demo bid panel simulates, this does for
 * money.
 *
 * ── The state machine ────────────────────────────────────────────────────────
 * idle → creating → paying → verifying → paid
 *                     ↓          ↓
 *                   idle       error (retryable)
 *
 * There is no transition into `paid` that does not pass through `verifying`, and
 * `verifying` is the server call. Razorpay's `handler` firing is *not* success —
 * it is a claim the browser makes, and this component never renders a success
 * screen on it. That is the single most important line in this file.
 *
 * ── Double-submit ────────────────────────────────────────────────────────────
 * Guarded twice, because the two guards fail differently. `disabled` on the
 * button stops the pointer, but React batches state updates, so a fast double
 * click can dispatch two handlers before the first re-render lands. The
 * `inFlight` ref is synchronous and closes that window. Neither alone is enough.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
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
import { SITE_NAME } from "@/lib/constants";
import { Button, buttonVariants } from "@/components/ui/button";
import { H2, H3, Numeric } from "@/components/ui/typography";
import {
  formatDuration,
  formatPaise,
  type PromotableProduct,
  type PromotionPackage,
  type PromotionSummary,
} from "@/lib/promotions";
import {
  createPromotionOrder,
  recordPromotionPaymentFailure,
  verifyPromotionPayment,
} from "@/lib/actions/promotions";
import {
  loadRazorpayCheckout,
  openRazorpayCheckout,
  type RazorpayCheckoutResponse,
  type RazorpayFailure,
} from "@/components/promote/razorpay";

type Status = "idle" | "creating" | "paying" | "verifying" | "paid";

type Props = {
  packages: PromotionPackage[];
  products: PromotableProduct[];
  /** Prefills Checkout. Never used to identify the buyer server-side. */
  buyer: { name: string; email: string };
};

/** Brand orange, matching `--color-primary`. Checkout takes a literal hex. */
const CHECKOUT_THEME = "#FF6B1A";

export function PromotionCheckout({ packages, products, buyer }: Props) {
  const headingId = useId();
  const errorId = useId();

  const promotable = products.filter((product) => !product.hasActivePromotion);

  const [packageId, setPackageId] = useState(() => packages[0]?.id ?? "");
  const [productId, setProductId] = useState(() => promotable[0]?.id ?? "");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
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

  /*
   * The current status, readable synchronously from Razorpay's callbacks.
   *
   * `ondismiss` fires outside React's event system and needs to know whether a
   * verification is in flight *right now*. The closure it was created in holds
   * a stale `status`, and deciding inside a `setStatus` updater would mean
   * mutating a ref from a function React is allowed to call twice. A mirror ref
   * is the honest version of both.
   */
  const statusRef = useRef<Status>("idle");
  const move = useCallback((next: Status) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const selectedPackage = packages.find((entry) => entry.id === packageId) ?? null;
  const selectedProduct = promotable.find((entry) => entry.id === productId) ?? null;
  const busy = status === "creating" || status === "paying" || status === "verifying";

  const settle = useCallback(
    (next: Status, message: string | null) => {
      if (!mounted.current) return;
      inFlight.current = false;
      move(next);
      setError(message);
    },
    [move],
  );

  const pay = useCallback(async () => {
    // Guard one: synchronous, closes the batching window `disabled` leaves open.
    if (inFlight.current) return;
    if (!selectedPackage || !selectedProduct) {
      setError("Choose a product and a promotion package.");
      return;
    }

    inFlight.current = true;
    setError(null);
    move("creating");

    trackEvent("promote_checkout_start", {
      location: "promote_checkout",
      package_id: selectedPackage.id,
    });

    // The script loads before the order so a script failure costs no order.
    try {
      await loadRazorpayCheckout();
    } catch {
      settle("idle", "Could not open the payment window. Check your connection and try again.");
      return;
    }

    // The amount is not sent. Only these two ids are, and the server prices them.
    const order = await createPromotionOrder({
      packageId: selectedPackage.id,
      productId: selectedProduct.id,
    });

    if (!order.ok) {
      settle("idle", order.error);
      return;
    }
    if (!mounted.current) return;

    move("paying");

    const verify = async (response: RazorpayCheckoutResponse) => {
      if (!mounted.current) return;
      move("verifying");

      const result = await verifyPromotionPayment({
        razorpay_order_id: response.razorpay_order_id,
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_signature: response.razorpay_signature,
      });

      if (!mounted.current) return;

      if (!result.ok) {
        // Never a success screen on a failed verification, however convincing
        // the browser's callback looked.
        trackEvent("promote_checkout_unverified", { location: "promote_checkout" });
        settle("idle", result.error);
        return;
      }

      trackEvent("promote_checkout_paid", {
        location: "promote_checkout",
        package_id: selectedPackage.id,
      });
      inFlight.current = false;
      setSummary(result.summary);
      move("paid");
      setError(null);
    };

    const onFailure = async (payload: RazorpayFailure) => {
      await recordPromotionPaymentFailure({
        razorpay_order_id: order.orderId,
        code: payload?.error?.code,
        description: payload?.error?.description,
      });
      trackEvent("promote_checkout_failed", { location: "promote_checkout" });
      settle(
        "idle",
        "That payment did not go through. No money has been taken — you can try again.",
      );
    };

    try {
      openRazorpayCheckout(
        {
          key: order.keyId,
          amount: order.amountPaise,
          currency: order.currency,
          name: SITE_NAME,
          description: `${order.packageName} — ${order.productName}`,
          order_id: order.orderId,
          handler: (response) => {
            void verify(response);
          },
          prefill: { name: buyer.name, email: buyer.email },
          notes: { promotion_id: order.promotionId },
          theme: { color: CHECKOUT_THEME },
          modal: {
            // Closing the modal is a normal thing to do, not an error. The
            // order stays open and the same one is reused on retry.
            ondismiss: () => {
              if (!mounted.current) return;
              trackEvent("promote_checkout_dismissed", { location: "promote_checkout" });

              /*
               * A dismiss can fire *after* a successful handler, while the
               * server is still verifying. Releasing the guard there would
               * re-arm the Pay button mid-verification and let a second order
               * be created for a payment that is about to succeed — so both the
               * status reset and the guard release happen only while the flow
               * is still sitting at "paying".
               */
              if (statusRef.current !== "paying") return;
              inFlight.current = false;
              move("idle");
            },
            escape: true,
            confirm_close: true,
          },
        },
        (payload) => {
          void onFailure(payload);
        },
      );
    } catch {
      settle("idle", "Could not open the payment window. Please try again.");
    }
  }, [buyer.email, buyer.name, move, selectedPackage, selectedProduct, settle]);

  // ── Success ────────────────────────────────────────────────────────────
  if (status === "paid" && summary) {
    return <PaidScreen summary={summary} />;
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
              {status === "verifying" ? "Confirming payment…" : "Processing…"}
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

        {status === "verifying" && (
          <p className="text-center text-xs text-muted">
            Do not close this page — we are confirming the payment with Razorpay.
          </p>
        )}

        <p className="flex items-center justify-center gap-2 text-center text-xs text-muted">
          <ShieldCheck className="size-3.5 shrink-0 text-success" aria-hidden="true" />
          Payments are processed by Razorpay. {SITE_NAME} never sees your card, UPI or bank
          details.
        </p>
      </div>
    </div>
  );
}

/** Shown only after the server verified the payment. */
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
        <Fact label="Amount paid" value={formatPaise(summary.amountPaise)} />
        <Fact label="Payment reference" value={summary.reference} mono />
        {summary.startsAt && (
          <Fact label="Starts" value={new Date(summary.startsAt).toLocaleString("en-IN")} />
        )}
        {summary.endsAt && (
          <Fact label="Ends" value={new Date(summary.endsAt).toLocaleString("en-IN")} />
        )}
      </dl>

      <p className="mt-5 text-xs leading-relaxed text-muted">
        Keep the payment reference for your records — quote it if you need to contact us about
        this promotion. A receipt is also available in your Razorpay payment confirmation.
      </p>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Link href="/dashboard" className={buttonVariants({ size: "lg" })}>
          Go to your dashboard
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
        <Link
          href={summary.productName ? "/promote" : "/promote"}
          className={buttonVariants({ variant: "outline", size: "lg" })}
        >
          Back to Promote
        </Link>
      </div>
    </div>
  );
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
