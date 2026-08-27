"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Whether the visitor has asked the OS to reduce motion.
 *
 * `globals.css` already collapses CSS transitions and framer-motion already
 * honours the setting via `<MotionConfig reducedMotion="user">`. Neither covers
 * animation driven by JavaScript deciding *when* to change state — a
 * leaderboard that reshuffles itself every few seconds is motion whether or not
 * the transition between arrangements is drawn, so the timer itself has to
 * stop. That is what this hook is for.
 *
 * `useSyncExternalStore` rather than `useState` + an effect: `matchMedia` is
 * exactly the "external store" this hook is built for, and it takes an explicit
 * server snapshot. The server has no media query to read, so it reports `false`
 * — the same value the client renders during hydration, after which React
 * re-renders with the real one if they differ. No mismatch, and no cascading
 * setState on mount.
 */

function subscribe(onStoreChange: () => void): () => void {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onStoreChange);
  return () => media.removeEventListener("change", onStoreChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches;
}

/** No media queries during SSR — assume motion is allowed, then correct. */
function getServerSnapshot(): boolean {
  return false;
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
