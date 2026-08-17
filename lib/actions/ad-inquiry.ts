"use server";

/**
 * Stores an "advertise with us" lead from the /advertise page, then emails both
 * sides: a confirmation to the advertiser and a notification to the ads mailbox.
 *
 * Requires the `ad_inquiries` table (supabase/migrations/). Submitting requires
 * a signed-in Clerk user: the lead is attributed to them via `user_id`, and the
 * RLS insert policy only accepts a row whose `user_id` matches the caller's
 * JWT. There is no select policy, so inquiries are readable only via the
 * service role (e.g. the Supabase dashboard).
 *
 * Storage and email are treated as two independent capture paths rather than a
 * source of truth plus a nicety: whichever succeeds, the lead is safe, and the
 * visitor only sees a failure when both are down. Anything that failed is
 * logged for the operator.
 */

import { auth } from "@clerk/nextjs/server";

import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/ensure-profile";
import { checkRateLimitByIpAndUser } from "@/lib/rate-limit";
import { ADS_EMAIL } from "@/lib/constants";
import { sendEmail } from "@/lib/email";
import {
  buildAdInquiryConfirmation,
  buildAdInquiryNotification,
  type AdInquiryLead,
} from "@/lib/emails/ad-inquiry";

export type AdInquiryState = { ok?: boolean; error?: string } | undefined;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

async function verifyTurnstile(token: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret || !token) return false;

  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
      cache: "no-store",
    });
    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  } catch {
    return false;
  }
}

export async function submitAdInquiry(
  _prevState: AdInquiryState,
  formData: FormData,
): Promise<AdInquiryState> {
  // Gates run cheapest first.
  //
  // (0) Identity. Advertising inquiries are for signed-in users only, so this
  //     is both the product rule and the cheapest possible rejection: no
  //     Redis round-trip, no outbound captcha call, no database work.
  const { userId } = await auth();
  if (!userId) {
    return { error: "Please log in to send an advertising inquiry." };
  }

  // (1) Volume gate, before the captcha. Verifying a token costs an outbound
  //     request to Cloudflare, so a flood would otherwise turn into one
  //     outbound call per attempt. Keyed by user rather than IP now that a
  //     session is mandatory -- rotating IPs no longer buys an attacker a
  //     fresh budget. The ceiling is high enough that a human retrying a
  //     failed challenge never reaches it.
  const attempts = await checkRateLimitByIpAndUser("adInquiryAttempts", userId);
  if (!attempts.ok) {
    return { error: attempts.message };
  }

  const captchaToken = String(formData.get("cf-turnstile-response") ?? "");
  if (!(await verifyTurnstile(captchaToken))) {
    return { error: "Please complete the security check and try again." };
  }

  // (2) Submission gate, after the captcha. This action sends two emails per
  //     accepted submission. Keep the window deliberately generous for
  //     legitimate advertisers, but expensive for a bot that gets past (1).
  const allowed = await checkRateLimitByIpAndUser("adInquiry", userId);
  if (!allowed.ok) return { error: allowed.message };

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const company = String(formData.get("company") ?? "").trim();
  const pkg = String(formData.get("package") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  if (!name || name.length > 120) {
    return { error: "Please enter your name." };
  }
  if (!EMAIL_RE.test(email) || email.length > 200) {
    return { error: "Please enter a valid email address." };
  }
  if (company.length > 160 || pkg.length > 80 || message.length > 2000) {
    return { error: "Some fields are too long — please shorten them." };
  }

  const lead: AdInquiryLead = {
    name,
    email,
    company: company || null,
    package: pkg || null,
    message: message || null,
  };

  // A lead is captured two independent ways: the database and the ads mailbox.
  // The visitor sees an error only if BOTH fail — a missing table or a mail
  // outage on its own must never cost us the lead (it already did once, when
  // ad_inquiries hadn't been migrated and the insert was the only path).
  const [stored, notified] = await Promise.all([storeLead(lead, userId), notify(lead)]);

  if (!stored && !notified) {
    return { error: `Couldn't send your inquiry. Please email ${ADS_EMAIL} instead.` };
  }
  if (!stored) {
    console.error(
      "[ad-inquiry] lead delivered by email only — run `supabase db push` to restore storage.",
    );
  }

  return { ok: true };
}

/**
 * Writes the lead to Supabase, attributed to the signed-in user. Returns
 * whether it landed.
 *
 * `ad_inquiries.user_id` is a FK to profiles.id and the RLS insert policy
 * requires it to equal the caller's Clerk id, so the profile row has to exist
 * first -- the `user.created` webhook is unreliable locally (see
 * lib/ensure-profile.ts). A failure here is logged, never thrown: the email
 * path below is an independent capture of the same lead.
 */
async function storeLead(lead: AdInquiryLead, userId: string): Promise<boolean> {
  try {
    await ensureProfile();
  } catch (profileError) {
    console.error(
      "[ad-inquiry] could not prepare profile:",
      profileError instanceof Error ? profileError.message : profileError,
    );
    return false;
  }

  const supabase = createClient();
  const { error } = await supabase.from("ad_inquiries").insert({ ...lead, user_id: userId });
  if (error) {
    console.error("[ad-inquiry] could not store lead:", error.message);
    return false;
  }
  return true;
}

/**
 * Confirmation to the advertiser + notification to the ads mailbox, in
 * parallel. Failures are logged, never thrown. Returns whether the *team*
 * notification landed — that's the copy that decides whether the lead reached
 * a human, so it's what the caller treats as a successful capture.
 */
async function notify(lead: AdInquiryLead): Promise<boolean> {
  const confirmation = buildAdInquiryConfirmation(lead);
  const notification = buildAdInquiryNotification(lead);

  const [toAdvertiser, toTeam] = await Promise.all([
    // Replies from the advertiser go to the ads mailbox…
    sendEmail({ to: lead.email, replyTo: ADS_EMAIL, ...confirmation }),
    // …and replies from the team go straight back to the advertiser.
    sendEmail({ to: ADS_EMAIL, replyTo: lead.email, ...notification }),
  ]);

  if (!toAdvertiser.ok) {
    console.error(`[ad-inquiry] confirmation email failed: ${toAdvertiser.error}`);
  }
  if (!toTeam.ok) {
    console.error(`[ad-inquiry] team notification failed: ${toTeam.error}`);
  }
  return toTeam.ok;
}
