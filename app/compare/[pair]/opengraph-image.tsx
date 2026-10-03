import { ImageResponse } from "next/og";

import { SITE_NAME } from "@/lib/constants";
import { getComparePairs } from "@/services/compare-pairs";

// Share card for a curated "A vs B" page. Same brand system and the same cost
// rule as the product card (app/products/[slug]/opengraph-image.tsx): drawn
// from text only — no remote image fetch that could fail — and rendered once
// per pair per day, never per unfurl.
export const alt = "Product comparison on Bharat Hunt";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export const dynamic = "force-static";
export const revalidate = 86400;

export function generateStaticParams() {
  return [];
}

const GRADIENT = "linear-gradient(135deg,#ff6b1a,#ff8a3d)";

function Tile({ name }: { name: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "24px", width: "440px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "150px",
          height: "150px",
          borderRadius: "32px",
          background: GRADIENT,
          color: "#ffffff",
          fontSize: "84px",
          fontWeight: 800,
        }}
      >
        {name.slice(0, 1).toUpperCase()}
      </div>
      <div style={{ display: "flex", fontSize: "48px", fontWeight: 800, color: "#17140f", textAlign: "center", lineHeight: 1.1 }}>
        {name.slice(0, 28)}
      </div>
    </div>
  );
}

export default async function OpengraphImage({ params }: { params: Promise<{ pair: string }> }) {
  const { pair: slug } = await params;
  const pair = (await getComparePairs()).find((candidate) => candidate.slug === slug);
  const a = pair?.a.name ?? "Product";
  const b = pair?.b.name ?? "Product";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "64px 72px",
          background: "linear-gradient(135deg,#fff8f2 0%,#ffffff 55%,#fff3e9 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "48px",
              height: "48px",
              borderRadius: "12px",
              background: GRADIENT,
              color: "#ffffff",
              fontSize: "30px",
              fontWeight: 700,
            }}
          >
            B
          </div>
          <div style={{ fontSize: "30px", fontWeight: 700, color: "#17140f" }}>{SITE_NAME}</div>
          <div style={{ display: "flex", marginLeft: "auto", fontSize: "26px", color: "#6b6155" }}>Compare side by side</div>
        </div>
        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "space-between" }}>
          <Tile name={a} />
          <div style={{ display: "flex", fontSize: "44px", fontWeight: 800, color: "#ff6b1a" }}>vs</div>
          <Tile name={b} />
        </div>
        <div style={{ display: "flex", justifyContent: "center", fontSize: "26px", color: "#6b6155" }}>
          Pricing, free plans, what each one does — from the listings themselves
        </div>
      </div>
    ),
    { ...size },
  );
}
