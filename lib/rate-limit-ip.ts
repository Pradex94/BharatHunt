/**
 * Client-IP resolution and log anonymisation.
 *
 * Split out of lib/rate-limit.ts so it carries no `server-only` marker and no
 * `next/headers` import: this is the function every limit depends on for its
 * key, so it has to be testable directly in plain Node rather than only
 * through a request context.
 */

/**
 * The client IP, taken only from headers the platform controls.
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
export function clientIpFrom(get: (name: string) => string | null | undefined): string {
  const vercel = get("x-vercel-forwarded-for")?.split(",", 1)[0]?.trim();
  if (vercel) return vercel;

  const real = get("x-real-ip")?.trim();
  if (real) return real;

  const forwarded = get("x-forwarded-for")?.split(",", 1)[0]?.trim();
  return forwarded || "unknown";
}

/** Truncated for logs: enough to correlate abuse, not a full identifier. */
export function anonymizeIp(ip: string): string {
  if (ip === "unknown") return "unknown";
  if (ip.includes(":")) return `${ip.split(":").slice(0, 2).join(":")}::`; // IPv6
  const parts = ip.split(".");
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.x` : "unknown";
}
