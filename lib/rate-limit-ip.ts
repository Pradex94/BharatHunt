/**
 * Client-IP resolution and log anonymisation.
 *
 * Split out of lib/rate-limit.ts so it carries no `server-only` marker and no
 * `next/headers` import: this is the function every limit depends on for its
 * key, so it has to be testable directly in plain Node rather than only
 * through a request context.
 */

// Relative and extensioned on purpose: `npm test` imports this module in plain
// Node, where the `@/` alias and extensionless specifiers do not resolve.
import { isCloudflareIp } from "./cloudflare.ts";

export type HeaderGetter = (name: string) => string | null | undefined;

/**
 * The address the platform saw the connection come from.
 *
 * `x-forwarded-for` is caller-settable in general — anyone can send
 * `X-Forwarded-For: 1.2.3.4` and, if it were trusted blindly, mint a fresh
 * budget per request. On Vercel the edge rewrites it before the function sees
 * it, but `x-vercel-forwarded-for` is set exclusively by Vercel and is never
 * forwarded from the client, so it is preferred and `x-forwarded-for` is only a
 * fallback for non-Vercel environments.
 *
 * Falling back to a single `"unknown"` bucket is deliberate: if the IP cannot
 * be determined, everything in that state shares one budget rather than each
 * unidentifiable request receiving its own.
 */
export function connectingIpFrom(get: HeaderGetter): string {
  const vercel = get("x-vercel-forwarded-for")?.split(",", 1)[0]?.trim();
  if (vercel) return vercel;

  const real = get("x-real-ip")?.trim();
  if (real) return real;

  const forwarded = get("x-forwarded-for")?.split(",", 1)[0]?.trim();
  return forwarded || "unknown";
}

/**
 * The visitor's IP: the connecting address, or the client behind it when the
 * connection came through Cloudflare's proxy.
 *
 * With the orange cloud on, the connecting address is a Cloudflare data centre
 * shared by every visitor it serves, so keying the limiter on it would put a
 * whole city into one 300/min budget. `cf-connecting-ip` names the real client,
 * and is only believed when the connection itself arrived from a published
 * Cloudflare range — see `lib/cloudflare.ts` for why that check is what makes
 * the header safe to read.
 */
export function clientIpFrom(get: HeaderGetter): string {
  const connecting = connectingIpFrom(get);
  if (!isCloudflareIp(connecting)) return connecting;

  const client = get("cf-connecting-ip")?.split(",", 1)[0]?.trim();
  return client || connecting;
}

/** Truncated for logs: enough to correlate abuse, not a full identifier. */
export function anonymizeIp(ip: string): string {
  if (ip === "unknown") return "unknown";
  if (ip.includes(":")) return `${ip.split(":").slice(0, 2).join(":")}::`; // IPv6
  const parts = ip.split(".");
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.x` : "unknown";
}
