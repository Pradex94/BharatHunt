"use server";

/**
 * Stores a newsletter signup from the landing page's "Stay in the loop" form.
 *
 * The form used to be decorative: it set a local `submitted` flag, rendered
 * "Subscribed", and threw the address away. This is the backend it never had.
 *
 * Requires the `newsletter_subscribers` table (supabase/migrations/). Anyone —
 * including logged-out visitors — may subscribe, so the RLS insert policy is
 * `with check (true)`; there is no select policy, so the list is readable only
 * via the service role.
 */

import { after } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import { buildNewsletterWelcome } from "@/lib/emails/newsletter-welcome";

export type NewsletterState = { ok?: boolean; error?: string } | undefined;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MAX_EMAIL_LENGTH = 200;

/** Postgres unique_violation — this address is already subscribed. */
const UNIQUE_VIOLATION = "23505";

export async function subscribeToNewsletter(
  _prevState: NewsletterState,
  formData: FormData,
): Promise<NewsletterState> {
  // Honeypot: a field no human sees and every naive bot fills in. Answer as if
  // it worked, so the bot has nothing to learn and moves on.
  if (String(formData.get("company") ?? "").trim()) {
    return { ok: true };
  }

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!EMAIL_RE.test(email) || email.length > MAX_EMAIL_LENGTH) {
    return { error: "Please enter a valid email address." };
  }

  const supabase = createClient();
  const { error } = await supabase.from("newsletter_subscribers").insert({ email });

  if (error) {
    // Already on the list. Not a failure from the visitor's side, and telling
    // them "you're already subscribed" would turn this form into a way to test
    // whether an address is on the list.
    if (error.code === UNIQUE_VIOLATION) {
      return { ok: true };
    }
    console.error("[newsletter] could not store subscriber:", error.message);
    return { error: "Couldn't sign you up just now. Please try again." };
  }

  // The welcome email is a nicety, not part of the transaction: the address is
  // already safely stored, and a mail outage must not read as a failed signup.
  // `after` runs it once the response has been flushed, so "Subscribed" appears
  // immediately rather than waiting on the mail provider.
  after(async () => {
    const sent = await sendEmail({ to: email, ...buildNewsletterWelcome(email) });
    if (!sent.ok) {
      console.error(`[newsletter] welcome email not delivered: ${sent.error}`);
    }
  });

  return { ok: true };
}
