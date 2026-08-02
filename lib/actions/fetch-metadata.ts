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

/** Icon resolution: how many candidates we'll actually HTTP-check, and how long each may take. */
const MAX_ICON_PROBES = 6;
const ICON_PROBE_TIMEOUT_MS = 4000;
const IMAGE_EXTENSION = /\.(png|svg|webp|jpe?g|ico|avif|gif)(\?|#|$)/i;

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
    const { iconCandidates, manifestUrl, ...data } = extractMetadata(html, finalUrl);
    if (!data.name && !data.description && data.images.length === 0) {
      return { ok: false, error: "Couldn't read any details from that page — fill the form in manually." };
    }

    // The declared favicon is often missing, a dead link, or a bare .ico. Walk
    // the candidates (manifest icons included) and keep the first that really
    // serves an image, so makers get a logo instead of a broken avatar.
    data.icon = await resolveIcon(iconCandidates, manifestUrl, finalUrl);
    // Don't let the icon double as a "screenshot" if we fell back to og:image.
    data.images = data.images.filter((image) => image !== data.icon);

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

/** What `extractMetadata` knows before we've HTTP-checked anything. */
type ExtractedMetadata = ProductMetadata & {
  /** Ordered best-first; `resolveIcon` picks the first that actually loads. */
  iconCandidates: string[];
  /** `<link rel="manifest">`, where PWAs keep their big square icons. */
  manifestUrl: string | null;
};

/** `sizes="180x180"` → 180, so we can prefer the biggest declared icon. */
function parseIconSize(sizes: string | undefined): number {
  if (!sizes) return 0;
  const match = /(\d+)\s*[x×]\s*(\d+)/i.exec(sizes);
  return match ? Number(match[1]) : 0;
}

function bySizeDesc(a: { size: number }, b: { size: number }): number {
  return b.size - a.size;
}

function extractMetadata(html: string, baseUrl: string): ExtractedMetadata {
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

  const appleIcons: Array<{ href: string; size: number }> = [];
  const linkIcons: Array<{ href: string; size: number }> = [];
  let manifestHref = "";
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const attrs = parseAttributes(tag);
    const rel = (attrs["rel"] ?? "").toLowerCase();
    const href = attrs["href"];
    if (!href) continue;
    const size = parseIconSize(attrs["sizes"]);
    if (rel.includes("apple-touch-icon")) appleIcons.push({ href, size });
    else if (rel.includes("manifest")) manifestHref ||= href;
    else if (rel.includes("icon")) linkIcons.push({ href, size });
  }
  appleIcons.sort(bySizeDesc);
  linkIcons.sort(bySizeDesc);

  const title = og["title"] || tw["title"] || rawTitle;
  const siteName = og["site_name"] || null;
  const description = collapse(og["description"] || tw["description"] || named["description"] || "").slice(0, 1000);

  // Gallery: the social-preview image(s), absolute + deduped.
  const declaredIcons = new Set<string>();
  for (const { href } of [...appleIcons, ...linkIcons]) {
    const abs = toAbsolute(href, baseUrl);
    if (abs) declaredIcons.add(abs);
  }
  const images: string[] = [];
  for (const raw of [og["image"], og["image:url"], og["image:secure_url"], tw["image"], tw["image:src"]]) {
    const abs = toAbsolute(raw, baseUrl);
    if (abs && !declaredIcons.has(abs) && !images.includes(abs)) images.push(abs);
  }

  // Icon candidates, best first. The maker's real square logo lives in the
  // apple-touch-icon or the PWA manifest; a raster <link rel="icon"> is next.
  // Only after all of those do we accept a bare .ico, then a social image as a
  // stand-in logo — which is what "fetch some other image" means in practice.
  const raster = linkIcons.filter(({ href }) => /\.(png|svg|webp|jpe?g|avif)(\?|#|$)/i.test(href));
  const legacy = linkIcons.filter(({ href }) => !raster.some((r) => r.href === href));
  const origin = safeOrigin(baseUrl);
  const iconCandidates = [
    ...appleIcons.map(({ href }) => href),
    ...raster.map(({ href }) => href),
    named["msapplication-tileimage"],
    ...legacy.map(({ href }) => href),
    og["logo"],
    origin ? `${origin}/favicon.ico` : undefined, // undeclared but conventional
    ...images,
  ]
    .map((href) => toAbsolute(href, baseUrl))
    .filter((href): href is string => Boolean(href))
    .filter((href, index, all) => all.indexOf(href) === index);

  return {
    url: baseUrl,
    name: (siteName || title || "").trim(),
    title: title.trim(),
    description,
    icon: null, // resolved by resolveIcon() once we can make requests
    images,
    siteName,
    iconCandidates,
    manifestUrl: toAbsolute(manifestHref, baseUrl),
  };
}

/** Icons declared in a PWA manifest, largest first. */
async function manifestIcons(manifestUrl: string): Promise<string[]> {
  try {
    const url = new URL(manifestUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return [];
    await assertPublicHost(url.hostname);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ICON_PROBE_TIMEOUT_MS);
    try {
      const res = await fetch(manifestUrl, {
        headers: { "User-Agent": "BharatHuntBot/1.0", Accept: "application/manifest+json, application/json" },
        signal: controller.signal,
      });
      if (!res.ok) return [];
      const json = (await res.json()) as { icons?: Array<{ src?: string; sizes?: string }> };
      return (json.icons ?? [])
        .map((entry) => ({ href: entry.src ?? "", size: parseIconSize(entry.sizes) }))
        .filter(({ href }) => href)
        .sort(bySizeDesc)
        .map(({ href }) => toAbsolute(href, manifestUrl))
        .filter((href): href is string => Boolean(href));
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return [];
  }
}

/** True when `url` responds with an actual image. */
async function isLiveImage(url: string): Promise<boolean> {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    await assertPublicHost(parsed.hostname);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ICON_PROBE_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "BharatHuntBot/1.0", Accept: "image/*" },
        signal: controller.signal,
      });
      // Read no further than the headers — we only care that it exists.
      await res.body?.cancel();
      if (!res.ok) return false;
      const type = res.headers.get("content-type") ?? "";
      if (type.startsWith("image/")) return true;
      // Plenty of servers mislabel .ico as octet-stream; trust the extension.
      return type.includes("octet-stream") && IMAGE_EXTENSION.test(url);
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return false;
  }
}

/**
 * Picks the first candidate that actually serves an image, pulling in manifest
 * icons first. Falls back to Google's favicon service (which synthesises one
 * for any domain) so the form always gets something.
 */
async function resolveIcon(
  candidates: string[],
  manifestUrl: string | null,
  baseUrl: string,
): Promise<string | null> {
  const fromManifest = manifestUrl ? await manifestIcons(manifestUrl) : [];
  // Manifest icons sit behind apple-touch-icon but ahead of everything else.
  const ordered = [candidates[0], ...fromManifest, ...candidates.slice(1)]
    .filter((href): href is string => Boolean(href))
    .filter((href, index, all) => all.indexOf(href) === index);

  for (const candidate of ordered.slice(0, MAX_ICON_PROBES)) {
    if (await isLiveImage(candidate)) return candidate;
  }

  const host = safeHostname(baseUrl);
  return host ? `https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(host)}` : null;
}

function safeHostname(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function safeOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
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
