import "server-only";

import { SITE_NAME, SITE_URL } from "@/lib/constants";
import { escapeHtml } from "@/lib/email";
import { BRAND, button, layout, type BuiltEmail } from "@/lib/emails/layout";
import { indiaStateName } from "@/lib/india-states";

/**
 * The three mails the review queue sends.
 *
 * `buildLaunchReviewEmail` is the one the feature exists for: it lands in the
 * admin inbox when a maker submits, and has to be decidable on the phone screen
 * it is read on. So it carries the whole submission — the copy, the links, who
 * wrote it — rather than a "you have a new submission" notice that forces a trip
 * to the dashboard before anything can be judged.
 *
 * The other two close the loop with the maker: an acknowledgement, so a
 * submission never disappears into silence, and a rejection that says what to do
 * next rather than only that the answer was no.
 *
 * Everything interpolated is maker-supplied and every field is escaped —
 * including into `href` attributes, where an unescaped quote would end the
 * attribute. `layout()` treats its arguments as trusted HTML, so escaping is
 * this file's job.
 */

export type ReviewedProduct = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description?: string | null;
  category: string;
  pricingType?: string | null;
  websiteUrl?: string | null;
  githubUrl?: string | null;
  launchState?: string | null;
};

export type ReviewLinks = {
  /** One-click approve, when a signing secret is configured. */
  approveUrl?: string | null;
  /** One-click reject, when a signing secret is configured. */
  rejectUrl?: string | null;
  /** Always present: the queue itself, behind the admin login. */
  queueUrl: string;
};

/** "Pardeep Bisla" → "Pardeep". Falls back to a name-free greeting. */
function firstName(fullName: string | null | undefined): string | null {
  const first = (fullName ?? "").trim().split(/\s+/)[0];
  return first || null;
}

function rows(product: ReviewedProduct, maker: string | null): Array<[string, string]> {
  const list: Array<[string, string]> = [
    ["Product", product.name],
    ["Tagline", product.tagline],
    ["Category", product.category],
  ];
  if (product.pricingType) list.push(["Pricing", product.pricingType]);
  if (maker) list.push(["Maker", maker]);
  const state = indiaStateName(product.launchState);
  if (state) list.push(["Launching from", state]);
  if (product.websiteUrl) list.push(["Website", product.websiteUrl]);
  if (product.githubUrl) list.push(["GitHub", product.githubUrl]);
  return list;
}

/** Link values render as links, everything else as text. Both escaped. */
function detailsCard(entries: Array<[string, string]>): string {
  const body = entries
    .map(([label, value]) => {
      const safe = escapeHtml(value);
      const rendered = /^https?:\/\//i.test(value)
        ? `<a href="${safe}" style="color:${BRAND.primary};text-decoration:none;word-break:break-all;">${safe}</a>`
        : safe;
      return `
        <tr>
          <td style="padding:10px 0;vertical-align:top;width:130px;font-size:13px;color:${BRAND.muted};">${escapeHtml(label)}</td>
          <td style="padding:10px 0;vertical-align:top;font-size:14px;color:${BRAND.ink};">${rendered}</td>
        </tr>`;
    })
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid ${BRAND.border};border-collapse:collapse;">${body}</table>`;
}

/** The maker's own words, trimmed to what a reviewer reads before deciding. */
function descriptionBlock(description: string | null | undefined): string {
  const text = (description ?? "").trim();
  if (!text) return "";
  const excerpt = text.length > 600 ? `${text.slice(0, 600)}…` : text;
  return `<p style="margin:18px 0 0;font-size:13px;color:${BRAND.muted};">Description</p>
        <div style="margin:6px 0 0;padding:14px 16px;background:${BRAND.softBg};border-radius:10px;font-size:14px;line-height:1.6;color:${BRAND.body};white-space:pre-wrap;">${escapeHtml(excerpt)}</div>`;
}

/**
 * A secondary, outlined button. `button()` is the orange primary; the reject
 * action beside it has to be as reachable but visibly not the default.
 */
function secondaryButton(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;padding:11px 20px;border:1px solid ${BRAND.border};color:${BRAND.body};font-size:14px;font-weight:600;text-decoration:none;border-radius:10px;">${label}</a>`;
}

export function buildLaunchReviewEmail(
  product: ReviewedProduct,
  makerName: string | null,
  links: ReviewLinks,
): BuiltEmail {
  const name = escapeHtml(product.name);
  const oneClick = Boolean(links.approveUrl && links.rejectUrl);
  const queueUrl = escapeHtml(links.queueUrl);

  const heading = `${name} is waiting for review`;
  const intro = oneClick
    ? "A maker just submitted a launch. Approving publishes it immediately; sending it back returns it to their drafts with a note."
    : "A maker just submitted a launch. Open the queue to approve or send it back — the one-click links need <code>ADMIN_REVIEW_SECRET</code> configured.";

  const actions = oneClick
    ? `<p style="margin:0 0 22px;">${button(escapeHtml(links.approveUrl ?? ""), "Approve and publish")}
        <span style="display:inline-block;width:10px;"></span>
        ${secondaryButton(escapeHtml(links.rejectUrl ?? ""), "Send back")}</p>`
    : `<p style="margin:0 0 22px;">${button(queueUrl, "Open the review queue")}</p>`;

  const body = `${actions}
        ${detailsCard(rows(product, makerName))}
        ${descriptionBlock(product.description)}
        <p style="margin:22px 0 0;font-size:13px;color:${BRAND.muted};">Nothing is published until you act.${oneClick ? " Both links expire in 7 days." : ""}</p>`;

  const footer = `Everything pending is in the <a href="${queueUrl}" style="color:${BRAND.primary};text-decoration:none;">admin queue</a>.<br />${SITE_NAME} · <a href="${SITE_URL}" style="color:${BRAND.primary};text-decoration:none;">${escapeHtml(SITE_URL.replace(/^https?:\/\//, ""))}</a>`;

  return {
    subject: `Review: ${product.name}`,
    html: layout(heading, intro, body, footer),
    text: [
      `${product.name} is waiting for review on ${SITE_NAME}.`,
      "",
      ...rows(product, makerName).map(([label, value]) => `${label}: ${value}`),
      "",
      ...(oneClick ? [`Approve: ${links.approveUrl}`, `Send back: ${links.rejectUrl}`, ""] : []),
      `Review queue: ${links.queueUrl}`,
      "",
      "Nothing is published until you act.",
    ].join("\n"),
  };
}

export function buildSubmissionAckEmail(
  product: Pick<ReviewedProduct, "name" | "tagline">,
  makerName: string | null,
): BuiltEmail {
  const greeting = firstName(makerName);
  const name = escapeHtml(product.name);

  const heading = `${name} is in review`;
  const intro = `${greeting ? `Hi ${escapeHtml(greeting)}, thanks` : "Thanks"} for launching on ${SITE_NAME}. Every launch is read by a person before it goes live, so ${name} is in the queue now — you'll get an email the moment it's published.`;

  const body = `<p style="margin:0 0 22px;">${button(`${SITE_URL}/dashboard`, "View your dashboard")}</p>
        <p style="margin:0 0 6px;font-size:14px;font-weight:700;color:${BRAND.ink};">While you wait</p>
        <ul style="margin:0;padding-left:18px;">
          <li style="margin:0 0 6px;font-size:14px;line-height:1.6;color:${BRAND.body};">You can keep editing from your dashboard — the reviewer sees the latest version.</li>
          <li style="margin:0 0 6px;font-size:14px;line-height:1.6;color:${BRAND.body};">The page isn't public yet, so there is nothing to share until it's approved.</li>
        </ul>`;

  const footer = `${SITE_NAME} · <a href="${SITE_URL}" style="color:${BRAND.primary};text-decoration:none;">${escapeHtml(SITE_URL.replace(/^https?:\/\//, ""))}</a>`;

  return {
    subject: `${product.name} is in review`,
    html: layout(heading, intro, body, footer),
    text: [
      greeting ? `Hi ${greeting},` : "Hi,",
      "",
      `Thanks for launching on ${SITE_NAME}. Every launch is read by a person before it goes live, so ${product.name} is in the queue now — you'll get an email the moment it's published.`,
      "",
      `Your dashboard: ${SITE_URL}/dashboard`,
    ].join("\n"),
  };
}

export function buildLaunchRejectedEmail(
  product: Pick<ReviewedProduct, "name" | "slug">,
  makerName: string | null,
  note?: string | null,
): BuiltEmail {
  const greeting = firstName(makerName);
  const name = escapeHtml(product.name);
  const reason = (note ?? "").trim();
  const editUrl = `${SITE_URL}/products/${encodeURIComponent(product.slug)}/edit`;

  const heading = `${name} needs a change before it goes live`;
  const intro = `${greeting ? `Hi ${escapeHtml(greeting)}, thanks` : "Thanks"} for submitting ${name} to ${SITE_NAME}. It isn't published yet — it's back in your drafts so you can revise it and send it in again.`;

  const reasonBlock = reason
    ? `<p style="margin:0 0 6px;font-size:13px;color:${BRAND.muted};">What to change</p>
        <div style="margin:0 0 22px;padding:14px 16px;background:${BRAND.softBg};border-radius:10px;font-size:14px;line-height:1.6;color:${BRAND.body};white-space:pre-wrap;">${escapeHtml(reason)}</div>`
    : "";

  const body = `${reasonBlock}
        <p style="margin:0 0 22px;">${button(escapeHtml(editUrl), "Edit and resubmit")}</p>
        <p style="margin:0;font-size:14px;line-height:1.6;color:${BRAND.body};">Nothing was deleted. Your draft, its images and every detail are where you left them.</p>`;

  const footer = `${SITE_NAME} · <a href="${SITE_URL}" style="color:${BRAND.primary};text-decoration:none;">${escapeHtml(SITE_URL.replace(/^https?:\/\//, ""))}</a>`;

  return {
    subject: `${product.name} needs a change before it goes live`,
    html: layout(heading, intro, body, footer),
    text: [
      greeting ? `Hi ${greeting},` : "Hi,",
      "",
      `${product.name} isn't published yet — it's back in your drafts so you can revise it and send it in again.`,
      ...(reason ? ["", "What to change:", reason] : []),
      "",
      `Edit and resubmit: ${editUrl}`,
    ].join("\n"),
  };
}
