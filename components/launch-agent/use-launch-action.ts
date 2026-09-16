"use client";

import { useCallback, useState, useTransition } from "react";

export type Notice = { kind: "success" | "error"; text: string; url?: string | null } | null;

type Result = { ok: true; message?: string; url?: string | null } | { ok: false; error: string };

/**
 * Runs a Launch Agent server action inside a transition and turns its result
 * into a visible notice. Every failure surfaces — nothing fails silently. The
 * action's own `revalidatePath` refreshes the server-rendered data in the same
 * round trip, so there is no polling and no manual refetch.
 */
export function useLaunchAction() {
  const [pending, startTransition] = useTransition();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const run = useCallback((key: string, action: () => Promise<Result>, onSuccess?: (result: Extract<Result, { ok: true }>) => void) => {
    setPendingKey(key);
    setNotice(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) {
          if (result.message) setNotice({ kind: "success", text: result.message, url: result.url });
          onSuccess?.(result);
        } else {
          setNotice({ kind: "error", text: result.error });
        }
      } catch {
        setNotice({ kind: "error", text: "Something went wrong. Your BharatHunt product is safe — try again." });
      } finally {
        setPendingKey(null);
      }
    });
  }, []);

  return { pending, pendingKey, notice, setNotice, run };
}
