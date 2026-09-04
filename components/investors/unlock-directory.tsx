"use client";

/* Design system: design.md (Bharat Hunt — orange) · /investors
 *
 * The pricing card and the money path behind it.
 *
 * Modelled directly on components/promote/promotion-checkout.tsx, which is the
 * component that already survived this integration once. What carries over:
 *
 * ── Arriving back with `status=success` is not success ────────────────────────
 * It is a claim the URL makes. Dodo's hosted checkout runs on Dodo's origin, so
 * the customer leaves, pays, and comes back to `/investors?status=success`.
 * `confirm` below asks our server, which asks Dodo, and nothing renders an
 * unlocked screen without that answer.
 *
 * ── The state machine ────────────────────────────────────────────────────────
 *   idle → creating → (navigates away to Dodo)
 *   returning → confirming → paid
 *                    ↓  ↓
 *                  idle  pending
 *
 * `pending` is not a failure. Dodo can return a customer whose UPI mandate or
 * 3DS step has not finished; telling them the payment failed would send them to
 * pay twice.
 *
 * ── Double-submit ────────────────────────────────────────────────────────────
 * Guarded twice, because the two guards fail differently. `disabled` on the
 * button stops the pointer, but React batches state updates, so a fast double
 * click can dispatch two handlers before the first re-render lands. The
 * `inFlight` ref is synchronous and closes that window. Neither alone is enough.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  Loader2,
  Lock,
  PartyPopper,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";
import { Button, buttonVariants } from "@/components/ui/button";
import { H3, Numeric } from "@/components/ui/typography";
import {
  formatPaise,
  INVESTOR_PAYMENT_CANCELLED_MESSAGE,
  type InvestorDirectoryPlan,
  type InvestorPurchaseSummary,
} from "@/lib/investors";
import {
  confirmInvestorPayment,
  createInvestorCheckout,
  recordInvestorCheckoutCancelled,
} from "@/lib/actions/investors";

type Status = "idle" | "creating" | "confirming" | "pending" | "paid";

/**
 * What ₹499 buys, in the order a founder cares about it.
 *
 * Every line is a capability that exists in the code as written — the full
 * table, the search action, the filter set, the detail panel, the contact block.
 * Nothing here promises a feature the database cannot serve, which is the one
 * rule a pricing list has to follow.
 */
const BENEFITS = [
  "The complete investor directory, not just the free preview",
  "Search by investor, fund, sector or keyword",
  "Filter by stage, sector, location and investor type",
  "Full profiles: thesis, portfolio and cheque size",
  "Contact details recorded for each investor",
  "Instant access, on this page, the moment payment clears",
];

export function UnlockDirectory({
  plan,
  ret,
  isSignedIn,
  className,
}: {
  /** Null when the plan row is missing or inactive — the fail-closed state. */
  plan: InvestorDirectoryPlan | null;
  /**
   * What Dodo sent the customer back to, read from the URL on the server.
   *
   * A hint, never a credential: it only decides which screen is drawn first.
   * The outcome comes from `confirmInvestorPayment`, which finds the caller's
   * own purchase and asks Dodo what happened to it.
   */
  ret: { status: "success" | "cancelled" | null };
  isSignedIn: boolean;
  className?: string;
}) {
  const router = useRouter();

  /* A return from Dodo starts mid-flow rather than at `idle`, so the customer
   * never sees the pricing card flash before the confirmation resolves. */
  const [status, setStatus] = useState<Status>(() =>
    ret.status === "success" ? "confirming" : "idle",
  );
  const [error, setError] = useState<string | null>(
    ret.status === "cancelled" ? INVESTOR_PAYMENT_CANCELLED_MESSAGE : null,
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [summary, setSummary] = useState<InvestorPurchaseSummary | null>(null);

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

  const confirm = useCallback(async () => {
    if (confirming.current) return;
    confirming.current = true;

    setStatus("confirming");
    try {
      const result = await confirmInvestorPayment();
      if (!mounted.current) return;

      if (!result.ok) {
        // Never an unlocked screen on a failed confirmation, however convincing
        // the URL looked.
        trackEvent("payment_failed", { location: "investors", reason: "unverified" });
        setStatus("idle");
        setError(result.error);
        return;
      }

      if (result.state === "pending") {
        trackEvent("payment_pending", { location: "investors" });
        setStatus("pending");
        setNotice(result.message);
        setError(null);
        return;
      }

      trackEvent("payment_success", { location: "investors" });
      setSummary(result.summary);
      setStatus("paid");
      setError(null);
      /*
       * The page is a `force-dynamic` server component whose entire shape —
       * locked teaser or live directory — is decided by an entitlement read
       * that has just changed. A refresh is what swaps one for the other
       * without a full navigation, and the success panel below stays mounted
       * over it until the customer presses through.
       */
      router.refresh();
    } finally {
      confirming.current = false;
    }
  }, [router]);

  /*
   * The arrival. An effect rather than a click, because the customer's "action"
   * was navigating back — there is nothing for them to press. The `arrived` ref
   * keeps it to once per mount even under React's development double-invoke of
   * effects, which would otherwise fire two calls at the rate limiter for every
   * return.
   */
  const arrived = useRef(false);
  useEffect(() => {
    if (ret.status !== "success" || arrived.current) return;
    arrived.current = true;
    void confirm();
  }, [confirm, ret.status]);

  /* A cancelled return is recorded so the customer's own history says so rather
   * than leaving a purchase that reads as still awaiting payment forever. */
  const cancelled = useRef(false);
  useEffect(() => {
    if (ret.status !== "cancelled" || cancelled.current) return;
    cancelled.current = true;

    trackEvent("payment_failed", { location: "investors", reason: "cancelled" });
    void recordInvestorCheckoutCancelled();
  }, [ret.status]);

  const startCheckout = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;

    setStatus("creating");
    setError(null);
    setNotice(null);
    trackEvent("checkout_started", { location: "investors" });

    try {
      const result = await createInvestorCheckout();
      if (!mounted.current) return;

      if (!result.ok) {
        trackEvent("payment_failed", { location: "investors", reason: "checkout_not_opened" });
        setStatus("idle");
        setError(result.error);
        return;
      }

      /*
       * `location.assign`, not `router.push`. The checkout lives on Dodo's
       * origin, and the App Router's client navigation only handles routes
       * inside this app — handing it an external URL is how a "nothing
       * happened" bug report gets written. The component is deliberately left
       * in `creating` while the browser tears the page down, so the button
       * cannot be pressed again during the handover.
       */
      window.location.assign(result.checkoutUrl);
    } catch {
      if (!mounted.current) return;
      setStatus("idle");
      setError("Something went wrong opening the checkout. Please try again.");
    } finally {
      inFlight.current = false;
    }
  }, []);

  // The success panel. Replaces the pricing card entirely — a customer who has
  // just paid must not be looking at a Pay button.
  if (status === "paid") {
    return (
      <div
        id="unlock"
        className={cn(
          "animate-bh-bid-pop rounded-3xl border border-primary/20 bg-card p-6 text-center shadow-soft sm:p-8",
          className,
        )}
      >
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <PartyPopper className="size-7" aria-hidden="true" />
        </span>
        <H3 className="mt-4">You&rsquo;re in!</H3>
        <p className="mt-2 text-sm text-body">
          Your Bharat Hunt Investor Directory access is now active.
        </p>

        {summary && (
          <dl className="mt-6 flex flex-col gap-2 rounded-2xl bg-secondary-bg/70 p-4 text-left text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted">Reference</dt>
              <dd className="truncate font-mono text-xs text-ink">{summary.reference}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted">Paid</dt>
              <dd>
                {/*
                  The charged figure when we have it, tax included, because that
                  is the number on the customer's card statement. Falling back
                  to the net price only when settlement has not recorded one.
                */}
                <Numeric className="font-medium text-ink">
                  {summary.chargedAmount !== null
                    ? formatPaise(summary.chargedAmount)
                    : formatPaise(summary.amountPaise)}
                </Numeric>
                {summary.chargedTax !== null && summary.chargedTax > 0 && (
                  <span className="ml-1 text-xs text-muted">
                    (incl. {formatPaise(summary.chargedTax)} tax)
                  </span>
                )}
              </dd>
            </div>
          </dl>
        )}

        <Button
          type="button"
          size="lg"
          className="mt-6 w-full"
          onClick={() => {
            // The refresh fired at confirmation time has already re-rendered the
            // page underneath this panel with the directory in place; this puts
            // the customer's eyes on it.
            router.refresh();
            document
              .getElementById("directory")
              ?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        >
          Explore Investor Directory
          <ArrowRight className="size-4" aria-hidden="true" />
        </Button>
      </div>
    );
  }

  const price = plan ? formatPaise(plan.amountPaise) : null;
  const purchasable = Boolean(plan?.purchasable);

  return (
    <div
      id="unlock"
      className={cn(
        "flex flex-col rounded-3xl border border-border bg-card p-6 shadow-soft sm:p-8",
        className,
      )}
    >
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium tracking-[0.12em] text-primary uppercase">
          Full access
        </span>
        <H3>Unlock the Full Investor Directory</H3>
      </div>

      <div className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Numeric className="text-5xl leading-none font-bold text-ink">{price ?? "—"}</Numeric>
        <span className="text-sm text-muted">One-time payment</span>
      </div>
      <p className="mt-2 text-sm text-muted">
        One-time payment · Instant access · No subscription
      </p>

      <ul className="mt-6 flex flex-col gap-3">
        {BENEFITS.map((benefit) => (
          <li key={benefit} className="flex items-start gap-2.5 text-sm text-body">
            <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Check className="size-2.5" aria-hidden="true" />
            </span>
            {benefit}
          </li>
        ))}
      </ul>

      {notice && (
        <p
          role="status"
          className="mt-6 flex items-start gap-2 rounded-2xl bg-secondary-bg p-4 text-sm text-body"
        >
          <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-primary" aria-hidden="true" />
          {notice}
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="mt-6 flex items-start gap-2 rounded-2xl bg-destructive/10 p-4 text-sm text-destructive"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      <div className="mt-7 flex flex-col gap-3">
        {status === "pending" ? (
          <Button type="button" size="lg" variant="outline" onClick={() => void confirm()}>
            <RefreshCw className="size-4" aria-hidden="true" />
            Check again
          </Button>
        ) : !isSignedIn ? (
          /*
           * A link, not a button that calls the action and fails.
           *
           * `createInvestorCheckout` refuses an unauthenticated caller — it has
           * to, it is a public endpoint — but making a signed-out visitor press
           * Pay to be told to log in is a wasted click on the one control the
           * whole page is built around. `redirect_url` brings them back here.
           */
          <Link
            href="/login?redirect_url=/investors"
            className={buttonVariants({ size: "lg", className: "w-full" })}
            onClick={() =>
              trackEvent("investor_unlock_click", { location: "investors", state: "signed_out" })
            }
          >
            <Lock className="size-4" aria-hidden="true" />
            Log in to get full access
          </Link>
        ) : (
          <Button
            type="button"
            size="lg"
            disabled={busy || !purchasable}
            onClick={() => {
              trackEvent("investor_unlock_click", { location: "investors", state: "signed_in" });
              void startCheckout();
            }}
          >
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                {status === "confirming" ? "Confirming payment…" : "Opening checkout…"}
              </>
            ) : (
              <>Get Full Access{price ? ` — ${price}` : ""}</>
            )}
          </Button>
        )}

        {!purchasable && (
          /*
           * The fail-closed state: the plan row has no Dodo product mapped, so
           * nothing can be charged. Said plainly rather than left as a dead
           * button — and it is a configuration fact, so it names no error.
           */
          <p role="status" className="text-center text-xs text-muted">
            Purchasing is temporarily unavailable. The free preview above stays open.
          </p>
        )}

        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted">
          <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
          Payment handled by Dodo Payments. Card and UPI details never reach Bharat Hunt.
        </p>
      </div>
    </div>
  );
}
