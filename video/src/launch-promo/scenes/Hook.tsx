import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import { inter } from "../fonts";

/**
 * Scene 1 — the two seconds that decide whether anyone watches the rest.
 *
 * One idea on screen: something launched today, here. The product itself is
 * deliberately held back for scene 2, because a name means nothing to a viewer
 * who does not yet know what they are looking at.
 *
 * The eyebrow rule, the uppercase orange label and the near-black ground are
 * lifted from the site's own section headers, so the video and the page a viewer
 * lands on read as one product.
 *
 * Every style is a plain inline object and every `interpolate()` sits directly
 * in the `style` prop. That is what lets the Studio recognise the keyframes and
 * offer them for editing -- pulling the values into constants or a `transform`
 * string greys them out.
 */
export const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill
      name="Hook"
      style={{
        backgroundColor: "#0f0f10",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "flex-start",
        padding: 96,
        fontFamily: inter,
      }}
    >
      {/* The eyebrow rule grows out of the left edge, so the eye starts there. */}
      <Interactive.Div
        name="Eyebrow rule"
        style={{
          height: 6,
          borderRadius: 3,
          backgroundColor: "#ff6b1a",
          width: interpolate(frame, [0, 0.7 * fps], [0, 120], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      />

      <Interactive.Div
        name="Eyebrow"
        style={{
          marginTop: 32,
          fontSize: 46,
          fontWeight: 700,
          letterSpacing: 8,
          textTransform: "uppercase",
          color: "#ff6b1a",
          opacity: interpolate(frame, [0.2 * fps, 0.9 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [0.2 * fps, 0.9 * fps], ["0px 24px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        Launching today
      </Interactive.Div>

      <Interactive.Div
        name="Wordmark"
        style={{
          marginTop: 24,
          fontSize: 148,
          fontWeight: 800,
          lineHeight: 1.02,
          letterSpacing: -4,
          color: "#ffffff",
          opacity: interpolate(frame, [0.45 * fps, 1.2 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [0.45 * fps, 1.2 * fps], ["0px 32px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        Bharat Hunt
      </Interactive.Div>

      <Interactive.Div
        name="Subline"
        style={{
          marginTop: 28,
          fontSize: 54,
          fontWeight: 400,
          lineHeight: 1.35,
          color: "#9ca3af",
          maxWidth: 820,
          opacity: interpolate(frame, [0.8 * fps, 1.5 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        The best of what India is building.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
