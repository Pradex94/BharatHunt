"use client";

/* Design system: design.md (Bharat Hunt — orange) · /promote
 *
 * An odometer for numbers that change while you are looking at them.
 *
 * Each digit is a 0–9 strip inside a one-line-tall clipping box; changing the
 * value translates the strip. That means the only animated property is
 * `transform` — no layout, no paint, no JavaScript per frame, and no animation
 * library. Roughly forty of these can be on screen at once (six board rows,
 * three slot cards, a countdown) and the cost is a handful of compositor
 * transitions.
 *
 * Two details worth keeping:
 *
 * 1. **Digit columns are keyed from the right.** When ₹950 becomes ₹1,050 the
 *    string grows, and keying by left-to-right index would make every existing
 *    digit re-key and jump. Counting from the end keeps the units column the
 *    units column.
 *
 * 2. **Width comes from an invisible copy of the digit**, not a hard-coded em
 *    value. `Numeric` type here is JetBrains Mono, which is not preloaded — for
 *    the first moments of a page load these render in the metric-matched
 *    fallback, and a box sized in `em` against the wrong face would clip. A
 *    real glyph sizes itself correctly in whichever face is live.
 */

import { cn } from "@/lib/utils";
import { formatInr } from "@/lib/promote";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

/** Line box height, in ems. Also the per-digit travel distance. */
const LINE = 1.15;

function Digit({ digit }: { digit: number }) {
  return (
    <span className="relative block overflow-hidden" style={{ height: `${LINE}em` }}>
      {/* Sizes the column to one glyph of the live font, and nothing else. */}
      <span className="invisible block" aria-hidden>
        {digit}
      </span>
      <span
        className="absolute inset-x-0 top-0 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ transform: `translateY(-${digit * LINE}em)` }}
      >
        {DIGITS.map((value) => (
          <span key={value} className="block text-center">
            {value}
          </span>
        ))}
      </span>
    </span>
  );
}

/**
 * Rolls the digits of `text`, leaving every other character (₹, commas, colons)
 * static. Announced to assistive technology once, as plain text — a screen
 * reader should not have to walk ten digit strips to hear one number.
 */
export function RollingText({ text, className }: { text: string; className?: string }) {
  const characters = [...text];

  return (
    <span className={cn("font-mono tabular-nums tracking-tight", className)}>
      <span className="sr-only">{text}</span>
      <span aria-hidden className="inline-flex leading-[1.15]">
        {characters.map((character, index) => {
          // Position from the end, so the columns survive the number growing.
          const fromEnd = characters.length - 1 - index;

          if (!/[0-9]/.test(character)) {
            return (
              <span key={`static-${fromEnd}`} className="block">
                {character}
              </span>
            );
          }
          return <Digit key={`digit-${fromEnd}`} digit={Number(character)} />;
        })}
      </span>
    </span>
  );
}

/** A rupee amount, rolled. `2400` → `₹2,400`. */
export function RollingAmount({ value, className }: { value: number; className?: string }) {
  return <RollingText text={formatInr(value)} className={className} />;
}
