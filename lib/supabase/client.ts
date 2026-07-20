"use client";

import { useMemo } from "react";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { useSession } from "@clerk/nextjs";
import type { Database } from "@/types/database";

export function useSupabaseClient() {
  const { session } = useSession();

  return useMemo(
    () =>
      createSupabaseClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          async accessToken() {
            return session?.getToken() ?? null;
          },
        },
      ),
    [session],
  );
}
