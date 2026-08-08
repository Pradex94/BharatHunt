import "server-only";

import { SITE_NAME, SITE_URL } from "@/lib/constants";
import { escapeHtml } from "@/lib/email";
import { BRAND, button, layout, type BuiltEmail } from "@/lib/emails/layout";
import { buildShareTargets } from "@/lib/share";
import { indiaStateName } from "@/lib/india-states";

/**
 * The receipt a maker gets the moment their product goes live.
 *
 * Deliberately free of claims we can't back: no projected views, no "your
 * launch is trending", no invented audience size. It states what actually
 * happened, hands over the canonical link, and makes sharing one click — which
 * is the only thing that genuinely moves a launch on day one.
 *
 * Product names and taglines are maker-supplied, so every interpolation is
 * escaped even though the maker is authenticated.
 */

export type LaunchedProduct = {
  name: string;
  tagline: string;
  slug: string;
  category: string;
  /** ISO 3166-2:IN code, when the maker shared one. */
  launchState?: string | null;
};

/** "Pardeep Bisla" → "Pardeep". Falls back to a name-free greeting. */
function firstName(fullName: string | null | undefined): string | null {
  const first = (fullName ?? "").trim().split(/\s+/)[0];
  return first || null;
}

function detailRows(product: LaunchedProduct): Array<[string, string]> {
  const rows: Array<[string, string]> = [
    ["Product", product.name],
    ["Tagline", product.tagline],
    ["Category", product.category],
  ];
  const state = indiaStateName(product.launchState);
  if (state) rows.push(["Launching from", state]);
  return rows;
}

function detailsCard(product: LaunchedProduct): string {
  const rows = detailRows(product)
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:10px 0;vertical-align:top;width:130px;font-size:13px;color:${BRAND.muted};">${escapeHtml(label)}</td>
          <td style="padding:10px 0;vertical-align:top;font-size:14px;color:${BRAND.ink};">${escapeHtml(value)}</td>
        </tr>`,
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid ${BRAND.border};border-collapse:collapse;">${rows}</table>`;
}

/** The three networks worth one tap on launch day, reusing lib/share.ts copy. */
const SHARE_KEYS = ["whatsapp", "x", "linkedin"] as const;

function shareLinks(product: LaunchedProduct, url: string): string {
  const targets = buildShareTargets({ url, name: product.name, tagline: product.tagline });
  const links = SHARE_KEYS.map((key) => {
    const target = targets.find((entry) => entry.key === key);
    if (!target) return "";
    const label = key === "x" ? "X" : key === "whatsapp" ? "WhatsApp" : "LinkedIn";
    return `<a href="${escapeHtml(target.href)}" style="color:${BRAND.primary};text-decoration:none;font-weight:600;">${label}</a>`;
  })
    .filter(Boolean)
    .join(`<span style="color:${BRAND.border};"> &nbsp;·&nbsp; </span>`);

  return `<p style="margin:0 0 4px;font-size:13px;color:${BRAND.muted};">Share it</p>
        <p style="margin:0 0 22px;font-size:14px;">${links}</p>`;
}

const NEXT_STEPS = [
  "It's live in the marketplace now, and listed on your dashboard.",
  "Upvotes and comments appear on the page as they come in.",
  "You can edit any detail from your dashboard — changes go live instantly.",
];

export function buildProductLaunchEmail(
  product: LaunchedProduct,
  makerName?: string | null,
): BuiltEmail {
  const url = `${SITE_URL}/products/${product.slug}`;
  const safeUrl = escapeHtml(url);
  const name = escapeHtml(product.name);
  const greeting = firstName(makerName);

  const heading = `${name} is live`;
  const intro = `${greeting ? `Hi ${escapeHtml(greeting)}, your` : "Your"} product is now published on ${SITE_NAME}. Here's the link to share — it's the canonical page, so every upvote and comment lands in one place.`;

  const steps = NEXT_STEPS.map(
    (step) =>
      `<li style="margin:0 0 6px;font-size:14px;line-height:1.6;color:${BRAND.body};">${step}</li>`,
  ).join("");

  const body = `<p style="margin:0 0 10px;">${button(safeUrl, "View your launch")}</p>
        <p style="margin:0 0 22px;font-size:13px;word-break:break-all;"><a href="${safeUrl}" style="color:${BRAND.primary};text-decoration:none;">${safeUrl}</a></p>
        ${shareLinks(product, url)}
        ${detailsCard(product)}
        <p style="margin:22px 0 8px;font-size:14px;font-weight:700;color:${BRAND.ink};">What happens next</p>
        <ul style="margin:0 0 4px;padding-left:18px;">${steps}</ul>`;

  const footer = `Manage this launch from your <a href="${SITE_URL}/dashboard" style="color:${BRAND.primary};text-decoration:none;">dashboard</a>.<br />${SITE_NAME} · <a href="${SITE_URL}" style="color:${BRAND.primary};text-decoration:none;">${escapeHtml(SITE_URL.replace(/^https?:\/\//, ""))}</a>`;

  return {
    subject: `${product.name} is live on ${SITE_NAME}`,
    html: layout(heading, intro, body, footer),
    text: [
      greeting ? `Hi ${greeting},` : "Hi,",
      "",
      `${product.name} is now published on ${SITE_NAME}. Here's the link to share:`,
      url,
      "",
      ...detailRows(product).map(([label, value]) => `${label}: ${value}`),
      "",
      "What happens next",
      ...NEXT_STEPS.map((step) => `- ${step.replace(/—/g, "-")}`),
      "",
      `Manage this launch from your dashboard: ${SITE_URL}/dashboard`,
      SITE_URL,
    ].join("\n"),
  };
}
