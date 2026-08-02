import "server-only";

import { ADS_EMAIL, SITE_NAME } from "@/lib/constants";

/**
 * Transactional email over the Sendgrove Unified API (v2) — plain `fetch`, no
 * SDK, so there's nothing to install and it runs on both the Node and Edge
 * runtimes.
 *
 * Contract (from https://api.sendgrove.com/api/v2/openapi.json):
 *   POST /api/v2/emails
 *   X-API-Key: <keyId>:<keySecret>
 *   { to: string | string[], subject, html?, text?, from?, fromName? }
 *   → { data: { successful, failed, results: [{ to, success, messageId }] } }
 *
 * Configure with `SENDGROVE_API_KEY` and `EMAIL_FROM`. **The `from` address must
 * be verified individually** under Senders & Domains — authenticating the
 * bharathunt.org domain is explicitly not sufficient, and an unverified sender
 * comes back as 403 FORBIDDEN.
 *
 * Every send is **fail-open**, the same contract as `lib/cache.ts`: a missing
 * key, an unverified sender, or a timeout is reported back to the caller and
 * logged, never thrown — a form submission is never lost because email is down.
 */

const SENDGROVE_ENDPOINT = "https://api.sendgrove.com/api/v2/emails";
const SEND_TIMEOUT_MS = 15_000;

/** Default envelope sender — must be a verified sender on the account. */
const DEFAULT_FROM = process.env.EMAIL_FROM ?? `${SITE_NAME} <${ADS_EMAIL}>`;

/**
 * Optional stand-in used only when `EMAIL_FROM` is rejected as unverified.
 * Verifying a new sender takes an OTP round trip, and leads shouldn't go
 * unanswered in the meantime — so we retry once from an address that is
 * already verified, and log loudly that we did.
 */
const FALLBACK_FROM = process.env.EMAIL_FALLBACK_FROM;

/** Sendgrove's 403 for a `from` address that hasn't completed OTP verification. */
function isUnverifiedSender(error: string): boolean {
  return /not verified in your profile/i.test(error);
}

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  /**
   * Where replies should land. Sendgrove's documented v2 schema doesn't list a
   * reply-to field, so this is passed through best-effort and may be ignored —
   * replies then go to the `from` address.
   */
  replyTo?: string;
  /** Overrides `EMAIL_FROM`; must be a verified sender. */
  from?: string;
};

export type SendEmailResult = { ok: true; id: string | null } | { ok: false; error: string };

/** Splits `"Bharat Hunt <ads@bharathunt.org>"` into its name and address. */
function parseSender(value: string): { email: string; name?: string } {
  const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(value);
  if (match) {
    const name = match[1].replace(/^"|"$/g, "").trim();
    return { email: match[2].trim(), name: name || undefined };
  }
  return { email: value.trim() };
}

/** Whether an email backend is configured (useful for diagnostics). */
export function isEmailEnabled(): boolean {
  return Boolean(process.env.SENDGROVE_API_KEY);
}

/** Pulls the human-readable message out of Sendgrove's error envelope. */
function describeFailure(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { code?: string; message?: string } };
    if (parsed.error?.message) {
      return parsed.error.code
        ? `${parsed.error.code}: ${parsed.error.message}`
        : parsed.error.message;
    }
  } catch {
    // Not JSON — fall through to the raw body.
  }
  return `Sendgrove responded with ${status}. ${body.slice(0, 200)}`.trim();
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const from = input.from ?? DEFAULT_FROM;
  const first = await deliver(input, from);
  if (first.ok || !FALLBACK_FROM || !isUnverifiedSender(first.error)) return first;

  console.warn(
    `[email] "${from}" isn't a verified Sendgrove sender — retrying as "${FALLBACK_FROM}". ` +
      "Verify the intended address under Senders & Domains to stop this fallback.",
  );
  return deliver(input, FALLBACK_FROM);
}

async function deliver(
  { to, subject, html, text, replyTo }: SendEmailInput,
  from: string,
): Promise<SendEmailResult> {
  const apiKey = process.env.SENDGROVE_API_KEY;
  if (!apiKey) {
    // Not configured (local dev, preview builds) — say so instead of pretending.
    return { ok: false, error: "SENDGROVE_API_KEY is not set — email was not sent." };
  }

  const sender = parseSender(from);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

  try {
    const response = await fetch(SENDGROVE_ENDPOINT, {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        to,
        subject,
        html,
        text,
        from: sender.email,
        fromName: sender.name,
        replyTo,
      }),
      signal: controller.signal,
    });

    const raw = await response.text();
    if (!response.ok) {
      return { ok: false, error: describeFailure(response.status, raw) };
    }

    const parsed = JSON.parse(raw) as {
      data?: { failed?: number; results?: Array<{ success?: boolean; messageId?: string; error?: string }> };
    };
    const results = parsed.data?.results ?? [];
    // A 200 still reports per-recipient outcomes; treat a total failure as one.
    if (parsed.data?.failed && results.every((entry) => !entry.success)) {
      return { ok: false, error: results[0]?.error ?? "Sendgrove rejected every recipient." };
    }
    return { ok: true, id: results.find((entry) => entry.messageId)?.messageId ?? null };
  } catch (error) {
    const reason =
      error instanceof Error && error.name === "AbortError"
        ? "Timed out talking to Sendgrove."
        : error instanceof Error
          ? error.message
          : "Unknown email error.";
    return { ok: false, error: reason };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Confirms the account is reachable and the key is valid without sending
 * anything — handy for a health check or a setup script.
 */
export async function verifyEmailTransport(): Promise<SendEmailResult> {
  const apiKey = process.env.SENDGROVE_API_KEY;
  if (!apiKey) return { ok: false, error: "SENDGROVE_API_KEY is not set." };
  try {
    const response = await fetch("https://api.sendgrove.com/api/v2/account", {
      headers: { "X-API-Key": apiKey, Accept: "application/json" },
    });
    const raw = await response.text();
    if (!response.ok) return { ok: false, error: describeFailure(response.status, raw) };
    return { ok: true, id: null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Verify failed." };
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
