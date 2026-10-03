import type { NextRequest } from "next/server";

import { isLikelyBot } from "@/lib/edge-policy";
import { checkRateLimitByIp, clientIp } from "@/lib/rate-limit";
import { parseSignalPayload } from "@/lib/signal-events";
import { recordSignals } from "@/lib/signals";

/**
 * The engagement beacon (lib/signals-client.ts → here → product_events).
 *
 * Always answers 204, whatever happens: a beacon cannot act on an error, and a
 * distinguishable rejection would only teach a script where the limits are.
 * Dropped silently: likely bots, cross-site requests, anything over the per-IP
 * limit, malformed payloads.
 */

export const dynamic = "force-dynamic";

const NO_CONTENT = () => new Response(null, { status: 204, headers: { "cache-control": "no-store" } });

export async function POST(request: NextRequest): Promise<Response> {
  const userAgent = request.headers.get("user-agent") ?? "";
  if (!userAgent || isLikelyBot(userAgent)) return NO_CONTENT();

  // Browsers send this on every fetch/beacon; a page on another site cannot
  // inflate our numbers through a visitor's browser.
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return NO_CONTENT();

  const limit = await checkRateLimitByIp("signals");
  if (!limit.ok) return NO_CONTENT();

  let body: unknown = null;
  try {
    body = JSON.parse((await request.text()).slice(0, 4096));
  } catch {
    return NO_CONTENT();
  }

  const events = parseSignalPayload(body);
  if (events.length > 0) {
    await recordSignals(events, { ip: await clientIp(), userAgent });
  }
  return NO_CONTENT();
}
