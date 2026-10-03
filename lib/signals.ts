import "server-only";

import { istDayKey } from "@/lib/format-date";
import { createServiceClient } from "@/lib/supabase/service";
import { dedupBucket, type SignalInput } from "@/lib/signal-events";

/**
 * Writes engagement events to `product_events` — the only writer, reached from
 * /api/signals after its bot filter and rate limit.
 *
 * Privacy: no IP address and no user id are stored. Each event carries a
 * session hash, sha-256 of (server secret, IST day, IP, user agent), cut to 32
 * hex characters. It is stable for one visitor for one day — enough to count
 * unique visitors and drop duplicates — and changes at midnight, so nobody can
 * be followed across days or re-identified from the table.
 *
 * Anti-abuse, in layers: the endpoint's per-IP limit and bot filter, then the
 * unique index (one count per session, product, event and hour), then the
 * scoring itself, which weights unique visitors rather than raw views.
 */

function salt(): string {
  return (
    process.env.SIGNAL_SALT ||
    process.env.CLERK_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "bharathunt-signals"
  );
}

async function sessionHash(ip: string, userAgent: string): Promise<string> {
  const material = new TextEncoder().encode(`${salt()}|${istDayKey()}|${ip}|${userAgent}`);
  const digest = await crypto.subtle.digest("SHA-256", material);
  return [...new Uint8Array(digest)]
    .slice(0, 16)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function recordSignals(
  events: SignalInput[],
  context: { ip: string; userAgent: string },
): Promise<number> {
  if (events.length === 0) return 0;

  const session = await sessionHash(context.ip, context.userAgent);
  const bucket = dedupBucket();
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("product_events")
    .upsert(
      events.map((event) => ({
        product_id: event.productId,
        event_type: event.event,
        session_hash: session,
        dedup_bucket: bucket,
        surface: event.surface,
      })),
      { onConflict: "product_id,event_type,session_hash,dedup_bucket", ignoreDuplicates: true },
    )
    // With ignoreDuplicates, only rows actually inserted come back.
    .select("product_id, event_type");

  if (error) {
    // An unknown product id fails the foreign key; nothing worth retrying.
    if (error.code !== "23503") console.error(`[signals] insert failed: ${error.code ?? ""} ${error.message}`);
    return 0;
  }

  // The public view counter moves only for a view this visitor has not
  // already made this hour — refreshing a page does not inflate it.
  // increment_view_count is service-role only (20261005000000).
  const newViews = (data ?? []).filter((row) => row.event_type === "view");
  await Promise.all(
    newViews.map((row) => supabase.rpc("increment_view_count", { target_product_id: row.product_id })),
  );
  return data?.length ?? 0;
}
