"use client";

/* Lets a visitor review and change the cookie choice they made in the banner.
 * Lives on the /cookies policy page. Reads/writes via lib/cookie-consent, which
 * fires the change event so the CookieConsent banner re-opens on reset. */

import { Check, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { clearConsent, setConsent, type ConsentValue } from "@/lib/cookie-consent";
import { useConsent, useIsHydrated } from "@/hooks/use-cookie-consent";

const STATUS_LABEL: Record<ConsentValue, string> = {
  accepted: "You've accepted optional cookies.",
  declined: "You've declined optional cookies — only essential ones are used.",
};

export function CookiePreferences() {
  const consent = useConsent();
  const hydrated = useIsHydrated();

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h2 className="text-lg font-bold text-ink">Your preferences</h2>

      <p className="mt-1 min-h-5 text-sm text-body" aria-live="polite">
        {!hydrated
          ? " "
          : consent === null
            ? "You haven't set a preference yet."
            : STATUS_LABEL[consent]}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={() => setConsent("accepted")}
          data-icon="inline-start"
          aria-pressed={consent === "accepted"}
          className={cn(consent === "accepted" && "ring-2 ring-primary/40")}
        >
          <Check /> Accept all
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setConsent("declined")}
          data-icon="inline-start"
          aria-pressed={consent === "declined"}
          className={cn(consent === "declined" && "ring-2 ring-primary/40")}
        >
          <X /> Decline optional
        </Button>
        {hydrated && consent !== null && (
          <Button variant="ghost" size="sm" onClick={() => clearConsent()}>
            Reset
          </Button>
        )}
      </div>
    </div>
  );
}
