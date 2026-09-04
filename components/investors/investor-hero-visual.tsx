/* Design system: design.md (Bharat Hunt — orange) · /investors hero
 *
 * The stack of investor cards beside the headline.
 *
 * A **server component with no JavaScript at all.** Everything that moves is a
 * CSS keyframe on `transform`/`opacity` (see the `/investors` block in
 * app/globals.css), which the compositor runs off the main thread. That is the
 * whole performance story for this section: no framer-motion, no rAF loop, no
 * IntersectionObserver, nothing to hydrate.
 *
 * It is also why the animation is CSS rather than the `FadeIn` helpers this repo
 * already has. Those render `opacity: 0` into the server HTML and only reveal on
 * hydration — components/ui/motion.tsx documents at length how that made the
 * navbar logo the LCP element of the homepage. This is first-viewport content,
 * so it paints at its final opacity and only ever moves.
 *
 * The names and figures below are illustrative furniture, not data. They are
 * deliberately generic ("Seed Fund", "Growth Partners") and carry no contact
 * details, no real firm and no claim about anyone — the honest way to draw a
 * picture of a directory without shipping a sample of it into the marketing
 * half of the page.
 */

import { Lock, MapPin } from "lucide-react";

import { cn } from "@/lib/utils";
import { Numeric } from "@/components/ui/typography";

type HeroCard = {
  name: string;
  kind: string;
  location: string;
  stages: string[];
  sectors: string[];
  cheque: string;
  /** Drawn as bars instead of text — the locked look, with nothing behind it. */
  locked?: boolean;
};

const CARDS: HeroCard[] = [
  {
    name: "Seed Fund",
    kind: "Micro VC",
    location: "Bengaluru",
    stages: ["Pre-Seed", "Seed"],
    sectors: ["SaaS", "AI"],
    cheque: "₹25L – ₹2Cr",
  },
  {
    name: "Growth Partners",
    kind: "VC",
    location: "Mumbai",
    stages: ["Series A"],
    sectors: ["FinTech"],
    cheque: "₹4Cr – ₹20Cr",
  },
  { name: "", kind: "", location: "", stages: [], sectors: [], cheque: "", locked: true },
];

function Tag({ children, tone }: { children: React.ReactNode; tone?: "primary" }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full px-2 text-[10px] font-medium",
        tone === "primary"
          ? "bg-primary/15 text-primary"
          : "bg-white/10 text-white/70",
      )}
    >
      {children}
    </span>
  );
}

function Card({ card, className }: { card: HeroCard; className?: string }) {
  return (
    <div
      className={cn(
        "w-full rounded-2xl border border-white/10 bg-surface-dark-elevated p-4 shadow-soft",
        className,
      )}
    >
      {card.locked ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="size-9 shrink-0 rounded-full bg-white/10" />
            <div className="flex flex-1 flex-col gap-1.5">
              <span className="block h-2.5 w-2/3 rounded-full bg-white/10" />
              <span className="block h-2 w-2/5 rounded-full bg-white/[0.07]" />
            </div>
            <Lock className="size-3.5 shrink-0 text-primary/70" aria-hidden="true" />
          </div>
          <span className="block h-2 w-4/5 rounded-full bg-white/[0.07]" />
          <span className="block h-2 w-3/5 rounded-full bg-white/[0.07]" />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
              {card.name.slice(0, 1)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{card.name}</p>
              <p className="truncate text-[11px] text-white/50">{card.kind}</p>
            </div>
          </div>

          <p className="flex items-center gap-1 text-[11px] text-white/60">
            <MapPin className="size-3 shrink-0" aria-hidden="true" />
            {card.location}
          </p>

          <div className="flex flex-wrap gap-1">
            {card.stages.map((stage) => (
              <Tag key={stage} tone="primary">
                {stage}
              </Tag>
            ))}
            {card.sectors.map((sector) => (
              <Tag key={sector}>{sector}</Tag>
            ))}
          </div>

          <Numeric className="text-[11px] text-white/70">{card.cheque}</Numeric>
        </div>
      )}
    </div>
  );
}

export function InvestorHeroVisual({ className }: { className?: string }) {
  return (
    /*
     * `aria-hidden`: this is a picture of the product, and every word in it is
     * repeated as real copy in the hero beside it. A screen reader announcing
     * three decorative fund names would be reading furniture aloud.
     */
    <div aria-hidden="true" className={cn("relative", className)}>
      {/* The soft orange bloom behind the stack. A radial gradient, not a blur
          filter: same look, a fraction of the paint cost. */}
      <span className="glow-orange pointer-events-none absolute -inset-8 opacity-60" />

      {/* The connective tissue. Two hairlines with a travelling dash, drawn
          behind the cards and hidden below `lg` where the stack is a simple
          column and the lines would cross the wrong things. */}
      <svg
        className="pointer-events-none absolute inset-0 hidden size-full lg:block"
        viewBox="0 0 320 340"
        fill="none"
        preserveAspectRatio="none"
      >
        <path
          d="M70 96 L250 176"
          className="bh-inv-line"
          stroke="var(--color-primary)"
          strokeWidth="1"
          pathLength="100"
        />
        <path
          d="M250 176 L90 268"
          className="bh-inv-line bh-inv-line-delay"
          stroke="var(--color-primary)"
          strokeWidth="1"
          pathLength="100"
        />
      </svg>

      <div className="relative flex flex-col gap-4">
        {/*
         * Three floats at different durations and offsets so the group never
         * settles into a single synchronised bob. The middle card is inset from
         * the right on wide screens for depth; below `lg` the offsets collapse
         * so the stack stays inside a 320px viewport.
         */}
        <Card card={CARDS[0]} className="bh-inv-float-a lg:mr-10" />
        <Card card={CARDS[1]} className="bh-inv-float-b lg:ml-10" />
        <Card card={CARDS[2]} className="bh-inv-float-c lg:mr-6" />
      </div>
    </div>
  );
}
