import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import { inter } from "../fonts";
import type { LaunchPromoProps } from "../schema";

/**
 * Scene 4 — the only place in the video that asks for anything.
 *
 * The brand gradient fills the frame here and nowhere else, so the one screen
 * carrying an instruction is also the one that looks different from every screen
 * before it. Held for two and a half seconds: long enough to read a URL and act
 * on it, which is longer than a scene needs for any other purpose.
 *
 * The full product URL is shown rather than a bare domain. Someone watching this
 * on a phone cannot click it, so the thing on screen has to be the thing they can
 * type or search -- "bharathunt.org" alone would land them on a homepage and
 * make them hunt for the product they were just sold.
 *
 * ── Why the URL is two elements instead of one string ────────────────────────
 * As a single line it overflowed and had to be wrapped, and `wordBreak` put the
 * break wherever the box ran out: "bharathunt.org/product" over "s/zentask".
 * A URL broken mid-word is not a URL any more. Splitting the domain from the
 * path puts the line break where a reader expects one, at a boundary that
 * happens to be the same for every product.
 */
export const Cta: React.FC<LaunchPromoProps> = ({ slug }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Slugs are derived from product names, so they run long. Two steps keep the
  // path on one line at either extreme rather than wrapping it.
  const pathSize = slug.length > 22 ? 46 : 58;

  return (
    <AbsoluteFill
      name="Call to action"
      style={{
        backgroundImage: "linear-gradient(135deg, #ff6b1a 0%, #ff8a3d 100%)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        padding: 96,
        fontFamily: inter,
      }}
    >
      <Interactive.Div
        name="Kicker"
        style={{
          fontSize: 52,
          fontWeight: 600,
          letterSpacing: 4,
          textTransform: "uppercase",
          color: "rgba(255, 255, 255, 0.85)",
          opacity: interpolate(frame, [0, 0.6 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        Upvote it now
      </Interactive.Div>

      <Interactive.Div
        name="Domain"
        style={{
          marginTop: 36,
          fontSize: 92,
          fontWeight: 800,
          lineHeight: 1.1,
          letterSpacing: -2,
          textAlign: "center",
          color: "#ffffff",
          opacity: interpolate(frame, [0.3 * fps, 1 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          scale: interpolate(frame, [0.3 * fps, 1.1 * fps], [0.92, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            output: "perceptual-scale",
          }),
        }}
      >
        bharathunt.org
      </Interactive.Div>

      <Interactive.Div
        name="Product path"
        style={{
          marginTop: 12,
          fontSize: pathSize,
          fontWeight: 600,
          lineHeight: 1.2,
          textAlign: "center",
          color: "rgba(255, 255, 255, 0.92)",
          opacity: interpolate(frame, [0.55 * fps, 1.2 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        /products/{slug}
      </Interactive.Div>

      <Interactive.Div
        name="Closing rule"
        style={{
          marginTop: 56,
          height: 8,
          borderRadius: 4,
          backgroundColor: "rgba(255, 255, 255, 0.9)",
          width: interpolate(frame, [0.8 * fps, 1.8 * fps], [0, 220], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      />
    </AbsoluteFill>
  );
};
