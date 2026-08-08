import "server-only";

import { SITE_NAME } from "@/lib/constants";

/**
 * The shared shell every transactional email is built in.
 *
 * Hand-written table-free HTML with inline styles — email clients strip
 * <style> blocks and don't know Tailwind — using the brand palette from
 * app/globals.css. Extracted from lib/emails/ad-inquiry.ts so a second
 * template can't quietly drift into a second visual identity.
 *
 * Callers are responsible for escaping every interpolated value: `heading`,
 * `intro`, `body` and `footer` are all inserted as trusted HTML.
 */

export const BRAND = {
  primary: "#ff6b1a",
  ink: "#17140f",
  body: "#4b5563",
  muted: "#6b7280",
  border: "#efe6dd",
  softBg: "#fdf2ea",
} as const;

export const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, Helvetica, Arial, sans-serif";

export type BuiltEmail = { subject: string; html: string; text: string };

/** White card, orange rule, footer. `body` is trusted HTML. */
export function layout(heading: string, intro: string, body: string, footer: string): string {
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

/**
 * Primary call-to-action. An anchor rather than the usual nested-table hack:
 * every client that matters renders padded inline-block links, and the button
 * is never the only way to reach the link — the URL is always printed beside
 * it, so a client that strips the styling still leaves something clickable.
 */
export function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;padding:12px 22px;background:${BRAND.primary};color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;border-radius:10px;">${label}</a>`;
}
