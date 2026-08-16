import "server-only";

import { SITE_NAME, SITE_URL } from "@/lib/constants";
import { escapeHtml } from "@/lib/email";
import { BRAND, button, layout, type BuiltEmail } from "@/lib/emails/layout";

/**
 * The one email a newsletter signup produces: a welcome that confirms the
 * address actually landed somewhere.
 *
 * It exists mostly as proof. A subscribe button that only changes colour tells
 * the visitor nothing about whether it worked — this is what makes the promise
 * on the form ("straight to your inbox") verifiable on the spot.
 *
 * The shell lives in lib/emails/layout.ts. The address is escaped: it comes
 * from a public, unauthenticated form.
 */
export function buildNewsletterWelcome(email: string): BuiltEmail {
  const heading = "You're on the list";
  const intro = `Thanks for subscribing to ${escapeHtml(
    SITE_NAME,
  )}. You'll get the best new Indian product launches, straight to your inbox — no more often than they're worth reading.`;

  const body = `
    <p style="margin:0 0 22px;font-size:14px;line-height:1.6;color:${BRAND.body};">
      In the meantime, the marketplace is where everything lands first.
    </p>
    <p style="margin:0 0 8px;">${button(`${SITE_URL}/marketplace`, "Browse the marketplace")}</p>
    <p style="margin:0 0 22px;font-size:13px;line-height:1.6;color:${BRAND.muted};">
      ${SITE_URL}/marketplace
    </p>`;

  const footer = `You're receiving this because ${escapeHtml(
    email,
  )} was entered on ${escapeHtml(SITE_NAME)}. If that wasn't you, ignore this email and you won't hear from us again.`;

  const text = [
    "You're on the list",
    "",
    `Thanks for subscribing to ${SITE_NAME}. You'll get the best new Indian product launches, straight to your inbox.`,
    "",
    `Browse the marketplace: ${SITE_URL}/marketplace`,
    "",
    `You're receiving this because ${email} was entered on ${SITE_NAME}. If that wasn't you, ignore this email.`,
  ].join("\n");

  return {
    subject: `You're subscribed to ${SITE_NAME}`,
    html: layout(heading, intro, body, footer),
    text,
  };
}
