/**
 * localStorage-backed lists for the discovery actions (saves made while signed
 * out, and the compare tray), shaped for `useSyncExternalStore` — the same
 * pattern as lib/cookie-consent.ts, so React reads storage without an effect
 * and every component sees one consistent snapshot.
 *
 * Snapshots are cached per key and only replaced on a real change, because
 * `useSyncExternalStore` compares by reference and a fresh `JSON.parse` on
 * every read would loop. Every storage access is wrapped: private windows and
 * blocked site data throw, and the page must keep working in memory.
 */

const EMPTY: readonly unknown[] = Object.freeze([]);
const cache = new Map<string, readonly unknown[]>();
const listeners = new Set<() => void>();

function parse(key: string): readonly unknown[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : EMPTY;
  } catch {
    return EMPTY;
  }
}

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeDiscovery(listener: () => void): () => void {
  listeners.add(listener);
  function onStorage(event: StorageEvent) {
    // Another tab changed a list: drop the cached snapshot so the next read re-parses.
    if (event.key && cache.has(event.key)) {
      cache.delete(event.key);
      emit();
    }
  }
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function readDiscoveryList(key: string): readonly unknown[] {
  const cached = cache.get(key);
  if (cached) return cached;
  const fresh = parse(key);
  cache.set(key, fresh);
  return fresh;
}

/** What the server renders: always empty, so the HTML is the same for everyone. */
export function serverDiscoveryList(): readonly unknown[] {
  return EMPTY;
}

export function writeDiscoveryList(key: string, value: readonly unknown[]): void {
  cache.set(key, value.length === 0 ? EMPTY : Object.freeze([...value]));
  try {
    if (value.length === 0) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable: the in-memory snapshot still serves this page.
  }
  emit();
}
