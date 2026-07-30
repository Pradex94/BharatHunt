import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

/**
 * Service-role Supabase client — bypasses RLS. Use ONLY in code paths already
 * gated by a server-side admin/authorization check (see lib/admin.ts) or in
 * trusted server-to-server contexts (e.g. webhooks). Never expose to the client.
 */
export function createServiceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
