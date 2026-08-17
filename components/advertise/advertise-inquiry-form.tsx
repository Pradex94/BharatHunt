"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { CheckCircle2, LogIn } from "lucide-react";

import { submitAdInquiry, type AdInquiryState } from "@/lib/actions/ad-inquiry";
import { AD_PACKAGES } from "@/lib/advertise";
import { ADS_EMAIL } from "@/lib/constants";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TurnstileWidget,
  isTurnstileConfigured,
  type TurnstileHandle,
} from "@/components/advertise/turnstile-widget";

/** Back to the form, not the page top, once Clerk hands the visitor back. */
const LOGIN_HREF = `/login?redirect_url=${encodeURIComponent("/advertise#inquire")}`;

const panelClassName =
  "flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-8 text-center";

const selectClassName =
  "h-10 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function AdvertiseInquiryForm() {
  const { isLoaded, isSignedIn, user } = useUser();
  const [authStalled, setAuthStalled] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const captchaRef = useRef<TurnstileHandle>(null);

  /*
   * Same guard the navbar uses: when Clerk's script never finishes loading,
   * `isLoaded` stays false forever, and holding the skeleton on that alone
   * would leave a permanent grey box where the form should be. After a short
   * grace period, fall through to the logged-out prompt -- it's the honest
   * guess, and its "Log in" is a plain link that works regardless of Clerk.
   */
  useEffect(() => {
    if (isLoaded) return;
    const timer = setTimeout(() => setAuthStalled(true), 3000);
    return () => clearTimeout(timer);
  }, [isLoaded]);
  const [state, formAction, pending] = useActionState<AdInquiryState, FormData>(
    async (previous, formData) => {
      const result = await submitAdInquiry(previous, formData);
      // A rejected attempt has already spent its single-use token, so issue a
      // fresh challenge before the visitor can try again.
      if (result?.error) captchaRef.current?.reset();
      return result;
    },
    undefined,
  );
  const handleCaptchaToken = useCallback((token: string) => setCaptchaToken(token), []);

  // No site key configured → the server rejects every submission, so offer the
  // mailbox instead of a form that cannot be sent. Set NEXT_PUBLIC_TURNSTILE_SITE_KEY
  // and TURNSTILE_SECRET_KEY to bring the form back.
  if (!isTurnstileConfigured) {
    return (
      <div className={panelClassName}>
        <h3 className="text-lg font-bold text-ink">Let&apos;s talk</h3>
        <p className="max-w-sm text-sm text-body">
          Email us with what you&rsquo;re promoting, your goals and your timeline — we typically
          respond within two business days.
        </p>
        <a
          href={`mailto:${ADS_EMAIL}`}
          className="font-semibold text-primary hover:underline"
        >
          {ADS_EMAIL}
        </a>
      </div>
    );
  }

  // Signed-out visitors never reach the form: `submitAdInquiry` rejects them
  // anyway, so ask for the session up front instead of after they've typed.
  if (!isLoaded && !authStalled) {
    return (
      <div className={panelClassName}>
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-10 w-32" />
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className={panelClassName}>
        <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <LogIn className="size-5" aria-hidden="true" />
        </span>
        <h3 className="text-lg font-bold text-ink">Log in to get in touch</h3>
        <p className="max-w-sm text-sm text-body">
          Advertising inquiries come from a Bharat Hunt account, so we know who we&rsquo;re talking
          to and can pick up the conversation where you left it.
        </p>
        <Link href={LOGIN_HREF} className={buttonVariants({ size: "lg" })}>
          Log in to continue
        </Link>
        <p className="text-xs text-muted">
          Prefer email? Reach us at{" "}
          <a href={`mailto:${ADS_EMAIL}`} className="font-medium text-primary hover:underline">
            {ADS_EMAIL}
          </a>
          .
        </p>
      </div>
    );
  }

  if (state?.ok) {
    return (
      <div className={panelClassName}>
        <CheckCircle2 className="size-10 text-success" aria-hidden="true" />
        <h3 className="text-lg font-bold text-ink">Thanks — we&apos;ll be in touch</h3>
        <p className="max-w-sm text-sm text-body">
          Your inquiry is in. Our team typically responds within two business days with the
          options that fit your goals.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 sm:p-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ad-name">Your name</Label>
          <Input
            id="ad-name"
            name="name"
            maxLength={120}
            placeholder="Priya Sharma"
            defaultValue={user.fullName ?? ""}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ad-email">Work email</Label>
          <Input
            id="ad-email"
            name="email"
            type="email"
            maxLength={200}
            placeholder="you@company.com"
            defaultValue={user.primaryEmailAddress?.emailAddress ?? ""}
            required
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ad-company">Company</Label>
          <Input id="ad-company" name="company" maxLength={160} placeholder="Acme Inc." />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ad-package">Interested in</Label>
          <select id="ad-package" name="package" defaultValue="" className={selectClassName}>
            <option value="">Not sure yet — recommend one</option>
            {AD_PACKAGES.map((pkg) => (
              <option key={pkg.id} value={pkg.name}>
                {pkg.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ad-message">What are you promoting?</Label>
        <Textarea
          id="ad-message"
          name="message"
          rows={4}
          maxLength={2000}
          placeholder="Tell us about your product, your goals, and your timeline."
        />
      </div>

      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}

      <TurnstileWidget ref={captchaRef} onTokenChange={handleCaptchaToken} />

      <div className="flex flex-col items-start gap-2">
        <Button type="submit" disabled={pending || !captchaToken} size="lg">
          {pending ? "Sending…" : "Get started"}
        </Button>
        <p className="text-xs text-muted">
          Prefer email? Reach us at{" "}
          <a
            href={`mailto:${ADS_EMAIL}`}
            className="font-medium text-primary hover:underline"
          >
            {ADS_EMAIL}
          </a>
          .
        </p>
      </div>
    </form>
  );
}
