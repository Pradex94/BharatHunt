import Link from "next/link";
import {
  ArrowRight,
  Banknote,
  Code2,
  Layers,
  Rocket,
  Sparkles,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Display } from "@/components/ui/typography";
import { IndiaFlag } from "@/components/ui/india-flag";
import { SearchAutocomplete } from "@/components/layout/search-autocomplete";

/** Grid fade: solid through the headline, gone before the section ends. */
const GRID_FADE = "linear-gradient(to bottom, #000 0%, #000 30%, transparent 88%)";

/** One node of the ecosystem visual — a real destination with a real count. */
export type EcosystemNode = {
  label: string;
  href: string;
  /** "12 products", "34 stories today" … omitted when there is no true number. */
  meta: string | null;
  icon: "ai" | "saas" | "fintech" | "dev" | "startups" | "productivity";
};

const NODE_ICON: Record<EcosystemNode["icon"], LucideIcon> = {
  ai: Sparkles,
  saas: Layers,
  fintech: Wallet,
  dev: Code2,
  startups: Banknote,
  productivity: Zap,
};

/** Where the six nodes sit, as % of the square — a hexagon around the centre. */
const NODE_POSITIONS = [
  { x: 50, y: 9 },
  { x: 84, y: 29 },
  { x: 84, y: 71 },
  { x: 50, y: 91 },
  { x: 16, y: 71 },
  { x: 16, y: 29 },
];

export type HeroProps = {
  nodes: EcosystemNode[];
  /** Quick-search shortcuts under the input. Real destinations only. */
  shortcuts: { label: string; href: string }[];
};

/*
 * No entrance animation anywhere in here — this is the LCP region.
 * components/ui/motion.tsx explains what wrapping the first viewport in
 * `FadeIn` cost this site (field LCP 4.3s). The hero paints at full opacity.
 *
 * Shorter than the old hero on purpose: the headline, the search and both
 * CTAs sit in the first viewport, and the first row of "Today's Hunt" starts
 * right under it on a laptop, so the product feed is never a scroll away.
 */
export function Hero({ nodes, shortcuts }: HeroProps) {
  return (
    <section className="relative isolate overflow-hidden">
      {/* Warm canvas wash → page floor. Orange is the only chromatic colour. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-20 bg-[linear-gradient(180deg,#fff3ec_0%,#fff9f5_55%,#ffffff_100%)]"
      />
      {/* Fine grid, masked so it dissolves before the section ends. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-20"
        style={{
          backgroundImage:
            "linear-gradient(rgba(23,20,15,0.07) 1px, transparent 0), linear-gradient(90deg, rgba(23,20,15,0.07) 1px, transparent 0)",
          backgroundSize: "28px 28px",
          backgroundPosition: "top center",
          WebkitMaskImage: GRID_FADE,
          maskImage: GRID_FADE,
        }}
      />

      <div className="mx-auto grid grid-cols-1 w-full max-w-7xl items-center gap-10 px-4 pt-12 pb-10 sm:px-6 md:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] lg:gap-14 lg:px-8 lg:pt-20 lg:pb-16">
        <div className="flex min-w-0 flex-col items-start gap-6">
          <span className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-body shadow-sm">
            <IndiaFlag className="h-3.5 w-auto shrink-0 rounded-[3px]" />
            Startups · AI · Software · Funding
          </span>

          <Display className="max-w-[16ch] text-[2.5rem] leading-[1.05] sm:text-6xl lg:text-[64px]">
            Discover what&rsquo;s being built in <span className="text-primary">India</span>.
          </Display>

          <p className="max-w-xl text-lg leading-relaxed text-body">
            Find the startups, AI products and software worth knowing before everyone else &mdash;
            and the funding and investors behind them.
          </p>

          <div className="w-full max-w-xl">
            <SearchAutocomplete
              tone="hero"
              placeholder="Search startups, products, AI tools, companies…"
            />
            {shortcuts.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted">Popular:</span>
                {shortcuts.map((shortcut) => (
                  <Link
                    key={shortcut.href}
                    href={shortcut.href}
                    className="rounded-full border border-border bg-card px-3 py-1 font-medium text-body transition-colors hover:border-primary/40 hover:text-primary"
                  >
                    {shortcut.label}
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Link href="/marketplace" className={buttonVariants({ size: "lg" })}>
              Explore Products
              <ArrowRight aria-hidden="true" />
            </Link>
            {/* Not prefetched: most homepage visitors are signed out, and for them
                /submit is a redirect to /login — a full render thrown away. */}
            <Link
              href="/submit"
              prefetch={false}
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              <Rocket aria-hidden="true" />
              Launch Your Product
            </Link>
          </div>
        </div>

        {nodes.length > 0 && <EcosystemMap nodes={nodes.slice(0, NODE_POSITIONS.length)} />}
      </div>
    </section>
  );
}

/**
 * The ecosystem, drawn as a constellation: Bharat Hunt in the middle, the
 * things you can discover around it, each one a link with a live count.
 *
 * Plain SVG lines under absolutely positioned HTML chips — no canvas, no
 * WebGL, no animation library, no client JavaScript and no animation at all —
 * a still diagram costs nothing to paint and never competes with the headline.
 * Desktop only: on a phone the same destinations are the "Popular" chips under
 * the search, which is where a thumb is anyway.
 */
function EcosystemMap({ nodes }: { nodes: EcosystemNode[] }) {
  return (
    <nav aria-label="Explore the ecosystem" className="relative mx-auto hidden aspect-square w-full max-w-[460px] lg:block">
      <div
        aria-hidden
        className="absolute inset-[18%] rounded-full bg-[radial-gradient(circle,rgba(255,138,61,0.20),transparent_70%)] blur-2xl"
      />
      <svg aria-hidden viewBox="0 0 100 100" className="absolute inset-0 size-full">
        <circle cx="50" cy="50" r="41" fill="none" stroke="rgba(23,20,15,0.08)" strokeWidth="0.25" />
        <circle cx="50" cy="50" r="24" fill="none" stroke="rgba(255,107,26,0.18)" strokeWidth="0.25" />
        {nodes.map((node, index) => {
          const { x, y } = NODE_POSITIONS[index];
          return (
            <line
              key={node.href}
              x1="50"
              y1="50"
              x2={x}
              y2={y}
              stroke="rgba(255,107,26,0.45)"
              strokeWidth="0.3"
              strokeDasharray="1 1.4"
            />
          );
        })}
      </svg>

      {/* The hub */}
      <div className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2">
        <span className="flex size-20 items-center justify-center rounded-3xl bg-[linear-gradient(135deg,#ff6b1a,#ff8a3d)] text-3xl font-bold text-white shadow-[0_18px_40px_-12px_rgba(255,107,26,0.65)]">
          B
        </span>
        <span className="rounded-full bg-card/90 px-2.5 py-0.5 text-xs font-semibold text-ink shadow-sm">
          Bharat Hunt
        </span>
      </div>

      {nodes.map((node, index) => {
        const { x, y } = NODE_POSITIONS[index];
        const Icon = NODE_ICON[node.icon];
        return (
          <Link
            key={node.href}
            href={node.href}
            style={{ left: `${x}%`, top: `${y}%` }}
            className="group absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-2.5 rounded-2xl border border-border bg-card py-2 pr-3.5 pl-2 whitespace-nowrap shadow-sm transition-all duration-200 hover:border-primary/40 hover:shadow-hover"
          >
            <span className="flex size-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-sm font-semibold text-ink group-hover:text-primary">
                {node.label}
              </span>
              {node.meta && <span className="text-[11px] text-muted">{node.meta}</span>}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
