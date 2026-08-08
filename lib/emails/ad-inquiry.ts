import "server-only";

import { ADS_EMAIL, SITE_NAME, SITE_URL } from "@/lib/constants";
import { escapeHtml } from "@/lib/email";
import { BRAND, layout, type BuiltEmail } from "@/lib/emails/layout";

/**
 * The two emails an /advertise lead produces: a confirmation for the advertiser
 * (so they have a record of what they sent) and a notification for the ads
 * mailbox (so a lead is never sitting unseen in the database).
 *
 * The shell lives in lib/emails/layout.ts. Every interpolated value is escaped:
 * these are attacker-controlled strings from a public, unauthenticated form.
 */

export type AdInquiryLead = {
  name: string;
  email: string;
  company: string | null;
  package: string | null;
  message: string | null;
};

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
