"use server";

/**
 * Stores an "advertise with us" lead from the /advertise page.
 *
 * Requires the `ad_inquiries` table (see db/ad_inquiries.sql). Anyone — including
 * logged-out visitors — may submit, so the RLS insert policy is `with check
 * (true)`; there is no select policy, so inquiries are readable only via the
 * service role (e.g. the Supabase dashboard).
 */

import { createClient } from "@/lib/supabase/server";

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

  const supabase = createClient();
  const { error } = await supabase.from("ad_inquiries").insert({
    name,
    email,
    company: company || null,
    package: pkg || null,
    message: message || null,
  });

  if (error) {
    return { error: "Couldn't send your inquiry. Please email ads@bharathunt.com instead." };
  }

  return { ok: true };
}
