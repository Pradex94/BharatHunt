"use client";

import { useEffect, useRef } from "react";

const DURATION_MS = 1400;

const format = (value: number) => value.toLocaleString("en-IN");

/**
 * A number that counts up from zero the first time it scrolls into view.
 *
 * The server HTML carries the real figure, so crawlers, no-JS visitors and
 * LCP all see the final count — the animation only starts after hydration and
 * writes straight to the DOM node, so it costs no React re-renders. An
 * invisible copy of the final value reserves the width, so the row does not
 * shift as digits are added. Reduced-motion users get the static number.
 */
export function CountUp({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || value <= 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    node.textContent = format(0);

    const run = () => {
      const start = performance.now();
      const tick = (now: number) => {
        const progress = Math.min((now - start) / DURATION_MS, 1);
        // easeOutCubic: fast start, gentle landing on the real figure.
        const eased = 1 - Math.pow(1 - progress, 3);
        node.textContent = format(Math.round(eased * value));
        if (progress < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          run();
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(node);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      node.textContent = format(value);
    };
  }, [value]);

  return (
    <span className="inline-grid">
      <span aria-hidden className="invisible col-start-1 row-start-1">
        {format(value)}
      </span>
      <span ref={ref} className="col-start-1 row-start-1">
        {format(value)}
      </span>
    </span>
  );
}
