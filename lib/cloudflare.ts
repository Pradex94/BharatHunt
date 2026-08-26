/**
 * Cloudflare edge detection.
 *
 * When the orange cloud is on, Cloudflare terminates the connection and dials
 * the origin itself, so every request reaches Vercel from a Cloudflare address.
 * Two things the app relies on are computed from that address by the platform:
 *
 *   - the rate-limit key (`lib/rate-limit-ip.ts`), which would collapse every
 *     visitor served by one Cloudflare data centre into a single 300/min
 *     budget — Mumbai alone would throttle the whole city;
 *   - the geo prefill (`lib/request-geo.ts`), which would report the location
 *     of the Cloudflare PoP rather than the maker's.
 *
 * Cloudflare restates the real client in its own headers (`cf-connecting-ip`,
 * `cf-ipcountry`, ...), so the fix is to read those instead — but only when the
 * request genuinely came through Cloudflare. Those headers are ordinary request
 * headers: anyone can set `CF-Connecting-IP: 1.2.3.4` against the origin
 * directly and, if it were trusted blindly, mint a fresh rate-limit budget per
 * request. Cloudflare overwrites them on its own edge, so a request that
 * *arrives from a Cloudflare address* carries values Cloudflare set. That is
 * the gate: the published edge ranges, checked against the address the platform
 * saw the connection come from.
 *
 * The lists below are Cloudflare's own, from https://www.cloudflare.com/ips-v4
 * and /ips-v6 (verified 2026-08-25). They change rarely; the failure mode when
 * they do is that a request falls back to the platform headers — the behaviour
 * this file replaces — never that a forged header is believed.
 *
 * Framework-agnostic on purpose (no `server-only`, no `next/headers`), the same
 * contract as `lib/rate-limit-ip.ts`, so it is testable in plain Node.
 */

/** https://www.cloudflare.com/ips-v4 */
const CLOUDFLARE_IPV4 = [
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
] as const;

/** https://www.cloudflare.com/ips-v6 */
const CLOUDFLARE_IPV6 = [
  "2400:cb00::/32",
  "2606:4700::/32",
  "2803:f800::/32",
  "2405:b500::/32",
  "2405:8100::/32",
  "2a06:98c0::/29",
  "2c0f:f248::/32",
] as const;

/*
 * Addresses are compared as 16-bit groups — two for IPv4, eight for IPv6 —
 * rather than as one wide integer, because this project targets ES2017 and
 * BigInt literals are not available there.
 */
type IpVersion = 4 | 6;
type Address = {
  readonly version: IpVersion;
  readonly groups: readonly number[];
};
type Range = Address & { readonly bits: number };

function parseIpv4(address: string): Address | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;

  const bytes: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const byte = Number(part);
    if (byte > 255) return null;
    bytes.push(byte);
  }
  return {
    version: 4,
    groups: [(bytes[0] << 8) | bytes[1], (bytes[2] << 8) | bytes[3]],
  };
}

function parseIpv6(address: string): Address | null {
  const [bare] = address.split("%"); // drop any zone id
  const halves = (bare ?? "").split("::");
  if (halves.length > 2) return null;

  const split = (part: string) => (part ? part.split(":") : []);
  let head = split(halves[0] ?? "");
  let tail = halves.length === 2 ? split(halves[1] ?? "") : [];

  // An embedded IPv4 tail (::ffff:203.0.113.1) occupies the last two groups.
  const written = [...head, ...tail];
  const last = written[written.length - 1];
  if (last?.includes(".")) {
    const embedded = parseIpv4(last);
    if (!embedded) return null;
    const pair = embedded.groups.map((group) => group.toString(16));
    if (tail.length) tail = [...tail.slice(0, -1), ...pair];
    else head = [...head.slice(0, -1), ...pair];
  }

  const present = head.length + tail.length;
  if (present > 8) return null;
  if (halves.length === 1 && present !== 8) return null; // no "::", so it must be complete

  const groups: number[] = [];
  for (const group of [...head, ...Array<string>(8 - present).fill("0"), ...tail]) {
    if (!/^[0-9a-f]{1,4}$/i.test(group)) return null;
    groups.push(Number.parseInt(group, 16));
  }

  // `::ffff:0:0/96` is an IPv4 address wearing an IPv6 costume; compare it as
  // the IPv4 address it is, or it would miss every IPv4 range below.
  const mapped = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  if (mapped) return { version: 4, groups: groups.slice(6) };

  return { version: 6, groups };
}

function parseAddress(address: string): Address | null {
  return address.includes(":") ? parseIpv6(address) : parseIpv4(address);
}

function parseCidr(cidr: string): Range | null {
  const [address, prefix] = cidr.split("/");
  const parsed = parseAddress(address ?? "");
  if (!parsed) return null;

  const width = parsed.version === 4 ? 32 : 128;
  const bits = Number(prefix);
  if (!Number.isInteger(bits) || bits < 0 || bits > width) return null;

  return { ...parsed, bits };
}

/** Whether `address` falls inside `range`, comparing `range.bits` leading bits. */
function contains(range: Range, address: Address): boolean {
  if (range.version !== address.version) return false;

  let remaining = range.bits;
  for (let index = 0; index < range.groups.length; index += 1) {
    if (remaining <= 0) return true;
    const width = Math.min(16, remaining);
    const mask = width === 16 ? 0xffff : (0xffff << (16 - width)) & 0xffff;
    if ((address.groups[index] & mask) !== (range.groups[index] & mask)) return false;
    remaining -= width;
  }
  return true;
}

const RANGES: readonly Range[] = [...CLOUDFLARE_IPV4, ...CLOUDFLARE_IPV6]
  .map(parseCidr)
  .filter((range): range is Range => range !== null);

/**
 * True when `ip` belongs to Cloudflare's published edge ranges.
 *
 * Anything unparseable — `"unknown"`, an empty string, a hostname — is false,
 * which keeps the caller on the platform headers rather than on a header the
 * client could have written.
 */
export function isCloudflareIp(ip: string | null | undefined): boolean {
  const address = parseAddress((ip ?? "").trim());
  if (!address) return false;
  return RANGES.some((range) => contains(range, address));
}
