import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import { inter, jetBrainsMono } from "../fonts";
import type { LaunchPromoProps } from "../schema";

/**
 * Scene 3 — the social proof, and the reason JetBrains Mono is in this project.
 *
 * The count animates from zero to the real figure. In a proportional face each
 * digit is a different width, so a number climbing through 0 → 412 visibly
 * reflows on almost every frame -- the whole block twitches. Mono's tabular
 * figures give every digit the same advance width, so only the glyphs change.
 *
 * The count-up is computed in the body rather than inline in `style` because it
 * is *content*, not a style value: `interpolate()` returns a float and a vote
 * count has to be a whole number, so it needs rounding before it is rendered.
 *
 * ── Every timing here has to finish before frame 75 ──────────────────────────
 * This scene runs 90 frames and the fade into the CTA starts at frame 75, so
 * anything still animating after that appears *during* its own fade-out. The
 * maker credit originally landed at frame 72 of a 75-frame scene and was
 * therefore never once fully visible -- it rendered at zero opacity in the
 * finished video while looking correct in the standalone scene composition.
 * Keep the last keyframe at or under 2.3s.
 */
export const Proof: React.FC<LaunchPromoProps> = ({ upvotes, makerName }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const counted = Math.round(
    interpolate(frame, [0.3 * fps, 1.8 * fps], [0, upvotes], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    }),
  );

  return (
    <AbsoluteFill
      name="Proof"
      style={{
        backgroundColor: "#0f0f10",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        padding: 96,
        fontFamily: inter,
      }}
    >
      {/* The upvote caret, the same shape the product card uses for its button. */}
      <Interactive.Div
        name="Caret"
        style={{
          width: 0,
          height: 0,
          borderLeft: "44px solid transparent",
          borderRight: "44px solid transparent",
          borderBottom: "56px solid #ff6b1a",
          opacity: interpolate(frame, [0, 0.5 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [0, 0.7 * fps], ["0px 40px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      />

      <Interactive.Div
        name="Upvote count"
        style={{
          marginTop: 40,
          fontFamily: jetBrainsMono,
          fontSize: 240,
          fontWeight: 700,
          lineHeight: 1,
          letterSpacing: -6,
          fontVariantNumeric: "tabular-nums",
          color: "#ffffff",
          opacity: interpolate(frame, [0.2 * fps, 0.7 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        {counted}
      </Interactive.Div>

      <Interactive.Div
        name="Count label"
        style={{
          marginTop: 24,
          fontSize: 52,
          fontWeight: 600,
          letterSpacing: 4,
          textTransform: "uppercase",
          color: "#ff6b1a",
          opacity: interpolate(frame, [1.4 * fps, 1.9 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        Upvotes on launch day
      </Interactive.Div>

      <Interactive.Div
        name="Maker credit"
        style={{
          marginTop: 64,
          fontSize: 50,
          fontWeight: 400,
          textAlign: "center",
          color: "#9ca3af",
          opacity: interpolate(frame, [1.8 * fps, 2.3 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        Built by {makerName}
      </Interactive.Div>
    </AbsoluteFill>
  );
};
