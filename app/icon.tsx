import { ImageResponse } from "next/og";

// Generated favicon — a rounded orange "B" tile matching the brand mark.
// Replaces the old /brand-icon.png reference (that asset isn't in the repo).
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg,#ff6b1a,#ff8a3d)",
          color: "#ffffff",
          fontSize: 22,
          fontWeight: 700,
          borderRadius: 7,
        }}
      >
        B
      </div>
    ),
    { ...size },
  );
}
