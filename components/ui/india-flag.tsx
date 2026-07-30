/**
 * Small Indian tricolour (saffron / white / green) with a simplified 12-spoke
 * Ashoka Chakra. A national flag is an intentional exception to the orange-only
 * palette — it's a patriotic mark, not a brand accent. Scales cleanly to the
 * ~14px size used beside the "Made in India" tag.
 */
export function IndiaFlag({ className }: { className?: string }) {
  const spokes = Array.from({ length: 12 }).map((_, i) => {
    const angle = (i * Math.PI) / 6;
    return (
      <line
        key={i}
        x1={12}
        y1={8}
        x2={12 + Math.cos(angle) * 2.3}
        y2={8 + Math.sin(angle) * 2.3}
        stroke="#000080"
        strokeWidth={0.3}
      />
    );
  });

  return (
    <svg
      viewBox="0 0 24 16"
      className={className}
      role="img"
      aria-label="Indian flag"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <clipPath id="india-flag-rounded">
          <rect x="0" y="0" width="24" height="16" rx="2.5" />
        </clipPath>
      </defs>
      <g clipPath="url(#india-flag-rounded)">
        <rect x="0" y="0" width="24" height="5.333" fill="#FF9933" />
        <rect x="0" y="5.333" width="24" height="5.334" fill="#FFFFFF" />
        <rect x="0" y="10.667" width="24" height="5.333" fill="#138808" />
        <circle cx="12" cy="8" r="2.3" fill="none" stroke="#000080" strokeWidth="0.5" />
        {spokes}
        <circle cx="12" cy="8" r="0.5" fill="#000080" />
      </g>
      <rect
        x="0.4"
        y="0.4"
        width="23.2"
        height="15.2"
        rx="2.3"
        fill="none"
        stroke="rgba(0,0,0,0.08)"
        strokeWidth="0.8"
      />
    </svg>
  );
}
