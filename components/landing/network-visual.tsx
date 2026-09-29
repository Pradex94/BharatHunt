"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import type { NetworkNode, NetworkNodeKey } from "@/lib/network-summary";
import { CategoryIcon } from "@/components/ui/icon-tile";

/**
 * Where each node sits, as % of the square, clockwise from the top. Slightly
 * off a perfect hexagon on purpose — a data network, not a clock face.
 * `float` gives every node its own drift so no two move in step.
 */
const LAYOUT: Record<
  NetworkNodeKey,
  { x: number; y: number; float: { duration: number; delay: number; fx: number; fy: number } }
> = {
  ai: { x: 50, y: 9, float: { duration: 6.2, delay: -1.1, fx: 0, fy: -3 } },
  dev: { x: 84, y: 27, float: { duration: 7.4, delay: -3.6, fx: 2, fy: -2 } },
  fintech: { x: 86, y: 69, float: { duration: 5.8, delay: -2.2, fx: 1, fy: 3 } },
  startups: { x: 53, y: 92, float: { duration: 6.9, delay: -4.8, fx: -1, fy: 3 } },
  productivity: { x: 14, y: 72, float: { duration: 8.1, delay: -0.4, fx: -2, fy: 2 } },
  saas: { x: 17, y: 28, float: { duration: 6.6, delay: -5.3, fx: -1, fy: -3 } },
};

/** One packet per node per 18s cycle, 3s apart — one in flight at a time. */
const PACKET_SPACING = 3;
/** Packets stop short of the chip's centre so they land at its edge, visibly. */
const REACH = 0.78;
const TICKER_MS = 4000;

/** Faint static dots on the outer ring — the "rest of the network". */
const OUTER_DOTS = [
  [22, 12], [80, 9], [97, 46], [74, 95], [25, 91], [3, 52], [62, 3], [93, 83],
] as const;

/**
 * "Bharat Hunt intelligence" — the hero's discovery network.
 *
 * A client component for three small jobs only: which node is hovered or
 * focused, whether the network is on screen, and which status line is showing.
 * Every moving part is a CSS keyframe in app/globals.css (`bh-net-*`) on
 * transform or opacity; there is no animation loop in JavaScript.
 *
 * Server-rendered in full, at full opacity, with the first status line already
 * in place, so it adds nothing to LCP (the headline is the LCP element),
 * cannot shift layout, and hydrates without a mismatch.
 *
 * Every node is a real link (`<a>`) with its label and count as text, so the
 * destinations are crawlable and keyboard-reachable. Two compositions share
 * the data: the orbit from `lg`, a hub-and-grid below it.
 */
export function NetworkVisual({ nodes }: { nodes: NetworkNode[] }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<NetworkNodeKey | null>(null);
  const [inView, setInView] = useState(true);
  const [tick, setTick] = useState(0);

  const messages = nodes.map((node) => node.ticker).filter((m): m is string => Boolean(m));

  // Pause every animation while the network is off screen.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      rootMargin: "80px",
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Rotate the status line — only on screen, only when motion is welcome.
  useEffect(() => {
    if (!inView || messages.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => setTick((t) => t + 1), TICKER_MS);
    return () => clearInterval(timer);
  }, [inView, messages.length]);

  if (nodes.length === 0) return null;

  const message = messages.length > 0 ? messages[tick % messages.length] : null;
  const hover = (key: NetworkNodeKey | null) => () => setActive(key);

  return (
    <div
      ref={rootRef}
      data-paused={!inView}
      className="bh-net relative w-full min-w-0"
    >
      <StatusLine message={message} messageKey={tick} />

      {/* ── Desktop: the orbit ─────────────────────────────────────────── */}
      <nav
        aria-label="Explore the Bharat Hunt ecosystem"
        className="relative mx-auto mt-3 hidden aspect-square w-full max-w-[460px] lg:block"
        onPointerLeave={hover(null)}
      >
        <svg aria-hidden viewBox="0 0 100 100" className="absolute inset-0 size-full overflow-visible">
          {/* Outer: the faint wider network */}
          <circle cx="50" cy="50" r="48" fill="none" stroke="rgba(23,20,15,0.06)" strokeWidth="0.2" strokeDasharray="0.6 1.8" />
          {OUTER_DOTS.map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="0.45" fill="rgba(255,107,26,0.35)" />
          ))}
          {/* Middle: the category orbit, a tilted ellipse rather than a ring */}
          <ellipse
            cx="50"
            cy="50"
            rx="37"
            ry="41"
            transform="rotate(-14 50 50)"
            fill="none"
            stroke="rgba(255,107,26,0.16)"
            strokeWidth="0.25"
          />
          {/* Node-to-node edges: the network, not just spokes */}
          <polygon
            points={nodes.map((n) => `${LAYOUT[n.key].x},${LAYOUT[n.key].y}`).join(" ")}
            fill="none"
            stroke="rgba(23,20,15,0.05)"
            strokeWidth="0.2"
          />

          {/* Spokes, packets and hover bursts */}
          {nodes.map((node, index) => {
            const { x, y } = LAYOUT[node.key];
            const on = active === node.key;
            const vector = {
              "--dx": `${(x - 50) * REACH}px`,
              "--dy": `${(y - 50) * REACH}px`,
            } as React.CSSProperties;
            return (
              <g
                key={node.key}
                className="transition-opacity duration-300"
                style={{ opacity: active && !on ? 0.3 : 1 }}
              >
                <line
                  x1="50"
                  y1="50"
                  x2={x}
                  y2={y}
                  stroke={on ? "rgba(255,107,26,0.85)" : "rgba(255,107,26,0.4)"}
                  strokeWidth={on ? 0.45 : 0.3}
                  strokeDasharray="1 1.4"
                  className="bh-net-dash transition-[stroke,stroke-width] duration-300"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="0.9"
                  fill="#ff6b1a"
                  className="bh-net-packet"
                  style={{ ...vector, animationDelay: `${index * PACKET_SPACING}s`, filter: "drop-shadow(0 0 1.2px rgba(255,107,26,0.9))" }}
                />
                {on &&
                  [0, 0.5, 1].map((delay) => (
                    <circle
                      key={delay}
                      cx="50"
                      cy="50"
                      r="0.8"
                      fill="#ff6b1a"
                      className="bh-net-burst"
                      style={{ ...vector, animationDelay: `${delay}s` }}
                    />
                  ))}
              </g>
            );
          })}

          {/* Inner: the hub's ring */}
          <circle
            cx="50"
            cy="50"
            r="13"
            fill="none"
            stroke="rgba(255,107,26,0.35)"
            strokeWidth="0.3"
            strokeDasharray="2 1.5 0.4 1.5"
            className="bh-net-spin"
          />
        </svg>

        <Hub active={active !== null} />

        {nodes.map((node, index) => {
          const { x, y, float } = LAYOUT[node.key];
          const on = active === node.key;
          return (
            <Link
              key={node.key}
              href={node.href}
              prefetch={false}
              onPointerEnter={hover(node.key)}
              onFocus={hover(node.key)}
              onBlur={hover(null)}
              style={{ left: `${x}%`, top: `${y}%` }}
              className={cn(
                "group absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-2xl outline-none",
              )}
            >
              <span
                className="bh-net-float block"
                style={
                  {
                    animationDuration: `${float.duration}s`,
                    animationDelay: `${float.delay}s`,
                    "--fx": `${float.fx}px`,
                    "--fy": `${float.fy}px`,
                  } as React.CSSProperties
                }
              >
                <span
                  className={cn(
                    "relative flex items-center gap-2.5 rounded-2xl border bg-card py-2 pr-3.5 pl-2 whitespace-nowrap shadow-sm transition-[transform,border-color,box-shadow] duration-300 ease-out",
                    "group-focus-visible:ring-2 group-focus-visible:ring-primary group-focus-visible:ring-offset-2",
                    on
                      ? "scale-[1.06] border-primary/50 shadow-[0_10px_30px_-10px_rgba(255,107,26,0.55)]"
                      : "border-border",
                  )}
                >
                  {/* Landing flash for this node's packet — decorative only. */}
                  <span
                    aria-hidden
                    className="bh-net-arrive pointer-events-none absolute -inset-1 rounded-[18px] border border-primary/60"
                    style={{ animationDelay: `${index * PACKET_SPACING}s` }}
                  />
                  <CategoryIcon
                    topic={node.key}
                    size="sm"
                    className={cn("transition-[opacity,background-color] duration-300", active && !on && "opacity-40")}
                  />
                  <span
                    className={cn(
                      "flex flex-col leading-tight transition-opacity duration-300",
                      active && !on && "opacity-40",
                    )}
                  >
                    <span className={cn("text-sm font-semibold", on ? "text-primary" : "text-ink")}>
                      {node.label}
                    </span>
                    {node.meta && <span className="text-[11px] text-muted">{node.meta}</span>}
                  </span>
                </span>
              </span>
            </Link>
          );
        })}
      </nav>

      {/* ── Below lg: hub over a grid, not a shrunken orbit ──────────────── */}
      <nav
        aria-label="Explore the Bharat Hunt ecosystem"
        className="mt-3 rounded-3xl border border-border bg-card/70 p-4 sm:p-5 lg:hidden"
      >
        <div className="flex flex-col items-center">
          <Hub compact />
          {/* Fan-out from the hub to the grid: two columns, three from sm. */}
          <svg aria-hidden viewBox="0 0 100 12" preserveAspectRatio="none" className="h-5 w-full sm:hidden">
            {[25, 75].map((x) => (
              <path key={x} d={`M50 0 L${x} 12`} stroke="rgba(255,107,26,0.35)" strokeWidth="0.6" strokeDasharray="1.5 1.5" vectorEffect="non-scaling-stroke" fill="none" />
            ))}
          </svg>
          <svg aria-hidden viewBox="0 0 100 12" preserveAspectRatio="none" className="hidden h-5 w-full sm:block">
            {[16.7, 50, 83.3].map((x) => (
              <path key={x} d={`M50 0 L${x} 12`} stroke="rgba(255,107,26,0.35)" strokeWidth="0.6" strokeDasharray="1.5 1.5" vectorEffect="non-scaling-stroke" fill="none" />
            ))}
          </svg>
        </div>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {nodes.map((node) => {
            return (
              <li key={node.key} className="min-w-0">
                <Link
                  href={node.href}
                  prefetch={false}
                  className="group flex h-full min-h-11 items-center gap-2.5 rounded-2xl border border-border bg-card px-2.5 py-2 transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none active:bg-secondary-bg"
                >
                  <CategoryIcon topic={node.key} size="sm" />
                  <span className="flex min-w-0 flex-col leading-tight">
                    {/* Wraps rather than truncates: at 375px a two-column cell is
                        ~100px of text, and "Developer Tools" must stay readable. */}
                    <span className="text-[13px] font-semibold break-words text-ink sm:text-sm">
                      {node.label}
                    </span>
                    {node.meta && (
                      <span className="text-[11px] break-words text-muted">{node.meta}</span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

/**
 * "● Bharat Hunt intelligence" and one real figure at a time.
 *
 * Not "Live": the pipelines run on a schedule, so the label claims only what
 * the page can stand behind, and every rotating line is a count from the data.
 * Hidden from assistive tech — a line that changes every four seconds would be
 * noise; the same figures are on the node links themselves.
 */
function StatusLine({ message, messageKey }: { message: string | null; messageKey: number }) {
  return (
    <div aria-hidden className="flex flex-col items-center gap-1 text-center lg:items-start lg:pl-2 lg:text-left">
      <span className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-primary uppercase">
        <span className="relative flex size-2">
          <span className="bh-net-ping absolute inset-0 rounded-full bg-primary" />
          <span className="relative size-2 rounded-full bg-primary" />
        </span>
        Bharat Hunt intelligence
      </span>
      {/* Fixed height so a longer or shorter line never shifts the layout. */}
      <span className="block h-5 overflow-hidden text-sm text-body">
        {message && (
          <span key={messageKey} className="bh-net-fadein block truncate">
            {message}
          </span>
        )}
      </span>
    </div>
  );
}

function Hub({ active = false, compact = false }: { active?: boolean; compact?: boolean }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1.5",
        !compact && "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
      )}
    >
      <span className="relative flex items-center justify-center">
        <span
          aria-hidden
          className={cn(
            "bh-net-breathe absolute rounded-full bg-[radial-gradient(circle,rgba(255,138,61,0.45),transparent_68%)] transition-[inset] duration-300",
            compact ? "-inset-4" : active ? "-inset-8" : "-inset-6",
          )}
        />
        <span
          className={cn(
            "relative flex items-center justify-center bg-[linear-gradient(135deg,#ff6b1a,#ff8a3d)] font-bold text-white shadow-[0_18px_40px_-12px_rgba(255,107,26,0.65)] transition-transform duration-300",
            compact ? "size-12 rounded-2xl text-xl" : "size-20 rounded-3xl text-3xl",
            active && "scale-105",
          )}
        >
          B
        </span>
      </span>
      <span className="flex flex-col items-center rounded-xl bg-card/90 px-2.5 py-0.5 text-center shadow-sm">
        <span className="text-xs font-semibold text-ink">Bharat Hunt</span>
        {!compact && (
          <span className="text-[9px] font-semibold tracking-[0.16em] text-muted uppercase">
            Discovery engine
          </span>
        )}
      </span>
    </div>
  );
}
