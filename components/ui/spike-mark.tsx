import type { SVGProps } from "react";

/**
 * Anthropic-style radial spike-mark — a small asterisk-like glyph with tapered
 * spokes. Used as the brand wordmark prefix and as an inline content marker.
 * Renders in `currentColor` so callers control the tone; per the design system
 * the mark is never inverted to white within the wordmark itself.
 */
export function SpikeMark({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
      {...props}
    >
      {/* Eight tapered spokes radiating from the centre. */}
      <path d="M12 1.5c.5 0 .9.35.98.84L12 12l-.98-9.66A1 1 0 0 1 12 1.5Z" />
      <path d="M22.5 12c0 .5-.35.9-.84.98L12 12l9.66-.98A1 1 0 0 1 22.5 12Z" />
      <path d="M12 22.5c-.5 0-.9-.35-.98-.84L12 12l.98 9.66A1 1 0 0 1 12 22.5Z" />
      <path d="M1.5 12c0-.5.35-.9.84-.98L12 12l-9.66.98A1 1 0 0 1 1.5 12Z" />
      <path d="M19.42 4.58c.35.35.38.9.06 1.27L12 12l6.15-7.48c.37-.32.92-.29 1.27.06Z" />
      <path d="M19.42 19.42c-.35.35-.9.38-1.27.06L12 12l7.48 6.15c.32.37.29.92-.06 1.27Z" />
      <path d="M4.58 19.42c-.35-.35-.38-.9-.06-1.27L12 12l-6.15 7.48c-.37.32-.92.29-1.27-.06Z" />
      <path d="M4.58 4.58c.35-.35.9-.38 1.27-.06L12 12 4.52 5.85c-.32-.37-.29-.92.06-1.27Z" />
    </svg>
  );
}
