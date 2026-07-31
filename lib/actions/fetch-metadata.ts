"use server";

/**
 * Fetches a product URL and extracts its metadata (Open Graph / Twitter / meta
 * tags) so the submit form can auto-fill, Product-Hunt style.
 *
 * Because this fetches arbitrary user-supplied URLs from the server, it's an
 * SSRF surface. Guards: auth-gated, http(s) only, DNS-resolved hosts are
 * rejected if they land on private/loopback/link-local ranges, redirects are
 * followed manually and re-validated per hop, and the download is size- and
 * time-capped.
 */

import { lookup } from "node:dns/promises";
import net from "node:net";

import { auth } from "@clerk/nextjs/server";

export type ProductMetadata = {
  url: string;
  name: string;
  title: string;
  description: string;
  /** Square logo/favicon for the product avatar (→ hero_image_url). */
  icon: string | null;
  /** Wide preview image(s) for the product gallery (→ screenshot_urls). */
  images: string[];
  siteName: string | null;
};

export type FetchMetadataResult =
  | { ok: true; data: ProductMetadata }
  | { ok: false; error: string };

const FETCH_TIMEOUT_MS = 7000;
const MAX_BYTES = 512 * 1024; // the <head> lives at the top; 512KB is plenty
const MAX_REDIRECTS = 4;
const BLOCKED_HOSTS = new Set(["localhost", "ip6-localhost", "metadata.google.internal"]);

export async function fetchUrlMetadata(rawUrl: string): Promise<FetchMetadataResult> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Please sign in to import from a URL." };

  let normalized: string;
  try {
    normalized = normalizeUrl(rawUrl);
  } catch {
    return { ok: false, error: "That doesn't look like a valid URL." };
  }

  try {
    const { finalUrl, html } = await fetchHtml(normalized);
    const data = extractMetadata(html, finalUrl);
    if (!data.name && !data.description && data.images.length === 0) {
      return { ok: false, error: "Couldn't read any details from that page — fill the form in manually." };
    }
    return { ok: true, data };
  } catch (error) {
    const message =
      error instanceof Error && error.message ? error.message : "Couldn't fetch that page.";
    return { ok: false, error: message };
  }
}

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  // Allow pasting a bare domain (example.com) by defaulting to https.
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withProtocol);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http(s) URLs are supported.");
  }
  return url.toString();
}

async function assertPublicHost(hostname: string): Promise<void> {
  const host = hostname.toLowerCase();
  if (
    BLOCKED_HOSTS.has(host) ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".localhost")
  ) {
    throw new Error("That host isn't allowed.");
  }

  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error("That host isn't allowed.");
    return;
  }

  const records = await lookup(host, { all: true });
  if (records.length === 0) throw new Error("Couldn't resolve that host.");
  for (const { address } of records) {
    if (isPrivateIp(address)) throw new Error("That host isn't allowed.");
  }
}

async function fetchHtml(startUrl: string): Promise<{ finalUrl: string; html: string }> {
  let current = startUrl;

  for (let hop = 0; hop < MAX_REDIRECTS; hop++) {
    const url = new URL(current);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Only http(s) URLs are supported.");
    }
    await assertPublicHost(url.hostname);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": "BharatHuntBot/1.0 (+https://bharat-hunt.vercel.app)",
          Accept: "text/html,application/xhtml+xml",
        },
      });
    } catch {
      throw new Error("Couldn't reach that site.");
    } finally {
      clearTimeout(timer);
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new Error("The site sent a redirect we couldn't follow.");
      current = new URL(location, current).toString();
      continue;
    }

    if (!res.ok) throw new Error(`The site responded with ${res.status}.`);

    const contentType = res.headers.get("content-type") ?? "";
    if (contentType && !/text\/html|application\/xhtml/i.test(contentType)) {
      throw new Error("That link isn't a web page.");
    }
    const declaredLength = Number(res.headers.get("content-length") ?? "0");
    if (declaredLength && declaredLength > 8 * 1024 * 1024) {
      throw new Error("That page is too large to read.");
    }

    const html = await readCapped(res, MAX_BYTES);
    return { finalUrl: current, html };
  }

  throw new Error("That link redirects too many times.");
}

async function readCapped(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return res.text();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.length;
      if (total >= maxBytes) {
        await reader.cancel();
        break;
      }
    }
  }
  return Buffer.concat(chunks).toString("utf8");
}

// ── HTML metadata extraction ─────────────────────────────────────────────

function extractMetadata(html: string, baseUrl: string): ProductMetadata {
  const og: Record<string, string> = {};
  const tw: Record<string, string> = {};
  const named: Record<string, string> = {};

  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs = parseAttributes(tag);
    const content = attrs["content"];
    if (content === undefined) continue;
    const property = attrs["property"]?.toLowerCase();
    const name = attrs["name"]?.toLowerCase();
    const key = property ?? name;
    if (!key) continue;
    if (key.startsWith("og:")) og[key.slice(3)] ??= content;
    else if (key.startsWith("twitter:")) tw[key.slice(8)] ??= content;
    else if (name) named[name] ??= content;
  }

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const rawTitle = titleMatch ? decodeEntities(collapse(titleMatch[1])) : "";

  let appleIcon = "";
  const iconHrefs: string[] = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const attrs = parseAttributes(tag);
    const rel = (attrs["rel"] ?? "").toLowerCase();
    const href = attrs["href"];
    if (!href) continue;
    if (rel.includes("apple-touch-icon")) appleIcon ||= href;
    else if (rel.includes("icon")) iconHrefs.push(href);
  }

  const title = og["title"] || tw["title"] || rawTitle;
  const siteName = og["site_name"] || null;
  const description = collapse(og["description"] || tw["description"] || named["description"] || "").slice(0, 1000);

  // Icon: the site's own branded logo. Prefer a real declared raster icon —
  // apple-touch-icon, or a PNG/SVG/WebP <link rel="icon"> — so we keep the
  // maker's actual logo. Fall back to Google's favicon service only when the
  // site declares nothing usable, and to a bare .ico as the last resort.
  const rasterIcon = iconHrefs.find((href) => /\.(png|svg|webp|jpe?g)(\?|#|$)/i.test(href));
  const host = safeHostname(baseUrl);
  const googleFavicon = host
    ? `https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(host)}`
    : null;
  const icon =
    toAbsolute(appleIcon, baseUrl) ||
    toAbsolute(rasterIcon, baseUrl) ||
    googleFavicon ||
    toAbsolute(iconHrefs[0], baseUrl);

  // Keep the logo/favicon out of the gallery: exclude every declared icon URL
  // (and the chosen icon), so a site whose og:image *is* its logo doesn't
  // duplicate it as a "screenshot".
  const iconUrls = new Set<string>();
  for (const href of [appleIcon, ...iconHrefs]) {
    const abs = toAbsolute(href, baseUrl);
    if (abs) iconUrls.add(abs);
  }
  if (icon) iconUrls.add(icon);

  // Gallery: the social-preview image(s), absolute + deduped, minus the logo.
  const images: string[] = [];
  for (const raw of [og["image"], og["image:url"], og["image:secure_url"], tw["image"], tw["image:src"]]) {
    const abs = toAbsolute(raw, baseUrl);
    if (abs && !iconUrls.has(abs) && !images.includes(abs)) images.push(abs);
  }

  return {
    url: baseUrl,
    name: (siteName || title || "").trim(),
    title: title.trim(),
    description,
    icon,
    images,
    siteName,
  };
}

function safeHostname(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function parseAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(tag))) {
    attrs[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attrs;
}

function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function toAbsolute(href: string | undefined, base: string): string | null {
  if (!href) return null;
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeCodePoint(Number(dec)));
}

function safeCodePoint(code: number): string {
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

// ── Private-range detection ──────────────────────────────────────────────

function isPrivateIp(ip: string): boolean {
  const kind = net.isIP(ip);
  if (kind === 4) return isPrivateIPv4(ip);
  if (kind === 6) return isPrivateIPv6(ip);
  return true; // unknown → treat as unsafe
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true; // this-network, private, loopback
  if (a === 169 && b === 254) return true; // link-local (incl. cloud metadata 169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const addr = ip.toLowerCase().split("%")[0]; // strip zone id
  if (addr === "::1" || addr === "::") return true; // loopback / unspecified
  if (addr.startsWith("fe80")) return true; // link-local
  if (addr.startsWith("fc") || addr.startsWith("fd")) return true; // unique-local fc00::/7
  if (addr.startsWith("::ffff:")) {
    const mapped = addr.slice("::ffff:".length);
    if (mapped.includes(".")) return isPrivateIPv4(mapped);
  }
  return false;
}
