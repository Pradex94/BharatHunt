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
 * Scene 2 — the product itself, as the card people already recognise.
 *
 * A white 48px-radius card on the dark ground, which is the marketplace's own
 * `ProductCard` scaled for video: same orange category chip, same ink headline
 * over grey body copy. Someone who taps through from this video lands on a page
 * that looks like the thing they just watched.
 *
 * The one piece of logic in the file is the headline size. Product names on
 * Bharat Hunt run from "Zo" to "Hyperlocal Delivery Manager", and a fixed
 * `fontSize` either wraps the long ones into three lines or leaves the short
 * ones looking timid. Three buckets by character count is cruder than measuring
 * the text, and it is also predictable, inspectable, and cannot disagree with
 * what the renderer does on a frame the Studio never showed.
 */
export const ProductReveal: React.FC<LaunchPromoProps> = ({
  productName,
  tagline,
  category,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Chosen against the 1080px-wide safe area (96px padding, 64px card padding),
  // so the longest name at each size still fits two lines without clipping.
  const nameSize = productName.length > 24 ? 84 : productName.length > 14 ? 104 : 128;

  return (
    <AbsoluteFill
      name="Product reveal"
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
      <Interactive.Div
        name="Card"
        style={{
          width: "100%",
          backgroundColor: "#ffffff",
          borderRadius: 48,
          padding: 64,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          boxShadow: "0 40px 120px -24px rgba(0, 0, 0, 0.65)",
          opacity: interpolate(frame, [0, 0.6 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          // `output: 'perceptual-scale'` makes the growth read as linear to the
          // eye rather than easing off early, which a raw scale ramp does.
          scale: interpolate(frame, [0, 0.9 * fps], [0.88, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            output: "perceptual-scale",
          }),
        }}
      >
        <Interactive.Div
          name="Category chip"
          style={{
            fontSize: 40,
            fontWeight: 600,
            letterSpacing: 2,
            textTransform: "uppercase",
            color: "#ff6b1a",
            backgroundColor: "#fdf2ea",
            borderRadius: 999,
            padding: "16px 32px",
            opacity: interpolate(frame, [0.4 * fps, 1 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          {category}
        </Interactive.Div>

        <Interactive.Div
          name="Product name"
          style={{
            marginTop: 40,
            fontSize: nameSize,
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: -3,
            color: "#17140f",
            opacity: interpolate(frame, [0.6 * fps, 1.2 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            translate: interpolate(frame, [0.6 * fps, 1.2 * fps], ["0px 28px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          {productName}
        </Interactive.Div>

        <Interactive.Div
          name="Tagline"
          style={{
            marginTop: 28,
            fontSize: 52,
            fontWeight: 400,
            lineHeight: 1.35,
            color: "#4b5563",
            opacity: interpolate(frame, [0.9 * fps, 1.5 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            translate: interpolate(frame, [0.9 * fps, 1.5 * fps], ["0px 24px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          {tagline}
        </Interactive.Div>

        {/* The brand gradient, used as a rule rather than a button: this card is
            not tappable, and drawing a CTA that does nothing trains people to
            ignore the real one in scene 4. */}
        <Interactive.Div
          name="Accent rule"
          style={{
            marginTop: 56,
            height: 10,
            borderRadius: 5,
            backgroundImage: "linear-gradient(135deg, #ff6b1a 0%, #ff8a3d 100%)",
            width: interpolate(frame, [1.2 * fps, 2.2 * fps], [0, 320], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        />
      </Interactive.Div>
    </AbsoluteFill>
  );
};
