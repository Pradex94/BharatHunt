import { ImageResponse } from "next/og";

// Default social-share card, used when a page doesn't declare its own.
export const alt = "Bharat Hunt — Discover premium software before everyone else";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "linear-gradient(135deg,#fff8f2 0%,#ffffff 55%,#fff3e9 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "28px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "104px",
              height: "104px",
              borderRadius: "26px",
              background: "linear-gradient(135deg,#ff6b1a,#ff8a3d)",
              color: "#ffffff",
              fontSize: "64px",
              fontWeight: 700,
            }}
          >
            B
          </div>
          <div style={{ fontSize: "68px", fontWeight: 800, color: "#17140f" }}>Bharat Hunt</div>
        </div>

        <div
          style={{
            marginTop: "44px",
            fontSize: "40px",
            fontWeight: 600,
            color: "#3d372e",
            maxWidth: "900px",
            lineHeight: 1.25,
          }}
        >
          Discover premium software before everyone else.
        </div>

        <div style={{ marginTop: "24px", fontSize: "28px", color: "#8a7f70" }}>
          Launch your product · Get a dofollow backlink · Reach the community
        </div>
      </div>
    ),
    { ...size },
  );
}
