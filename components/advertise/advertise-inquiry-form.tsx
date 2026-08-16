"use client";

import { useActionState, useCallback, useState } from "react";
import { CheckCircle2 } from "lucide-react";

import { submitAdInquiry, type AdInquiryState } from "@/lib/actions/ad-inquiry";
import { AD_PACKAGES } from "@/lib/advertise";
import { ADS_EMAIL } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TurnstileWidget } from "@/components/advertise/turnstile-widget";

const selectClassName =
  "h-10 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function AdvertiseInquiryForm() {
  const [captchaToken, setCaptchaToken] = useState("");
  const [state, formAction, pending] = useActionState<AdInquiryState, FormData>(
    submitAdInquiry,
    undefined,
  );
  const handleCaptchaToken = useCallback((token: string) => setCaptchaToken(token), []);

  if (state?.ok) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-8 text-center">
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
          <Input id="ad-name" name="name" maxLength={120} placeholder="Priya Sharma" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ad-email">Work email</Label>
          <Input
            id="ad-email"
            name="email"
            type="email"
            maxLength={200}
            placeholder="you@company.com"
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

      <TurnstileWidget onTokenChange={handleCaptchaToken} />

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
