import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

type HeadingTag = "h1" | "h2" | "h3" | "h4";
type HeadingProps = ComponentPropsWithoutRef<"h1"> & { as?: HeadingTag };

function heading(defaultTag: HeadingTag, baseClassName: string) {
  function Heading({ as, className, ...props }: HeadingProps) {
    const Tag = as ?? defaultTag;
    return <Tag className={cn(baseClassName, className)} {...props} />;
  }
  return Heading;
}

type TextTag = "p" | "span" | "div";
type TextProps = ComponentPropsWithoutRef<"p"> & { as?: TextTag };

function text(defaultTag: TextTag, baseClassName: string) {
  function Text({ as, className, ...props }: TextProps) {
    const Tag = as ?? defaultTag;
    return <Tag className={cn(baseClassName, className)} {...props} />;
  }
  return Text;
}

/*
 * Modern-SaaS voice: Inter, bold, tight tracking. Large and confident
 * (Apple / Linear / Product Hunt). The base h1–h4 rule in globals.css sets
 * font-sans/700/-0.02em; these class strings add the sizes and let non-heading
 * tags (via `as`) inherit the same look.
 */
const DISPLAY_BASE = "font-sans font-bold text-foreground";

/** Hero-scale display headline. Defaults to <h1> — pass `as` to keep the
 * page's real h1 elsewhere and use this purely for visual scale. */
export const Display = heading(
  "h1",
  `${DISPLAY_BASE} text-5xl leading-[1.05] tracking-[-0.03em] sm:text-6xl md:text-[68px]`,
);

export const H1 = heading(
  "h1",
  `${DISPLAY_BASE} text-3xl sm:text-4xl md:text-5xl tracking-[-0.025em]`,
);

export const H2 = heading(
  "h2",
  `${DISPLAY_BASE} text-3xl sm:text-4xl tracking-[-0.02em]`,
);

export const H3 = heading(
  "h3",
  `${DISPLAY_BASE} text-xl sm:text-2xl tracking-[-0.015em]`,
);

/** Larger supporting paragraph — hero subheadlines, section intros. */
export const Lead = text("p", "text-lg leading-relaxed text-body");

export const Body = text("p", "text-base leading-relaxed text-body");

export const Small = text("span", "text-sm text-muted-foreground");

type CaptionTag = HeadingTag | TextTag;
type CaptionProps = ComponentPropsWithoutRef<"span"> & { as?: CaptionTag };

/**
 * Uppercase, tracked-out label for eyebrows and footer/section labels.
 * Unlike the other text helpers, `as` also accepts heading tags — this is
 * often used as a real (small, styled) heading, e.g. a footer column's <h3>.
 */
export function Caption({ as, className, ...props }: CaptionProps) {
  const Tag = as ?? "span";
  return (
    <Tag
      className={cn(
        // font-sans forces the humanist sans even when rendered as a heading
        // tag (headings default to the serif display face via globals.css).
        // text-muted (#6c6a64) clears WCAG AA on cream; muted-soft would not.
        "font-sans text-xs font-medium tracking-[0.12em] text-muted uppercase",
        className,
      )}
      {...props}
    />
  );
}

/**
 * The signature numeric treatment: monospace + tabular figures, reserved for
 * prices, discount %, ratings, and counts — never for prose.
 */
export const numericClassName = "font-mono tabular-nums tracking-tight";
export const Numeric = text("span", numericClassName);
