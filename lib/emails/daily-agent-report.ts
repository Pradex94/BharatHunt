import "server-only";

import { SITE_URL } from "@/lib/constants";
import { escapeHtml } from "@/lib/email";
import { BRAND, button, layout, type BuiltEmail } from "@/lib/emails/layout";

/**
 * The admin's daily summary: what the Daily 5 agent found and what is waiting.
 * Everything interpolated came off third-party websites, so all of it is
 * escaped — `layout()` treats its arguments as trusted HTML.
 */

export type ReportItem = {
  name: string;
  website: string | null;
  status: string;
  overallScore: number | null;
  indiaConfidence: number | null;
  category: string | null;
};

export function buildDailyAgentReportEmail(input: {
  label: string;
  batchDate: string;
  target: number;
  selected: number;
  published: number;
  pendingReview: number;
  shortfall: string | null;
  sourceFailures: string[];
  items: ReportItem[];
}): BuiltEmail {
  const subject = `${input.label} completed — ${input.selected} selected, ${input.published} published, ${input.pendingReview} pending review`;
  const dashboard = `${SITE_URL}/admin/daily-agent`;

  const rows = input.items
    .map(
      (item) => `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #eee;">
          <strong>${escapeHtml(item.name)}</strong><br>
          <span style="color:#666;font-size:13px;">${escapeHtml(item.category ?? "Uncategorised")} · India ${item.indiaConfidence ?? "—"} · Score ${item.overallScore ?? "—"}</span>
          ${item.website ? `<br><a href="${escapeHtml(item.website)}" style="color:${BRAND.primary};font-size:13px;">${escapeHtml(item.website)}</a>` : ""}
        </td>
        <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;font-size:13px;color:#444;">${escapeHtml(item.status.replace(/_/g, " "))}</td>
      </tr>`,
    )
    .join("");

  const failures = input.sourceFailures.length
    ? `<p style="color:#a15c00;font-size:13px;">Sources that failed this run: ${escapeHtml(input.sourceFailures.join(", "))}. The rest carried on.</p>`
    : "";

  const body = `
    ${input.shortfall ? `<p><strong>${escapeHtml(input.shortfall)}</strong> The agent does not fill the list with unverified products.</p>` : ""}
    <table style="width:100%;border-collapse:collapse;">${rows || `<tr><td>No products were selected.</td></tr>`}</table>
    ${failures}
    ${button(dashboard, "Review in the dashboard")}`;

  const html = layout(
    `${escapeHtml(input.label)} — ${escapeHtml(input.batchDate)}`,
    `Target ${input.target} · ${input.selected} selected · ${input.published} published · ${input.pendingReview} pending review`,
    body,
    "You receive this because you are a BharatHunt admin.",
  );

  const text = [
    `${input.label} completed (${input.batchDate})`,
    "",
    `${input.selected} selected`,
    `${input.published} published`,
    `${input.pendingReview} pending review`,
    input.shortfall ?? "",
    "",
    ...input.items.map(
      (item) => `- ${item.name} (${item.status.replace(/_/g, " ")}) — India ${item.indiaConfidence ?? "?"}, score ${item.overallScore ?? "?"}${item.website ? ` — ${item.website}` : ""}`,
    ),
    "",
    `Review: ${dashboard}`,
  ].join("\n");

  return { subject, html, text };
}
