import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { auth } from "@clerk/nextjs/server";
import type { Database } from "@/types/database";

export function createClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      async accessToken() {
        return (await auth()).getToken();
      },
    },
  );
}

/**
 * Anon client for reads that are public by RLS and identical for every visitor.
 *
 * The authenticated client above resolves its token through Clerk's `auth()`,
 * which is a dynamic API: any route that touches it opts out of static
 * rendering entirely. That is correct for anything personalised, but the
 * homepage aggregates (top launches, platform stats, launches per state) are
 * the same bytes for everyone and are governed by `USING (true)` /
 * `status = 'published'` policies that an anon key already satisfies. Reading
 * them through this client is what lets those pages be prerendered and
 * revalidated instead of re-rendered per request.
 *
 * Never use this for anything that varies per user or depends on RLS seeing a
 * `sub` claim — it has no identity, so those queries return empty, not an error.
 */
export function createPublicClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
