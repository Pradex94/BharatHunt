import "server-only";

import nodemailer, { type Transporter } from "nodemailer";

import { ADS_EMAIL, SITE_NAME } from "@/lib/constants";

/**
 * Transactional email over SMTP (nodemailer).
 *
 * Configure with `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and
 * `EMAIL_FROM`. Port 465 is treated as implicit TLS; anything else (587, 2525)
 * connects in the clear and upgrades via STARTTLS, which is what most relays
 * expect. The `from` address has to be a sender your relay is allowed to send
 * for — for us that's `ads@bharathunt.org`.
 *
 * Every send is **fail-open**, the same contract as `lib/cache.ts`: missing
 * config, a rejected login, or a timeout is reported back to the caller and
 * logged, never thrown — a form submission is never lost because email is down.
 *
 * Swapping to an HTTP provider (Resend/Postmark/SES) means rewriting
 * `sendEmail` only; callers just hand over `{ to, subject, html, text }`.
 */

const SEND_TIMEOUT_MS = 15_000;

/** Default envelope sender — must be a verified sender on the relay. */
const DEFAULT_FROM = process.env.EMAIL_FROM ?? `${SITE_NAME} <${ADS_EMAIL}>`;

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  /** Where replies land — usually the human who should answer. */
  replyTo?: string;
  /** Overrides `EMAIL_FROM`; must be a sender the relay accepts. */
  from?: string;
};

export type SendEmailResult = { ok: true; id: string | null } | { ok: false; error: string };

type SmtpConfig = { host: string; port: number; user: string; pass: string };

function readConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  return { host, user, pass, port: Number(process.env.SMTP_PORT ?? 587) };
}

// Reused across invocations so a warm lambda keeps its connection pool.
let transporter: Transporter | null | undefined; // undefined = not yet resolved

function getTransport(): Transporter | null {
  if (transporter !== undefined) return transporter;
  const config = readConfig();
  transporter = config
    ? nodemailer.createTransport({
        host: config.host,
        port: config.port,
        // 465 is implicit TLS; 587/2525 start plain and STARTTLS up.
        secure: config.port === 465,
        auth: { user: config.user, pass: config.pass },
        connectionTimeout: SEND_TIMEOUT_MS,
        greetingTimeout: SEND_TIMEOUT_MS,
        socketTimeout: SEND_TIMEOUT_MS,
      })
    : null;
  return transporter;
}

/** Whether an SMTP backend is configured (useful for diagnostics). */
export function isEmailEnabled(): boolean {
  return getTransport() !== null;
}

/**
 * Opens a connection and authenticates without sending anything — handy for
 * checking credentials from a script or a health check.
 */
export async function verifyEmailTransport(): Promise<SendEmailResult> {
  const transport = getTransport();
  if (!transport) return { ok: false, error: "SMTP_HOST/SMTP_USER/SMTP_PASS are not set." };
  try {
    await transport.verify();
    return { ok: true, id: null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "SMTP verify failed." };
  }
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
  replyTo,
  from = DEFAULT_FROM,
}: SendEmailInput): Promise<SendEmailResult> {
  const transport = getTransport();
  if (!transport) {
    // Not configured (local dev, preview builds) — say so instead of pretending.
    return { ok: false, error: "SMTP is not configured — email was not sent." };
  }

  try {
    const info = await transport.sendMail({ from, to, subject, html, text, replyTo });
    return { ok: true, id: info.messageId ?? null };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown SMTP error.",
    };
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
