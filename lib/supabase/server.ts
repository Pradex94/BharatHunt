import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { auth } from "@clerk/nextjs/server";
import type { Database } from "@/types/database";
import { resilientFetch } from "@/lib/supabase/resilient-fetch";

export function createClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      async accessToken() {
        return (await auth()).getToken();
      },
      // Bounded and retried — see lib/supabase/resilient-fetch.ts. This client
      // serves every signed-in path, the launch included, and those are the
      // requests where a stalled connection costs a whole Server Action.
      global: { fetch: resilientFetch },
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
 *
 * On the same bounded transport as the other two. That was worth checking
 * rather than assuming: `resilientFetch` attaches an `AbortSignal`, and a signal
 * is one of the things that can opt a request out of Next's fetch cache — which
 * is precisely what this client exists to stay inside (see the prerender note in
 * app/page.tsx and the two earlier attempts it records). Verified against
 * `next build`: `/` still reports `○ 10m`, because `force-static` settles the
 * question before the fetch does. Re-check that line in the build output if this
 * ever changes.
 */
export function createPublicClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { fetch: resilientFetch } },
  );
}
