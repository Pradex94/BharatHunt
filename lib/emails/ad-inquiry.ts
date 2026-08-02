import "server-only";

import { ADS_EMAIL, SITE_NAME, SITE_URL } from "@/lib/constants";
import { escapeHtml } from "@/lib/email";

/**
 * The two emails an /advertise lead produces: a confirmation for the advertiser
 * (so they have a record of what they sent) and a notification for the ads
 * mailbox (so a lead is never sitting unseen in the database).
 *
 * Hand-written table-free HTML with inline styles — email clients strip
 * <style> blocks and don't know Tailwind — using the brand palette from
 * app/globals.css. Every interpolated value is escaped: these are
 * attacker-controlled strings from a public, unauthenticated form.
 */

const BRAND = {
  primary: "#ff6b1a",
  ink: "#17140f",
  body: "#4b5563",
  muted: "#6b7280",
  border: "#efe6dd",
  softBg: "#fdf2ea",
} as const;

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, Helvetica, Arial, sans-serif";

export type AdInquiryLead = {
  name: string;
  email: string;
  company: string | null;
  package: string | null;
  message: string | null;
};

export type BuiltEmail = { subject: string; html: string; text: string };

const NOT_SPECIFIED = "Not specified";
const NO_PREFERENCE = "Not sure yet — asked for a recommendation";

/** Label/value rows, shared by both emails so they always show the same facts. */
function leadRows(lead: AdInquiryLead): Array<[string, string]> {
  return [
    ["Name", lead.name],
    ["Work email", lead.email],
    ["Company", lead.company || NOT_SPECIFIED],
    ["Interested in", lead.package || NO_PREFERENCE],
    ["What they're promoting", lead.message || NOT_SPECIFIED],
  ];
}

function detailsHtml(lead: AdInquiryLead): string {
  return leadRows(lead)
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:10px 0;vertical-align:top;width:170px;font-size:13px;color:${BRAND.muted};">${escapeHtml(label)}</td>
          <td style="padding:10px 0;vertical-align:top;font-size:14px;color:${BRAND.ink};white-space:pre-wrap;">${escapeHtml(value)}</td>
        </tr>`,
    )
    .join("");
}

function detailsText(lead: AdInquiryLead): string {
  return leadRows(lead)
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n");
}

/** Shared shell: white card, orange rule, footer. `body` is trusted HTML. */
function layout(heading: string, intro: string, body: string, footer: string): string {
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px 12px;background:${BRAND.softBg};font-family:${FONT};">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid ${BRAND.border};border-radius:16px;overflow:hidden;">
      <div style="height:4px;background:${BRAND.primary};"></div>
      <div style="padding:28px 28px 8px;">
        <p style="margin:0 0 18px;font-size:15px;font-weight:700;color:${BRAND.primary};letter-spacing:-0.01em;">${SITE_NAME}</p>
        <h1 style="margin:0 0 10px;font-size:20px;line-height:1.3;font-weight:700;color:${BRAND.ink};letter-spacing:-0.02em;">${heading}</h1>
        <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:${BRAND.body};">${intro}</p>
        ${body}
      </div>
      <div style="padding:18px 28px 26px;">
        <p style="margin:0;font-size:12px;line-height:1.6;color:${BRAND.muted};">${footer}</p>
      </div>
    </div>
  </body>
</html>`;
}

function detailsCard(lead: AdInquiryLead): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid ${BRAND.border};border-collapse:collapse;">
          ${detailsHtml(lead)}
        </table>`;
}

/** Sent to the advertiser — their receipt for what they submitted. */
export function buildAdInquiryConfirmation(lead: AdInquiryLead): BuiltEmail {
  const heading = "Thanks — we've got your inquiry";
  const intro = `Hi ${escapeHtml(lead.name)}, thanks for your interest in advertising on ${SITE_NAME}. Our team typically replies within two business days with the options that fit your goals. Here's what you sent us:`;
  const footer = `Need to add something? Just reply to this email — it reaches us at ${ADS_EMAIL}.<br />${SITE_NAME} · <a href="${SITE_URL}" style="color:${BRAND.primary};text-decoration:none;">${SITE_URL.replace(/^https?:\/\//, "")}</a>`;

  return {
    subject: `We've got your ${SITE_NAME} ad inquiry`,
    html: layout(heading, intro, detailsCard(lead), footer),
    text: [
      `Hi ${lead.name},`,
      "",
      `Thanks for your interest in advertising on ${SITE_NAME}. Our team typically replies within two business days with the options that fit your goals.`,
      "",
      "Here's what you sent us:",
      detailsText(lead),
      "",
      `Need to add something? Just reply to this email — it reaches us at ${ADS_EMAIL}.`,
      SITE_URL,
    ].join("\n"),
  };
}

/** Sent to the ads mailbox — reply-to is set to the advertiser. */
export function buildAdInquiryNotification(lead: AdInquiryLead): BuiltEmail {
  const who = lead.company ? `${lead.name} (${lead.company})` : lead.name;
  const heading = "New advertising inquiry";
  const intro = `${escapeHtml(who)} just submitted the /advertise form. Hit reply to answer them directly.`;
  const footer = "Stored in the <code>ad_inquiries</code> table in Supabase.";

  return {
    subject: `New ad inquiry — ${who}`,
    html: layout(heading, intro, detailsCard(lead), footer),
    text: [
      `${who} just submitted the /advertise form.`,
      "",
      detailsText(lead),
      "",
      "Stored in the ad_inquiries table in Supabase.",
    ].join("\n"),
  };
}
