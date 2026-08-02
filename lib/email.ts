import "server-only";

import { ADS_EMAIL, SITE_NAME } from "@/lib/constants";

/**
 * Transactional email over the Resend HTTP API — plain `fetch`, no SDK, so
 * there's nothing to install and it runs on both the Node and Edge runtimes.
 *
 * Configure with `RESEND_API_KEY`; override the sender with `EMAIL_FROM`. The
 * sending domain has to be verified in Resend before mail from
 * `ads@bharathunt.org` will actually deliver.
 *
 * Every send is **fail-open**, the same contract as `lib/cache.ts`: a missing
 * key, a provider outage, or a timeout is reported back to the caller and
 * logged, never thrown — a form submission is never lost because email is down.
 *
 * Swapping providers (SMTP/Postmark/SES) means rewriting `sendEmail` only;
 * callers just hand over `{ to, subject, html, text }`.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const SEND_TIMEOUT_MS = 10_000;

/** Default envelope sender — a verified address on the Bharat Hunt domain. */
const DEFAULT_FROM = process.env.EMAIL_FROM ?? `${SITE_NAME} <${ADS_EMAIL}>`;

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  /** Where replies land — usually the human who should answer. */
  replyTo?: string;
  /** Overrides `EMAIL_FROM`; must be a Resend-verified sender. */
  from?: string;
};

export type SendEmailResult = { ok: true; id: string | null } | { ok: false; error: string };

/** Whether an email backend is configured (useful for diagnostics). */
export function isEmailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
  replyTo,
  from = DEFAULT_FROM,
}: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Not configured (local dev, preview builds) — say so instead of pretending.
    return { ok: false, error: "RESEND_API_KEY is not set — email was not sent." };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      // Resend's REST field is `reply_to` (snake_case), unlike the Node SDK.
      body: JSON.stringify({ from, to, subject, html, text, reply_to: replyTo }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return { ok: false, error: `Resend responded with ${response.status}. ${detail}`.trim() };
    }

    const data = (await response.json().catch(() => null)) as { id?: string } | null;
    return { ok: true, id: data?.id ?? null };
  } catch (error) {
    const reason =
      error instanceof Error && error.name === "AbortError"
        ? "Timed out talking to Resend."
        : error instanceof Error
          ? error.message
          : "Unknown email error.";
    return { ok: false, error: reason };
  } finally {
    clearTimeout(timer);
  }
}

/** Escapes user-supplied text before it goes into an HTML email body. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
