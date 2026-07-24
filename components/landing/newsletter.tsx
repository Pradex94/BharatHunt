"use client";

import { useState } from "react";
import { Mail, Check } from "lucide-react";

import { FadeIn } from "@/components/ui/motion";

export function Newsletter() {
  const [submitted, setSubmitted] = useState(false);
  const [email, setEmail] = useState("");

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
              Get the best new products &amp; launches, straight to your inbox.
            </p>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (email.trim()) setSubmitted(true);
          }}
          className="flex w-full gap-3 sm:w-auto"
        >
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
            aria-label="Email address"
            className="h-11 flex-1 rounded-xl border border-border bg-background px-4 text-sm text-ink outline-none transition-colors placeholder:text-muted-soft focus-visible:border-primary sm:w-64"
          />
          <button
            type="submit"
            className="btn-gradient flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl px-5 text-sm font-semibold"
          >
            {submitted ? (
              <>
                <Check className="size-4" />
                Subscribed
              </>
            ) : (
              "Subscribe"
            )}
          </button>
        </form>
      </FadeIn>
    </section>
  );
}
