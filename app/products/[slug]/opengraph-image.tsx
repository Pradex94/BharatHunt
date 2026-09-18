import { ImageResponse } from "next/og";

import { getProductShareCard } from "@/services/products";
import { SITE_NAME } from "@/lib/constants";

// Per-product social-share card (Twitter/LinkedIn/WhatsApp/Facebook unfurls).
// Rendered from a branded initial tile + live data — no remote image fetch, so
// it can never fail to render because a maker's logo URL is down.
export const alt = "Product on Bharat Hunt";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/*
 * Rendered once per product per day, not once per unfurl. Drawing a PNG is the
 * most CPU-expensive thing this app does (593-950 ms measured on Workers), and
 * the only live number on the card is the upvote count, which a share preview
 * can carry a day late. `force-static` is what makes that hold: without it the
 * route stays dynamic whatever the data layer does (see app/page.tsx for the
 * two ways that has gone wrong before). Unknown slugs are generated on demand.
 */
export const dynamic = "force-static";
export const revalidate = 86400;

export function generateStaticParams() {
  return [];
}

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getProductShareCard(slug);

  const name = product?.name ?? SITE_NAME;
  const tagline = product?.tagline ?? "Discover premium software before everyone else.";
  const category = product?.category ?? "Product";
  const upvotes = product?.upvote_count ?? 0;
  const initial = name.slice(0, 1).toUpperCase();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "72px",
          background: "linear-gradient(135deg,#fff8f2 0%,#ffffff 55%,#fff3e9 100%)",
          fontFamily: "sans-serif",
        }}
      >
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "48px",
              height: "48px",
              borderRadius: "12px",
              background: "linear-gradient(135deg,#ff6b1a,#ff8a3d)",
              color: "#ffffff",
              fontSize: "30px",
              fontWeight: 700,
            }}
          >
            B
          </div>
          <div style={{ fontSize: "30px", fontWeight: 700, color: "#17140f" }}>{SITE_NAME}</div>
        </div>

        {/* Main */}
        <div
          style={{
            display: "flex",
            flex: 1,
            alignItems: "center",
            gap: "44px",
            marginTop: "40px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "180px",
              height: "180px",
              flexShrink: 0,
              borderRadius: "36px",
              background: "linear-gradient(135deg,#ff6b1a,#ff8a3d)",
              color: "#ffffff",
              fontSize: "104px",
              fontWeight: 800,
            }}
          >
            {initial}
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: "800px",
              maxHeight: "360px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                fontSize: "56px",
                fontWeight: 800,
                color: "#17140f",
                lineHeight: 1.08,
              }}
            >
              {name.slice(0, 64)}
            </div>
            <div
              style={{
                fontSize: "30px",
                color: "#3d372e",
                marginTop: "20px",
                lineHeight: 1.3,
              }}
            >
              {tagline.slice(0, 120)}
            </div>
          </div>
        </div>

        {/* Footer: category + upvotes */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "10px 22px",
              borderRadius: "999px",
              border: "1px solid #efe6dd",
              background: "#ffffff",
              fontSize: "26px",
              color: "#6b6155",
            }}
          >
            {category}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "10px 22px",
              borderRadius: "999px",
              background: "linear-gradient(135deg,#ff6b1a,#ff8a3d)",
              color: "#ffffff",
              fontSize: "26px",
              fontWeight: 700,
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M12 4l8 14H4z" fill="#ffffff" />
            </svg>
            {upvotes} upvotes
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
