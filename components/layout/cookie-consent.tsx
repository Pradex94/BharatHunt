"use client";

/* Design system: design.md (Bharat Hunt — orange) · bottom cookie-consent banner
 * Non-blocking card: Accept all / Decline, with a link to the Cookie Policy.
 * The choice is stored in a cookie (see lib/cookie-consent) so it persists. */

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Cookie } from "lucide-react";

import { Button } from "@/components/ui/button";
import { setConsent, type ConsentValue } from "@/lib/cookie-consent";
import { useConsent, useIsHydrated } from "@/hooks/use-cookie-consent";

export function CookieConsent() {
  const consent = useConsent();
  const hydrated = useIsHydrated();

  // Hidden during SSR/hydration (no flash for visitors who already chose) and
  // once a choice exists. `setConsent` fires the store event → this re-renders.
  const visible = hydrated && consent === null;

  function choose(value: ConsentValue) {
    setConsent(value);
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          role="region"
          aria-label="Cookie consent"
          aria-live="polite"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4 sm:px-6 sm:pb-6"
        >
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-hover sm:flex-row sm:items-center sm:gap-6 sm:p-6">
            <span
              aria-hidden="true"
              className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
            >
              <Cookie className="size-5" />
            </span>

            <div className="flex-1">
              <p className="text-sm font-semibold text-ink">We use cookies</p>
              <p className="mt-1 text-sm leading-relaxed text-body">
                We use essential cookies to keep you signed in, plus optional ones
                to understand how Bharat Hunt is used. See our{" "}
                <Link
                  href="/cookies"
                  className="font-medium text-primary transition-colors hover:underline"
                >
                  Cookie Policy
                </Link>
                .
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => choose("declined")}>
                Decline
              </Button>
              <Button size="sm" onClick={() => choose("accepted")}>
                Accept all
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
