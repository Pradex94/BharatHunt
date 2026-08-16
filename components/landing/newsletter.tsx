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
          <form action={formAction} className="flex w-full gap-3 sm:w-auto">
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
              className="h-11 flex-1 rounded-xl border border-border bg-background px-4 text-sm text-ink outline-none transition-colors placeholder:text-muted-soft focus-visible:border-primary disabled:opacity-60 sm:w-64"
            />
            <button
              type="submit"
              disabled={pending || subscribed}
              className="btn-gradient flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl px-5 text-sm font-semibold disabled:opacity-70"
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
