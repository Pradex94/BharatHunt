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
 * Storage and email are treated as two independent capture paths rather than a
 * source of truth plus a nicety: whichever succeeds, the lead is safe, and the
 * visitor only sees a failure when both are down. Anything that failed is
 * logged for the operator.
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

  // A lead is captured two independent ways: the database and the ads mailbox.
  // The visitor sees an error only if BOTH fail — a missing table or a mail
  // outage on its own must never cost us the lead (it already did once, when
  // ad_inquiries hadn't been migrated and the insert was the only path).
  const [stored, notified] = await Promise.all([storeLead(lead), notify(lead)]);

  if (!stored && !notified) {
    return { error: `Couldn't send your inquiry. Please email ${ADS_EMAIL} instead.` };
  }
  if (!stored) {
    console.error(
      "[ad-inquiry] lead delivered by email only — apply db/ad_inquiries.sql to restore storage.",
    );
  }

  return { ok: true };
}

/** Writes the lead to Supabase. Returns whether it landed. */
async function storeLead(lead: AdInquiryLead): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase.from("ad_inquiries").insert(lead);
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
