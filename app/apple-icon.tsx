import { ImageResponse } from "next/og";

// Apple touch icon (home-screen bookmark) — same brand mark, larger canvas.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
          fontSize: 120,
          fontWeight: 700,
          borderRadius: 40,
        }}
      >
        B
      </div>
    ),
    { ...size },
  );
}
