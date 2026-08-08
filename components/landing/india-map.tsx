import { cn } from "@/lib/utils";
import { INDIA_STATES } from "@/lib/india-states";

/**
 * India, as a dot matrix.
 *
 * The outline is derived from Natural Earth's 1:10m admin-0 boundaries, **India
 * point-of-view edition** (`ne_10m_admin_0_countries_ind`) — public domain. The
 * POV edition matters: Natural Earth's default India stops at 35.5°N, which
 * clips Jammu & Kashmir and Ladakh. Publishing a map that misrepresents India's
 * boundaries is an offence in India, so the claimed territory has to be there.
 * This outline reaches 37.05°N and includes the Andaman & Nicobar Islands.
 *
 * Web Mercator, then simplified with Ramer–Douglas–Peucker at a tolerance that
 * scales per ring, so the small islands survive instead of being flattened
 * away. Verified by point-in-polygon: Delhi, Mumbai, Chennai, Kolkata,
 * Bengaluru, Srinagar, Leh and Port Blair all fall inside; Colombo, Kathmandu,
 * Dhaka and Karachi all fall outside.
 *
 * Rendered as a clipped `<pattern>` rather than thousands of positioned dots —
 * one path plus one tiled circle, so the grid stays crisp at any size.
 */

const VIEW_BOX = "0 0 1000 1137";

const INDIA_PATH =
  "M369.1 153.9L387.6 159.5L383.4 169.9L393.2 180.8L387.1 188.7L382.9 186.3L370 196.3L362.9 184.8L350.9 188.2L353.4 201.1L363.2 211.8L363.2 238.2L369.2 239.7L376.4 233L385.7 249.6L401.1 252.3L413.9 261.1L412.3 268.1L440.6 281.9L418.8 299.9L407.4 336L446.3 354.6L450.6 363.7L469.8 374.4L475.6 372L488.5 381.2L498 380.5L500.5 388.2L518.6 394.5L522.2 389.2L538.2 394L537.5 390.6L547.2 387.5L564 395.3L565.2 406.2L587.3 417.4L598.4 413L605.9 423.9L621.5 422.2L636.2 429.7L647.4 423.4L649.6 430.1L656.3 432.4L675.8 427.8L680.5 431.4L686 417.1L679.2 403L683.7 371.4L700.6 364.5L709.5 374.1L705.7 386.8L710.8 395.1L705.3 401.5L717.8 414.1L742.4 418.9L760.7 411.3L773.3 416.2L797.4 412.2L813.1 414.8L819.8 411.6L816.9 402.6L820.3 396L816.4 389.1L803.7 386.8L802.4 374.4L815.6 379.3L825.5 373.9L837 374.6L842.5 369.2L840.5 363.5L858.7 355.4L862.4 345.2L883.3 342.1L897.7 328.7L895.6 323.9L906.4 317.2L932.6 328.2L945.6 316.3L959.2 315.2L966.9 319.6L960.3 325.4L961 332L966.9 328.2L974.6 339.1L964.7 352.3L991.3 354.1L999.7 360.2L1000 372.8L983.9 384.2L992.7 403.9L978.5 393.4L959.2 397.4L924.3 422.2L921.5 434.6L925.2 443.7L920.4 455.6L906.6 468.6L904.8 475.8L910.1 482.5L890.3 526.5L862.2 518.8L866.3 533.2L864.4 553.7L856.3 557.4L857.5 586L847.3 597.2L840.7 589.9L837 596.5L826.2 532.2L814.6 531.6L810.3 555.2L803.1 560.6L796.5 548.8L793.8 554.8L787.7 535.1L795.5 517.4L808.1 512.4L813.1 515.3L813.9 508.5L821 505.9L824.9 487.6L833.9 486.2L818.4 476.7L761.3 477.9L742.6 472.7L742.9 446.4L736.9 437.1L733.1 447.1L726 445.6L716 431L710.8 430.8L715.2 436.6L703 435.5L702.7 429.7L693 422.2L691 427.8L697.3 432.1L685.9 440.2L683.3 452L714 472.7L711.9 477.2L695.4 476.4L691.3 488.3L684.2 486.7L681 496.9L696.5 509.3L705.5 510.4L698.8 534.7L706.6 540.3L704.1 549.1L713.1 551L709 559.4L717.2 590.1L716.6 597.9L711.3 596.8L717.3 609.8L709.7 604.2L704.5 611.2L706.4 590.8L701.9 597.6L702.9 588.1L699.9 611.9L697.2 597.4L695.9 609.5L691.6 606L690.9 610L689.2 603.1L689 612.1L687 589.4L677.1 579.9L685.9 592.3L674.6 605.6L652.9 612.2L643.2 620.4L641.8 640.5L647.5 643.5L626.3 669.1L617 663.8L624.5 670.3L620.9 672.3L593.9 681.2L597 673.6L586.7 677.1L581.7 688L586 681.6L590.9 680.3L588.8 684.5L597.2 680.3L568.5 700L547.1 730.8L485.4 775.8L485.2 792.5L466.6 801.7L449.3 801.3L440.9 821.1L436.9 812.1L433.8 823.3L429.1 816.5L415.8 823.8L408 845.5L412.9 864.2L407.8 876.8L410.8 876L416.9 903.8L411 893.7L408 897.6L417.4 904.2L417.6 912.4L412.3 935.8L398.9 962.5L400 976.1L395.1 979.1L400.5 977.5L401.3 1014.1L381.7 1015.5L369 1042.6L387.5 1053.5L371.5 1049.4L351.8 1055.6L343.9 1063.3L339.6 1081.1L322.8 1090.8L314.2 1089.2L287.8 1062L292.1 1058.8L287.2 1060.9L281.6 1047.7L277.2 1025.9L281.4 1040.9L286.4 1040.4L275.4 1020.6L277.4 1016L260.1 976.5L246 958L248.4 955.3L241.5 953.7L229 925.5L232.9 923.6L228.6 924.2L225.8 896.3L217.6 883L215.3 867.3L203.9 856.1L208.7 853.1L204.5 854.2L197.7 845.9L193.2 834.3L199.5 835.5L191.6 828.4L195.1 825.2L191 826.5L181.7 810.7L173.3 756.4L163.9 733.4L168.8 731.7L163.4 728.5L163.2 722.6L166.9 724.6L161.4 716.9L163.9 711.7L166.2 715.1L162.8 709.2L168.3 704.8L165.3 699.5L158.5 707.3L159 694L168.1 697.5L158.3 691.6L162.2 686.1L156.9 685.9L154.4 674.4L164.6 641.3L159.9 627.7L153.2 628.6L157.3 625.2L151.5 618.3L170.9 604.6L151 607.9L157.3 595.9L149.3 596.5L151.8 588.4L163.6 585.6L148.1 587L145.7 582.1L137.2 585.4L142.6 587.1L142.7 592.7L132 603L142.4 609.4L135.7 624.9L102.7 641.1L89 642.8L65.5 626.8L27.4 584.7L31.9 577.8L36.6 585.5L69.7 574.8L80.8 554.7L77 560.7L68.1 558.8L49.4 567.4L24.8 557.8L9.6 541.9L9.1 535.4L23.2 525.7L6.3 536.7L0 535.7L4.5 533.7L0.7 530.3L4.1 523.6L19.9 522.5L20.7 508.7L62.6 515L77.9 506.1L82.9 505.3L83.1 510.9L89.5 512.5L100.7 505.7L86 458L72.7 457.1L67.5 450.1L69 425.3L46.6 417.5L47.7 402.4L75.3 368.2L81.9 368L92.1 380.2L127.8 370.2L144.3 338.8L164 327.8L179.1 293.2L198.7 282.8L195.6 275.5L223.2 247.2L218 243.5L219.5 217.3L247.2 199.8L235.7 191.5L224.3 191.2L223.6 176.2L212.5 179.2L187.7 164.6L181.3 107L201.2 92L204.9 82.7L191.1 78L192.8 65.1L176.9 61.8L169.4 50.2L149.8 49L151.7 34.7L165.9 24.9L168.9 15.2L196.5 14.7L190.8 6.9L201.8 10.2L223.3 0L230.5 6.3L239 2.7L247.8 6.9L249.7 14.2L259.9 14.2L268.5 26L292.1 36.9L297.9 50.9L315.4 56.8L326 67.8L341.2 64.5L360.4 51.2L376.5 51.9L381.9 45.9L397.2 53.3L406.3 51.8L417.4 67L407.9 100.7L401.6 101.3L396.3 111.4L389.8 111L385.8 127.7L368.6 129.3L372.4 143.7L368.4 144.3L368.9 153.2ZM883.1 1127.4L883.4 1127.8L883.4 1129.6L882.2 1132.5L882 1133.7L882.5 1134.8L882 1135.1L881 1135L880.1 1137L879.4 1136.7L879.4 1134.8L878.4 1133.9L878.7 1133.4L878.1 1132.8L878.2 1132L877.8 1131.6L877.8 1130.8L877.2 1130.9L876.1 1128.5L875.6 1128L874.3 1127.3L873.8 1127.8L873.9 1123.7L874.7 1121.9L876.1 1121.7L876.7 1121.1L877.8 1120.7L878 1120.9L879.4 1119.9L880 1120.1L881.2 1121.3L881.9 1125.1L882.8 1127ZM837.3 997.4L837.4 998.6L837.8 999.6L837.7 1000.6L835.8 1002.7L835.8 1003.7L837 1004.1L835.6 1006L834.9 1006.6L833.7 1006.3L832.5 1005.3L831.7 1005.3L831.2 1005.8L830.4 1005.8L830.2 1005.4L831.1 1004.2L831.6 1002.4L831.3 1001.7L830.3 1000.9L830.2 997L831.2 996.8L831.5 996.4L832 994.6L833.8 993.4L835.4 993.1L836.6 994.7L836.7 995.9L837.2 996.7ZM853.3 909.4L854.3 910.2L852.8 917.2L850.8 918.3L850.3 916.4L849.4 917L849.9 920.4L848.3 920L847.3 922.3L849 922.4L850.3 924.1L851.2 936.3L849.4 939.7L847.9 938.5L848.2 939.3L846.3 939.3L848.6 942.6L847.4 943.5L847.9 947.3L845.8 950.3L843.2 951.7L844.4 953.2L842.7 955L842.5 958.7L843.9 956.6L844.6 959.2L843.3 964.7L840.9 966.4L840.7 967.9L842.8 965.5L843.5 967.8L841.8 972.2L839.9 970.3L838.6 968.1L839.5 967.1L838 964.3L836.6 964.1L836.7 960.5L835.3 959.5L836.8 956.8L838.4 959.1L839.2 949.7L840.6 946.8L842 946.5L842.2 948.4L844.4 947.2L843.3 945.1L844.4 944.1L842.4 943.3L841.9 941.8L842 933.4L844.1 931.1L842.9 930.2L842.5 926.1L844.7 924.4L845.9 919.3L845 918.7L846.5 914.2L846.3 907.2L849.8 900.2L851.9 900L851.9 899L853.8 900.5L854.2 905.4L851.7 907.7L850.8 907.2L852.8 908.6Z";

export type IndiaMapProps = {
  /** Unique per instance — SVG ids are document-global. */
  id?: string;
  className?: string;
  /** Distance between dot centres, in viewBox units. */
  spacing?: number;
  dotRadius?: number;
  /**
   * Published products per state, keyed by ISO 3166-2:IN code. States absent
   * from the map get no marker — the map only ever shows locations makers
   * actually gave us.
   */
  launchCounts?: Record<string, number>;
  /**
   * The broadcast loop (beacon, ripples, travelling signals). On by default;
   * pass false for a still map. Honours prefers-reduced-motion regardless —
   * see the .bh-map-* rules in app/globals.css.
   */
  animated?: boolean;
};

/**
 * Which marker the broadcast originates from.
 *
 * The busiest launch state, so the beacon follows the data rather than being
 * pinned to a hard-coded city. Ties break towards Delhi, which is where the
 * design anchors it and which currently has a real launch — but if Delhi ever
 * has none it simply isn't a candidate, and the beacon moves to a state that
 * does. Nothing here invents a location.
 */
function pickOrigin<T extends { code: string; count: number }>(markers: T[]): T | null {
  if (markers.length === 0) return null;
  const best = markers[0].count;
  const tied = markers.filter((marker) => marker.count === best);
  return tied.find((marker) => marker.code === "IN-DL") ?? tied[0];
}

/** A gentle arc between two points, bowed perpendicular to the line. */
function arcPath(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  // Offset the control point at right angles, scaled to the span, so short
  // hops stay nearly straight and long ones curve like a flight path.
  const bow = 0.16;
  return `M${from.x} ${from.y} Q${midX - dy * bow} ${midY + dx * bow} ${to.x} ${to.y}`;
}

/**
 * Marker radius for a state's launch count.
 *
 * Square-root scaling, because a marker is read by its *area*: sizing the
 * radius linearly would make a 9-launch state look nine times the weight of a
 * 1-launch one. Clamped so a single launch is still visible and a runaway hub
 * (Bengaluru, realistically) can't swallow its neighbours.
 */
function markerRadius(count: number): number {
  return Math.min(34, 11 + Math.sqrt(count) * 7);
}

export function IndiaMap({
  id = "india-map",
  className,
  spacing = 22,
  dotRadius = 4.2,
  launchCounts,
  animated = true,
}: IndiaMapProps) {
  const clipId = `${id}-clip`;
  const dotsId = `${id}-dots`;
  const glowId = `${id}-glow`;
  const waveMaskId = `${id}-wave-mask`;
  const waveBandId = `${id}-wave-band`;
  const haloId = `${id}-halo`;
  const beamId = `${id}-beam`;

  // Biggest first, so a state with one launch is never hidden under a hub.
  const markers = INDIA_STATES.flatMap((state) => {
    const count = launchCounts?.[state.code] ?? 0;
    return count > 0 ? [{ ...state, count }] : [];
  }).sort((a, b) => b.count - a.count);

  // The beacon fires from the busiest launch state; the signals travel to the
  // other states that genuinely have launches. No line ever points at a city
  // we can't account for, and with a single marker there are simply no lines.
  const origin = animated ? pickOrigin(markers) : null;
  const signals = origin ? markers.filter((marker) => marker.code !== origin.code).slice(0, 3) : [];

  // The markers are the content here, so they have to exist for a screen
  // reader too — the SVG is otherwise an unlabelled decorative shape.
  const label = markers.length
    ? `Map of India showing where products were launched from. ${markers
        .map((m) => `${m.name}: ${m.count}`)
        .join(". ")}.`
    : "Map of India";

  return (
    <svg
      viewBox={VIEW_BOX}
      className={cn("h-full w-full", className)}
      role="img"
      aria-label={label}
    >
      <defs>
        <clipPath id={clipId}>
          <path d={INDIA_PATH} />
        </clipPath>
        <pattern id={dotsId} width={spacing} height={spacing} patternUnits="userSpaceOnUse">
          <circle cx={spacing / 2} cy={spacing / 2} r={dotRadius} fill="currentColor" />
        </pattern>
        <radialGradient id={glowId} cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.55" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.16" />
        </radialGradient>

        {origin && (
          <>
            {/* Soft-edged annulus. Scaling it sweeps a bright band outward,
                which is what lights the dots up in sequence. */}
            <radialGradient id={waveBandId}>
              <stop offset="52%" stopColor="#000" />
              <stop offset="76%" stopColor="#fff" />
              <stop offset="100%" stopColor="#000" />
            </radialGradient>

            {/* Masking one extra dot layer is what makes the dot field react
                without animating a single dot: the dots are a <pattern>, so
                the whole field costs one rect no matter how many are drawn. */}
            <mask id={waveMaskId}>
              <rect width="100%" height="100%" fill="#000" />
              <g transform={`translate(${origin.x} ${origin.y})`}>
                <circle
                  className="bh-map-wave"
                  cx="0"
                  cy="0"
                  r="460"
                  fill={`url(#${waveBandId})`}
                />
              </g>
            </mask>

            {/* Layered glow: tight bright centre, wide faint falloff. Cheaper
                and softer than stacking blurs. */}
            <radialGradient id={haloId}>
              <stop offset="0%" stopColor="#ff8a3d" stopOpacity="0.85" />
              <stop offset="35%" stopColor="currentColor" stopOpacity="0.35" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </radialGradient>

            <linearGradient id={beamId} x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.5" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </>
        )}
      </defs>

      {/* The dot grid, clipped to the country. */}
      <g clipPath={`url(#${clipId})`}>
        <rect width="100%" height="100%" fill={`url(#${dotsId})`} />
        {/* Centre-weighted wash so the middle reads denser than the edges. */}
        <rect width="100%" height="100%" fill={`url(#${glowId})`} style={{ mixBlendMode: "overlay" }} />

        {/* A second pass of the *same* dot pattern, revealed only inside the
            travelling band. Where it shows, those dots read brighter; the gaps
            between them stay dark, so the field never washes out. */}
        {origin && (
          <rect
            width="100%"
            height="100%"
            fill={`url(#${dotsId})`}
            mask={`url(#${waveMaskId})`}
            opacity="0.85"
          />
        )}
      </g>

      {/* Hairline border, so the silhouette still reads where dots thin out. */}
      <path
        d={INDIA_PATH}
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.28"
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {/* One marker per state a maker actually named. Drawn outside the clip so
          coastal states aren't sliced in half by the country outline. */}
      {markers.map((marker) => {
        const r = markerRadius(marker.count);
        return (
          <g key={marker.code}>
            <title>
              {marker.name}: {marker.count} {marker.count === 1 ? "product" : "products"}
            </title>
            <circle cx={marker.x} cy={marker.y} r={r} fill="currentColor" fillOpacity="0.22" />
            <circle
              cx={marker.x}
              cy={marker.y}
              r={r * 0.45}
              fill="currentColor"
              stroke="currentColor"
              strokeOpacity="0.55"
              strokeWidth="2"
            />
          </g>
        );
      })}

      {/* ── Broadcast loop ──────────────────────────────────────────────
          Decorative: the markers above already carry the meaning, and the
          <title>s above already carry it for screen readers. Everything from
          here down is aria-hidden so none of it is announced twice. */}
      {origin && (
        <g aria-hidden="true" style={{ pointerEvents: "none" }}>
          {/* Signals to the other launch states. Deliberately staggered rather
              than randomised: a random pick would differ between server and
              client and break hydration. Long, offset cycles mean one or two
              are in flight at a time, never all three. */}
          {signals.map((target, index) => (
            <path
              key={`signal-${target.code}`}
              className="bh-map-comet"
              d={arcPath(origin, target)}
              // Normalised length, so one dash reads the same on every hop.
              pathLength={100}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              style={{ animationDelay: `${index * 2}s` }}
            />
          ))}

          <g transform={`translate(${origin.x} ${origin.y})`}>
            {/* Faint upward signal. Sits under the beacon so the core stays
                the brightest thing on the map. */}
            <rect
              className="bh-map-beam"
              x={-7}
              y={-150}
              width={14}
              height={150}
              rx={7}
              fill={`url(#${beamId})`}
            />

            {/* Three ripples, ~650ms apart, so the pulse never restarts from
                nothing — one is always mid-flight. */}
            {[0, 0.65, 1.3].map((delay, index) => (
              <circle
                key={`ring-${index}`}
                className="bh-map-ring"
                cx="0"
                cy="0"
                r={62}
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                style={{ animationDelay: `${delay}s` }}
              />
            ))}

            {/* Layered glow, widest first. */}
            <circle className="bh-map-halo" cx="0" cy="0" r={54} fill={`url(#${haloId})`} />
            <circle className="bh-map-core" cx="0" cy="0" r={11} fill="currentColor" fillOpacity="0.9" />
            <circle className="bh-map-core" cx="0" cy="0" r={5} fill="#ff8a3d" />
          </g>

          {/* Depth. Three, slow, low-contrast — not a starfield. */}
          {[
            { x: 250, y: 420, delay: 0 },
            { x: 700, y: 620, delay: 7 },
            { x: 430, y: 880, delay: 14 },
          ].map((mote, index) => (
            <circle
              key={`mote-${index}`}
              className="bh-map-mote"
              cx={mote.x}
              cy={mote.y}
              r={3}
              fill="currentColor"
              style={{ animationDelay: `${mote.delay}s` }}
            />
          ))}
        </g>
      )}
    </svg>
  );
}
