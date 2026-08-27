"use client";

/* Design system: design.md (Bharat Hunt — orange) · /promote
 *
 * The interactive bid card.
 *
 * It is a real form with real validation and no backend behind it, and it says
 * so. Submitting puts the visitor's bid on the board above at #1, which is the
 * whole point: a few seconds later the demo outbids them and the panel says so.
 * That sequence — you lead, you get taken — is the argument the page is making,
 * and no amount of copy makes it as well as watching it happen to your own row.
 *
 * ── When bidding is real ─────────────────────────────────────────────────────
 * `placeBid` becomes an async server action and everything below stays. The
 * arithmetic here is presentation only: the minimum is recomputed server-side,
 * the bidder authenticated, the product's ownership verified, the round's end
 * time enforced and the endpoint rate-limited before a rupee is recorded. A
 * client that can be edited in devtools decides nothing.
 */

import { useId, useState, type FormEvent } from "react";
import { ArrowRight, Check, Loader2, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";
import { BID_INCREMENT, formatInr, PROMOTED_SLOTS } from "@/lib/promote";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuction } from "@/components/promote/auction-provider";
import { RollingAmount } from "@/components/promote/rolling-number";
import Link from "next/link";

type Status = "idle" | "submitting" | "placed";

/** Quick raises offered above the minimum, in rupees. */
const QUICK_RAISES = [0, 250, 500];

export function BidPanel() {
  const { topAmount, minNextBid, yourBid, yourBidIsWinning, isDemo, placeBid } = useAuction();

  const inputId = useId();
  const errorId = useId();

  const [amount, setAmount] = useState(() => String(minNextBid));
  const [edited, setEdited] = useState(false);
  const [trackedMin, setTrackedMin] = useState(minNextBid);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  /*
   * Follow the rising minimum until the visitor types something.
   *
   * Adjusting during render rather than in an effect (the pattern
   * `components/products/product-logo.tsx` uses for the same reason): an effect
   * would paint one frame of a stale figure every time the board moves, and the
   * figure is the one thing this card exists to get right.
   */
  if (!edited && trackedMin !== minNextBid) {
    setTrackedMin(minNextBid);
    setAmount(String(minNextBid));
  }

  const parsed = Number.parseInt(amount.replace(/[^0-9]/g, ""), 10);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "submitting") return;

    if (!Number.isFinite(parsed)) {
      setError("Enter an amount in rupees.");
      return;
    }
    if (parsed < minNextBid) {
      setError(`The minimum next bid is ${formatInr(minNextBid)}.`);
      return;
    }

    setError(null);
    setStatus("submitting");
    trackEvent("promote_place_bid", { location: "promote", bid_amount: parsed, demo: isDemo });

    // Stands in for the round trip a real bid will make. Keeps the button's
    // pending state honest rather than decorative.
    window.setTimeout(() => {
      placeBid(parsed);
      setStatus("placed");
      setEdited(false);
    }, 600);
  }

  return (
    <div
      id="place-bid"
      className="scroll-mt-24 rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-7"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold text-ink sm:text-2xl">Place your bid</h3>
          <p className="mt-1.5 text-sm text-body">
            Beat the leader by at least {formatInr(BID_INCREMENT)} to take the spotlight.
          </p>
        </div>
        {isDemo && (
          <span className="rounded-full border border-border bg-secondary-bg px-2.5 py-1 text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">
            Preview
          </span>
        )}
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border bg-secondary-bg/60 p-4">
          <dt className="text-[11px] font-medium tracking-[0.12em] text-muted uppercase">
            Current bid
          </dt>
          <dd className="mt-1 text-2xl font-bold text-ink">
            <RollingAmount value={topAmount} />
          </dd>
        </div>
        <div className="rounded-2xl border border-primary/25 bg-primary/[0.06] p-4">
          <dt className="text-[11px] font-medium tracking-[0.12em] text-primary uppercase">
            Minimum next bid
          </dt>
          <dd className="mt-1 text-2xl font-bold text-primary">
            <RollingAmount value={minNextBid} />
          </dd>
        </div>
      </dl>

      <form onSubmit={submit} noValidate className="mt-5 flex flex-col gap-3">
        <Label htmlFor={inputId} className="text-sm font-semibold text-ink">
          Your bid
        </Label>

        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-4 flex items-center font-mono text-base font-semibold text-muted"
            >
              ₹
            </span>
            <Input
              id={inputId}
              name="bid"
              inputMode="numeric"
              autoComplete="off"
              // A text input with a numeric keypad, not `type="number"`: number
              // inputs bring spinners, scroll-wheel edits and locale parsing
              // that a rupee amount does not want.
              value={amount}
              onChange={(event) => {
                setEdited(true);
                setError(null);
                setAmount(event.target.value.replace(/[^0-9]/g, ""));
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              className="h-12 rounded-xl pl-9 font-mono text-base tabular-nums"
            />
          </div>

          <Button
            type="submit"
            size="lg"
            disabled={status === "submitting"}
            className="h-12 shrink-0 px-6 sm:w-auto"
          >
            {status === "submitting" ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Placing
              </>
            ) : (
              <>
                Place Bid
                <ArrowRight className="size-4" aria-hidden="true" />
              </>
            )}
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {QUICK_RAISES.map((raise) => (
            <button
              key={raise}
              type="button"
              onClick={() => {
                setEdited(true);
                setError(null);
                setAmount(String(minNextBid + raise));
              }}
              className="min-h-9 rounded-full border border-border bg-card px-3.5 text-sm font-medium text-body transition-colors hover:border-primary/30 hover:bg-secondary-bg hover:text-ink focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {raise === 0 ? `Minimum · ${formatInr(minNextBid)}` : `+${formatInr(raise)}`}
            </button>
          ))}
        </div>

        {error && (
          <p id={errorId} role="alert" className="flex items-center gap-2 text-sm text-error">
            <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        )}
      </form>

      {/* Outcome of the visitor's own bid. Polite rather than assertive: it is
          worth hearing, but it must not interrupt whatever is being read. */}
      <div aria-live="polite" className="mt-1">
        {status === "placed" && yourBid && (
          <div
            className={cn(
              "animate-bh-bid-pop mt-4 flex flex-col gap-3 rounded-2xl border p-4",
              yourBidIsWinning
                ? "border-success/30 bg-success/[0.06]"
                : "border-primary/30 bg-primary/[0.06]",
            )}
          >
            <p className="flex items-start gap-2 text-sm font-semibold text-ink">
              {yourBidIsWinning ? (
                <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
              ) : (
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              )}
              {yourBidIsWinning
                ? `Your bid of ${formatInr(yourBid.amount)} is holding position ${yourBid.position}.`
                : `You have been outbid — your ${formatInr(yourBid.amount)} is now position ${yourBid.position}, outside the top ${PROMOTED_SLOTS}.`}
            </p>
            <p className="text-sm text-body">
              {yourBidIsWinning
                ? "Watch the board — in this example auction it will not hold for long."
                : "Raise your bid to move back into a promoted slot."}
            </p>
          </div>
        )}
      </div>

      {isDemo && (
        <div className="mt-5 flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-relaxed text-muted">
            This is a preview of the bidding experience. No payment is taken and no real bid is
            placed.
          </p>
          <Link
            href="/advertise#inquire"
            onClick={() => trackEvent("promote_early_access", { location: "promote" })}
            className={buttonVariants({ variant: "outline", size: "sm", className: "shrink-0" })}
          >
            Request early access
          </Link>
        </div>
      )}
    </div>
  );
}
