"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useAuth } from "@clerk/nextjs";

import { importLocalSaves, listSavedIds, setSaved } from "@/lib/actions/saves";
import { trackEvent } from "@/lib/analytics";
import { sendSignal } from "@/lib/signals-client";
import {
  readDiscoveryList,
  serverDiscoveryList,
  subscribeDiscovery,
  writeDiscoveryList,
} from "@/lib/discovery-store";
import { useIsHydrated } from "@/hooks/use-cookie-consent";

/**
 * Client state for the two discovery actions every product surface carries:
 * Save and Compare.
 *
 * Why client state rather than server props: product pages and the homepage
 * are cached and identical for every signed-out visitor (force-static pages,
 * and the edge cache in worker-entry.js), so nothing per-person can be in
 * their HTML. Buttons hydrate from here instead.
 *
 *   - Saves: signed out → localStorage; signed in → `bookmarks` via server
 *     actions. Local saves are imported into the account the first time the
 *     visitor is seen signed in, then cleared locally.
 *   - Compare: always localStorage. A comparison is a temporary working set,
 *     not a record — it persists across navigation and reloads, and there is
 *     nothing worth a database row in it.
 */

export const MAX_COMPARE = 4;

const SAVED_KEY = "bh:saved:v1";
const COMPARE_KEY = "bh:compare:v1";

export type CompareItem = {
  id: string;
  slug: string;
  name: string;
  logo: string | null;
};

type DiscoveryContextValue = {
  /** False until local storage (and, signed in, the account) has been read. */
  ready: boolean;
  isSignedIn: boolean;
  isSaved: (productId: string) => boolean;
  toggleSave: (productId: string) => Promise<{ error?: string }>;
  savedCount: number;
  /** Ids saved in this browser while signed out — what /saved lists for them. */
  localSavedIds: readonly string[];
  compare: readonly CompareItem[];
  isComparing: (productId: string) => boolean;
  /** Returns false when the tray is already full. */
  addToCompare: (item: CompareItem) => boolean;
  removeFromCompare: (productId: string) => void;
  clearCompare: () => void;
};

const DiscoveryContext = createContext<DiscoveryContextValue | null>(null);

const isId = (value: unknown): value is string => typeof value === "string" && value.length <= 64;
const isCompareItem = (value: unknown): value is CompareItem =>
  typeof value === "object" &&
  value !== null &&
  isId((value as CompareItem).id) &&
  typeof (value as CompareItem).slug === "string" &&
  typeof (value as CompareItem).name === "string";

function useStoredList<T>(key: string, valid: (value: unknown) => value is T): readonly T[] {
  const raw = useSyncExternalStore(subscribeDiscovery, () => readDiscoveryList(key), serverDiscoveryList);
  return useMemo(() => raw.filter(valid), [raw, valid]);
}

/** The account's saves, tagged with whose they are so a sign-out or switch never shows stale ones. */
type AccountSaves = { userId: string; ids: Set<string> };

export function DiscoveryProvider({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const hydrated = useIsHydrated();
  const localSaved = useStoredList(SAVED_KEY, isId);
  const storedCompare = useStoredList(COMPARE_KEY, isCompareItem);
  const compare = useMemo(() => storedCompare.slice(0, MAX_COMPARE), [storedCompare]);
  const [account, setAccount] = useState<AccountSaves | null>(null);

  const signedIn = Boolean(isLoaded && isSignedIn && userId);

  // The account's saves, once per signed-in user — importing local saves first.
  // State is only ever set from the async result, never synchronously here.
  useEffect(() => {
    if (!hydrated || !isLoaded || !isSignedIn || !userId) return;
    let cancelled = false;
    const pending = readDiscoveryList(SAVED_KEY).filter(isId);
    const load = pending.length > 0 ? importLocalSaves(pending) : listSavedIds();
    load
      .then((ids) => {
        if (cancelled) return;
        setAccount({ userId, ids: new Set(ids) });
        if (pending.length > 0) writeDiscoveryList(SAVED_KEY, []);
      })
      .catch(() => {
        // Local saves stay put and are imported on the next visit.
        if (!cancelled) setAccount({ userId, ids: new Set() });
      });
    return () => {
      cancelled = true;
    };
  }, [hydrated, isLoaded, isSignedIn, userId]);

  const accountIds = account && account.userId === userId ? account.ids : null;
  const savedSet = useMemo(
    () => (signedIn ? (accountIds ?? new Set<string>()) : new Set(localSaved)),
    [signedIn, accountIds, localSaved],
  );
  // Not gated on Clerk loading: until a session is confirmed the visitor is
  // treated as signed out and saves locally, and those saves are imported the
  // moment the session appears. If Clerk never loads (a blocked script), Save
  // and Compare still work instead of sitting disabled.
  const ready = hydrated && (!signedIn || accountIds !== null);

  const isSaved = useCallback((productId: string) => savedSet.has(productId), [savedSet]);

  const toggleSave = useCallback(
    async (productId: string): Promise<{ error?: string }> => {
      const next = !savedSet.has(productId);
      trackEvent(next ? "product_save" : "product_unsave", { product_id: productId });
      // Signed out too: an anonymous save is still a real signal for "Most saved".
      sendSignal(next ? "bookmark" : "unbookmark", productId, "save");

      if (!signedIn || !userId) {
        const updated = next
          ? [productId, ...localSaved.filter((id) => id !== productId)].slice(0, 200)
          : localSaved.filter((id) => id !== productId);
        writeDiscoveryList(SAVED_KEY, updated);
        return {};
      }

      const apply = (saved: boolean) =>
        setAccount((prev) => {
          const ids = new Set(prev && prev.userId === userId ? prev.ids : []);
          if (saved) ids.add(productId);
          else ids.delete(productId);
          return { userId, ids };
        });

      // Optimistic, then reconciled with what the server actually did.
      apply(next);
      const result = await setSaved(productId, next);
      if (result.saved !== next) apply(result.saved);
      return result.error ? { error: result.error } : {};
    },
    [savedSet, signedIn, userId, localSaved],
  );

  const isComparing = useCallback(
    (productId: string) => compare.some((item) => item.id === productId),
    [compare],
  );

  const addToCompare = useCallback(
    (item: CompareItem) => {
      if (compare.some((existing) => existing.id === item.id)) return true;
      if (compare.length >= MAX_COMPARE) return false;
      writeDiscoveryList(COMPARE_KEY, [...compare, item]);
      trackEvent("product_compare_add", { product_id: item.id });
      sendSignal("compare_add", item.id, "compare");
      return true;
    },
    [compare],
  );

  const removeFromCompare = useCallback(
    (productId: string) => {
      writeDiscoveryList(
        COMPARE_KEY,
        compare.filter((item) => item.id !== productId),
      );
      trackEvent("product_compare_remove", { product_id: productId });
      sendSignal("compare_remove", productId, "compare");
    },
    [compare],
  );

  const clearCompare = useCallback(() => writeDiscoveryList(COMPARE_KEY, []), []);

  const value = useMemo<DiscoveryContextValue>(
    () => ({
      ready,
      isSignedIn: signedIn,
      isSaved,
      toggleSave,
      savedCount: savedSet.size,
      localSavedIds: localSaved,
      compare,
      isComparing,
      addToCompare,
      removeFromCompare,
      clearCompare,
    }),
    [ready, signedIn, isSaved, toggleSave, savedSet, localSaved, compare, isComparing, addToCompare, removeFromCompare, clearCompare],
  );

  return <DiscoveryContext.Provider value={value}>{children}</DiscoveryContext.Provider>;
}

export function useDiscovery(): DiscoveryContextValue {
  const context = useContext(DiscoveryContext);
  if (!context) throw new Error("useDiscovery must be used inside <DiscoveryProvider>.");
  return context;
}
