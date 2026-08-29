"use client";

import { useActionState } from "react";
import { Mail, Check } from "lucide-react";

import { FadeIn } from "@/components/ui/motion";
import { subscribeToNewsletter, type NewsletterState } from "@/lib/actions/newsletter";

export function Newsletter() {
  const [state, formAction, pending] = useActionState<NewsletterState, FormData>(
    subscribeToNewsletter,
    undefined,
  );

  const subscribed = state?.ok === true;

  return (
    <section className="mx-auto w-full max-w-[1400px] px-4 py-10 sm:px-6 lg:px-8">
      <FadeIn className="flex flex-col items-start gap-6 rounded-3xl border border-border bg-card p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div className="flex items-center gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-secondary-bg text-primary">
            <Mail className="size-6" />
          </span>
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-bold tracking-tight text-ink">Stay in the loop</h2>
            <p className="text-sm text-body">
              {subscribed
                ? "You're on the list — check your inbox for a confirmation."
                : "Get the best new products & launches, straight to your inbox."}
            </p>
          </div>
        </div>

        <div className="flex w-full flex-col gap-1.5 sm:w-auto">
          {/*
            Stacked below `sm`, a row from `sm` up — the same shape the hero
            CTAs use.

            This was a row at every width, and it was the one place on the site
            that scrolled sideways: measured 91px past the viewport at 320, 375
            and 390. A flex item's `min-width` resolves to `auto`, and for an
            <input> that is its intrinsic ~20-character width, so `flex-1` could
            not shrink it below roughly 180px; the button next to it is
            `shrink-0` by design. 180 + 12 + 118 does not fit in the 240px this
            card leaves on a 320px screen, so the row pushed the page open.
            `min-w-0` lets the field shrink once it is beside the button again.

            `flex-1` is `sm:` only, and that part matters: flex sizing follows
            the main axis, so in the stacked column it governed the field's
            *height* — `flex-basis: 0%` beat `h-11` and collapsed the input to
            22px. It belongs to the row layout, so it now ships with it.
          */}
          <form action={formAction} className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            {/* Honeypot: hidden from people, irresistible to bots. Never filled
                by a real visitor, so anything in it is discarded server-side. */}
            <input
              type="text"
              name="company"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              className="hidden"
            />
            <input
              type="email"
              name="email"
              required
              disabled={pending || subscribed}
              placeholder="Enter your email"
              aria-label="Email address"
              aria-invalid={state?.error ? true : undefined}
              className="h-11 w-full min-w-0 rounded-xl border border-border bg-background px-4 text-base text-ink outline-none transition-colors placeholder:text-muted-soft focus-visible:border-primary disabled:opacity-60 sm:w-64 sm:flex-1 sm:text-sm"
            />
            <button
              type="submit"
              disabled={pending || subscribed}
              className="btn-gradient flex h-11 w-full shrink-0 items-center justify-center gap-1.5 rounded-xl px-5 text-sm font-semibold disabled:opacity-70 sm:w-auto"
            >
              {subscribed ? (
                <>
                  <Check className="size-4" />
                  Subscribed
                </>
              ) : pending ? (
                "Subscribing…"
              ) : (
                "Subscribe"
              )}
            </button>
          </form>

          {state?.error && (
            <p role="alert" className="text-xs text-destructive">
              {state.error}
            </p>
          )}
        </div>
      </FadeIn>
    </section>
  );
}
