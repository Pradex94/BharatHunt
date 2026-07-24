"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type ParamUpdates = Record<string, string | null>;

/**
 * Returns a function that merges the given key/value pairs into the current
 * URL's search params (a `null`/empty value removes the key) and navigates
 * to the resulting URL. Shared by every marketplace filter control so
 * filters/search/sort/pagination all live in the URL, not client state.
 */
export function useUpdateSearchParams() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return useCallback(
    (updates: ParamUpdates, options?: { resetPage?: boolean }) => {
      const params = new URLSearchParams(searchParams.toString());

      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }

      if (options?.resetPage) {
        params.delete("page");
      }

      const query = params.toString();
      router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );
}
