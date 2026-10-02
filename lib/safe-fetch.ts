import "server-only";

import { lookup } from "node:dns/promises";
import net from "node:net";

/**
 * The SSRF guard for any server-side fetch of a URL that did not come from us.
 *
 * Shared by the maker's URL importer (lib/actions/fetch-metadata.ts) and the
 * Daily 5 agent's site verifier (lib/daily-agent/fetcher.ts): both make *this
 * server* request a third-party URL, so both must refuse hosts that resolve
 * into private, loopback or link-local space — the cloud metadata endpoint
 * most of all. Callers check every redirect hop, not just the first URL.
 */

const BLOCKED_HOSTS = new Set(["localhost", "ip6-localhost", "metadata.google.internal"]);

export async function assertPublicHost(hostname: string): Promise<void> {
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

export function isPrivateIp(ip: string): boolean {
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
