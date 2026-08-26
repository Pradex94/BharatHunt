"use client";

import { useState, useTransition } from "react";

import { approveProduct, rejectProduct } from "@/lib/actions/review";
import { cn } from "@/lib/utils";

/**
 * Approve / send back, for one product in the queue.
 *
 * Rejection asks for a note before it fires, because a rejection with no reason
 * is the thing that makes a maker leave. It is optional — sometimes there is
 * nothing to say — but it has to be *offered*, so the flow opens a small form
 * rather than acting on the first click.
 *
 * The tokens are present only on the page reached from a review email, where
 * there is no session to authorise the call. One per action, because a signed
 * link is scoped to the action it was minted for — an approve token cannot
 * reject. The actions verify them server-side; they are passed through here,
 * never trusted here.
 */
export function ReviewActions({
  productId,
  productName,
  approveToken,
  rejectToken,
  onDone,
  size = "sm",
}: {
  productId: string;
  productName: string;
  /** Signed authority for each action, when acting without a session. */
  approveToken?: string | null;
  rejectToken?: string | null;
  /** Called after a successful decision — the token page swaps to a result view. */
  onDone?: (outcome: "approved" | "rejected") => void;
  size?: "sm" | "lg";
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"approved" | "rejected" | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");

  function run(action: "approve" | "reject") {
    setError(null);
    startTransition(async () => {
      const result =
        action === "approve"
          ? await approveProduct(productId, approveToken)
          : await rejectProduct(productId, note, rejectToken);

      if (!result.ok) {
        setError(result.error);
        return;
      }
      const outcome = action === "approve" ? "approved" : "rejected";
      setDone(outcome);
      setRejecting(false);
      onDone?.(outcome);
    });
  }

  if (done) {
    return (
      <p className={cn("text-sm font-medium", done === "approved" ? "text-success" : "text-muted")}>
        {done === "approved" ? `${productName} is live.` : `${productName} went back to drafts.`}
      </p>
    );
  }

  const buttonBase =
    size === "lg"
      ? "rounded-xl px-5 py-2.5 text-sm font-semibold"
      : "rounded-lg px-3 py-1.5 text-xs font-semibold";

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => run("approve")}
          disabled={isPending}
          className={cn(
            buttonBase,
            "bg-primary text-white transition-opacity hover:opacity-90 disabled:opacity-60",
          )}
        >
          {isPending ? "Working…" : "Approve"}
        </button>
        <button
          type="button"
          onClick={() => (rejecting ? run("reject") : setRejecting(true))}
          disabled={isPending}
          className={cn(
            buttonBase,
            "border border-border bg-card text-body transition-colors hover:text-ink disabled:opacity-60",
          )}
        >
          {rejecting ? "Confirm send back" : "Send back"}
        </button>
        {rejecting && (
          <button
            type="button"
            onClick={() => {
              setRejecting(false);
              setNote("");
            }}
            disabled={isPending}
            className="text-xs text-muted underline underline-offset-4"
          >
            Cancel
          </button>
        )}
      </div>

      {rejecting && (
        <label className="flex w-full max-w-md flex-col gap-1">
          <span className="text-xs text-muted">
            What should they change? Optional — it goes straight into the email.
          </span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="The website link 404s — point it at the live product and resubmit."
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-none"
          />
        </label>
      )}

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
