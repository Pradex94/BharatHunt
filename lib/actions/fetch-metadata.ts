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
import { checkRateLimitByIpAndUser } from "@/lib/rate-limit";

import { imageSizeFromBytes, squareLogoSize } from "@/lib/image-size";
import {
  bySizeDesc,
  extractMetadata,
  nameFromHostname,
  parseIconSize,
  safeHostname,
  toAbsolute,
  type FetchMetadataResult,
} from "@/lib/metadata-extract";

// NOTE: this is a "use server" module — it may export async functions and
// nothing else. Types live in @/lib/metadata-extract; re-exporting one from
// here makes Turbopack emit a runtime re-export and the module throws
// "ReferenceError: <Type> is not defined" on evaluation.

const FETCH_TIMEOUT_MS = 7000;
const MAX_BYTES = 512 * 1024; // the <head> lives at the top; 512KB is plenty
const MAX_REDIRECTS = 4;
const BLOCKED_HOSTS = new Set(["localhost", "ip6-localhost", "metadata.google.internal"]);

/**
 * Mozilla-compatible, but still says who we are — the same shape Slackbot,
 * Twitterbot and Googlebot use. Plenty of CDNs and WAFs reject any User-Agent
 * that doesn't start with "Mozilla/5.0", which is what made legitimate imports
 * come back 403. We identify honestly rather than impersonating a browser.
 */
const USER_AGENT =
  "Mozilla/5.0 (compatible; BharatHuntBot/1.0; +https://www.bharathunt.org)";

/** A bare UA and Accept header reads as a scraper; real clients send these. */
const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent": USER_AGENT,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-IN,en;q=0.9",
  "Upgrade-Insecure-Requests": "1",
};

/** Carries the status code so the caller can explain what actually happened. */
class HttpStatusError extends Error {
  constructor(readonly status: number) {
    super(`The site responded with ${status}.`);
  }
}

/**
 * Turns a status into something a maker can act on. "The site responded with
 * 403" tells them nothing — and the fix is nearly always "type it in yourself",
 * so say that.
 */
function describeHttpFailure(status: number): string {
  if (status === 401 || status === 403) {
    return "That site blocked our request, so we couldn't read its details automatically.";
  }
  if (status === 404 || status === 410) {
    return "That page doesn't exist — check the URL.";
  }
  if (status === 429) {
    return "That site is rate-limiting us right now.";
  }
  if (status >= 500) {
    return "That site is having trouble right now.";
  }
  return "We couldn't read that page.";
}

/** Icon resolution: how many candidates we'll actually HTTP-check, and how long each may take. */
const MAX_ICON_PROBES = 6;
/** Enough header for every format in lib/image-size.ts, JPEG's segment walk included. */
const ICON_HEADER_BYTES = 32 * 1024;
/**
 * Stop probing once a candidate is at least this wide. The avatar renders at
 * roughly 200px, so 180 — Apple's touch-icon size, and the most common real
 * logo on the web — is where extra pixels stop being visible and extra requests
 * stop being worth their latency.
 */
const GOOD_ICON_PX = 180;
/** What we ask Google's favicon service for; it serves the best it holds up to this. */
const GOOGLE_ICON_PX = 256;
const ICON_PROBE_TIMEOUT_MS = 4000;
const IMAGE_EXTENSION = /\.(png|svg|webp|jpe?g|ico|avif|gif)(\?|#|$)/i;

export async function fetchUrlMetadata(rawUrl: string): Promise<FetchMetadataResult> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Please sign in to import from a URL." };

  /*
   * This action makes *this server* issue an outbound HTTP request to a URL the
   * caller supplies, then follows redirects and probes for an icon. That is
   * egress cost per call and an amplification primitive pointed at third
   * parties, so it gets the tightest authenticated limit on the site.
   */
  const rate = await checkRateLimitByIpAndUser("metadataFetch", userId);
  if (!rate.ok) return { ok: false, error: rate.message };

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
      return minimalImport(normalized, "We couldn't read any details from that page.");
    }

    // The declared favicon is often missing, a dead link, or a bare .ico. Walk
    // the candidates (manifest icons included) and keep the *largest* that
    // really serves an image, so makers get a sharp logo rather than whichever
    // one the page happened to list first.
    const icon = await resolveIcon(iconCandidates, manifestUrl, finalUrl);
    data.icon = icon.url;
    data.iconPixels = icon.pixels;
    // Don't let the icon double as a "screenshot" if we fell back to og:image.
    data.images = data.images.filter((image) => image !== data.icon);

    return { ok: true, data };
  } catch (error) {
    // A site we can't read is not a reason to strand the maker on an empty
    // form. We still know the URL, and the favicon service works off the
    // domain alone — so hand back what we have and say what's missing.
    if (error instanceof HttpStatusError) {
      return minimalImport(normalized, describeHttpFailure(error.status));
    }
    const message =
      error instanceof Error && error.message ? error.message : "Couldn't fetch that page.";
    return { ok: false, error: message };
  }
}

/**
 * The best we can do without reading the page: the URL itself, a name guessed
 * from the domain, and a favicon looked up by domain. The maker fills in the
 * rest, which beats being told "403" and left with nothing.
 */
function minimalImport(url: string, reason: string): FetchMetadataResult {
  const host = safeHostname(url);
  if (!host) return { ok: false, error: reason };

  return {
    ok: true,
    notice: `${reason} We've filled in your link and logo — add the name and description yourself.`,
    data: {
      url,
      name: nameFromHostname(host),
      title: "",
      description: "",
      tagline: "",
      category: null,
      icon: `https://www.google.com/s2/favicons?sz=${GOOGLE_ICON_PX}&domain=${encodeURIComponent(host)}`,
      iconPixels: null,
      images: [],
      siteName: null,
    },
  };
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
        headers: BROWSER_HEADERS,
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

    if (!res.ok) throw new HttpStatusError(res.status);

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
        headers: { ...BROWSER_HEADERS, Accept: "application/manifest+json, application/json" },
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

/**
 * Fetches enough of `url` to read the image header and returns the size of the
 * square logo it could produce. `null` means it is not a usable image; `0`
 * means it is an image whose header we could not parse.
 *
 * Only a prefix is read. Dimensions live in the first bytes of every format
 * `lib/image-size.ts` handles, so there is no reason to pull whole images down
 * a request path that is already on a timeout budget.
 */
async function probeIconSize(url: string): Promise<number | null> {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    await assertPublicHost(parsed.hostname);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ICON_PROBE_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: { ...BROWSER_HEADERS, Accept: "image/*,*/*;q=0.8" },
        signal: controller.signal,
      });
      if (!res.ok) {
        await res.body?.cancel();
        return null;
      }

      const type = (res.headers.get("content-type") ?? "").toLowerCase();
      const looksLikeImage =
        type.startsWith("image/") ||
        // Plenty of servers mislabel .ico as octet-stream; trust the extension.
        (type.includes("octet-stream") && IMAGE_EXTENSION.test(url));
      if (!looksLikeImage) {
        await res.body?.cancel();
        return null;
      }

      const prefix = await readImageHeader(res, ICON_HEADER_BYTES);
      const size = imageSizeFromBytes(prefix, type);
      // A live image we cannot measure still beats nothing, but it must never
      // outrank one we did measure — hence the deliberate 0.
      return size ? squareLogoSize(size) : 0;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

/** The first `maxBytes` of a response body. */
async function readImageHeader(res: Response, maxBytes: number): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array();

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }

  const out = new Uint8Array(Math.min(total, maxBytes));
  let offset = 0;
  for (const chunk of chunks) {
    if (offset >= out.length) break;
    out.set(chunk.subarray(0, out.length - offset), offset);
    offset += chunk.length;
  }
  return out;
}

/**
 * Picks the **largest** icon a site offers, not the first one that responds.
 *
 * The old version took the first candidate that merely existed, which is how
 * paytm.com produced a blurry logo: the page points both its `rel="icon"` and
 * its `apple-touch-icon` at the same 16x16 `favicon.ico`, so the winner was a
 * perfectly valid image at a twelfth of the size it gets rendered at. Nothing
 * in the pipeline noticed, because nothing was looking at resolution.
 * Declaration order says nothing about sharpness, so it is measured instead.
 *
 * Probing stops early once something comfortably sharp turns up, so the common
 * case — a site whose 192px or 512px PWA icon is listed first — still costs a
 * single request.
 */
async function resolveIcon(
  candidates: string[],
  manifestUrl: string | null,
  baseUrl: string,
): Promise<{ url: string | null; pixels: number | null }> {
  const fromManifest = manifestUrl ? await manifestIcons(manifestUrl) : [];
  // Manifest icons sit behind apple-touch-icon but ahead of everything else.
  const ordered = [candidates[0], ...fromManifest, ...candidates.slice(1)]
    .filter((href): href is string => Boolean(href))
    .filter((href, index, all) => all.indexOf(href) === index);

  let best: { url: string; size: number } | null = null;

  for (const candidate of ordered.slice(0, MAX_ICON_PROBES)) {
    const size = await probeIconSize(candidate);
    if (size === null) continue;
    if (!best || size > best.size) best = { url: candidate, size };
    if (best.size >= GOOD_ICON_PX) return { url: best.url, pixels: best.size };
  }

  // Nothing the page declares is sharp enough for an avatar. Google's favicon
  // service often holds larger artwork for a domain than the site links to, so
  // it is worth measuring rather than assuming it is better or worse.
  const host = safeHostname(baseUrl);
  if (host) {
    const fallback = `https://www.google.com/s2/favicons?sz=${GOOGLE_ICON_PX}&domain=${encodeURIComponent(host)}`;
    const size = await probeIconSize(fallback);
    if (size !== null && (!best || size > best.size)) return { url: fallback, pixels: size };
    if (!best) return { url: fallback, pixels: null };
  }

  // `0` is the "live but unmeasurable" marker from probeIconSize; report it as
  // unknown rather than as a zero-pixel image.
  return { url: best?.url ?? null, pixels: best && best.size > 0 ? best.size : null };
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
