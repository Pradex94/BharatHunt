"use server";

/**
 * Stores an "advertise with us" lead from the /advertise page, then emails both
 * sides: a confirmation to the advertiser and a notification to the ads mailbox.
 *
 * Requires the `ad_inquiries` table (see db/ad_inquiries.sql). Anyone — including
 * logged-out visitors — may submit, so the RLS insert policy is `with check
 * (true)`; there is no select policy, so inquiries are readable only via the
 * service role (e.g. the Supabase dashboard).
 *
 * The database write is the source of truth: if it fails the visitor is told to
 * email us instead. Email is best-effort on top — a Resend outage (or a missing
 * `RESEND_API_KEY` in local dev) is logged, never surfaced, because the lead is
 * already safely stored.
 */

import { createClient } from "@/lib/supabase/server";
import { ADS_EMAIL } from "@/lib/constants";
import { sendEmail } from "@/lib/email";
import {
  buildAdInquiryConfirmation,
  buildAdInquiryNotification,
  type AdInquiryLead,
} from "@/lib/emails/ad-inquiry";

export type AdInquiryState = { ok?: boolean; error?: string } | undefined;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function submitAdInquiry(
  _prevState: AdInquiryState,
  formData: FormData,
): Promise<AdInquiryState> {
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

  const supabase = createClient();
  const { error } = await supabase.from("ad_inquiries").insert(lead);

  if (error) {
    console.error("[ad-inquiry] could not store lead:", error.message);
    return { error: `Couldn't send your inquiry. Please email ${ADS_EMAIL} instead.` };
  }

  await notify(lead);

  return { ok: true };
}

/**
 * Confirmation to the advertiser + notification to the ads mailbox, in
 * parallel. Failures are logged and swallowed — the lead is already stored, so
 * a mail problem must never turn into an error for the visitor.
 */
async function notify(lead: AdInquiryLead): Promise<void> {
  const confirmation = buildAdInquiryConfirmation(lead);
  const notification = buildAdInquiryNotification(lead);

  const results = await Promise.all([
    // Replies from the advertiser go to the ads mailbox…
    sendEmail({ to: lead.email, replyTo: ADS_EMAIL, ...confirmation }),
    // …and replies from the team go straight back to the advertiser.
    sendEmail({ to: ADS_EMAIL, replyTo: lead.email, ...notification }),
  ]);

  for (const [index, result] of results.entries()) {
    if (!result.ok) {
      const kind = index === 0 ? "confirmation" : "team notification";
      console.error(`[ad-inquiry] ${kind} email failed: ${result.error}`);
    }
  }
}
