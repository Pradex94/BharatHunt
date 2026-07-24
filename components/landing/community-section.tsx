import { cn } from "@/lib/utils";
import { Numeric } from "@/components/ui/typography";
import { FadeIn } from "@/components/ui/motion";
import { COMMUNITY_STATS, AVATARS } from "@/components/landing/data";

// Rough India silhouette (wide north, tapering to a point in the south).
const INDIA_CLIP =
  "polygon(26% 6%, 48% 2%, 60% 8%, 74% 10%, 88% 22%, 78% 34%, 70% 44%, 62% 62%, 54% 78%, 48% 96%, 40% 74%, 32% 60%, 22% 44%, 14% 28%, 18% 16%)";

// Floating avatar positions over the map (top/left %).
const AVATAR_SPOTS = [
  { top: "18%", left: "40%" },
  { top: "34%", left: "64%" },
  { top: "44%", left: "30%" },
  { top: "60%", left: "52%" },
  { top: "72%", left: "40%" },
];

export function CommunitySection() {
  return (
    <section className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="relative overflow-hidden rounded-[32px] bg-surface-dark text-on-dark">
        {/* Orange gradient wash + glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_120%_at_100%_0%,rgba(255,107,26,0.35),transparent_55%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-[18%] size-72 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,138,61,0.4),transparent_65%)] blur-2xl"
        />

        <div className="relative grid items-center gap-10 p-8 sm:p-12 lg:grid-cols-2 lg:p-16">
          {/* LEFT — copy + stats */}
          <FadeIn className="flex flex-col gap-6">
            <span className="w-fit rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              Built by India. Backed by the world.
            </span>
            <h2 className="max-w-[18ch] text-3xl font-bold tracking-tight sm:text-4xl">
              A community of builders, backing each other&rsquo;s dreams.
            </h2>
            <p className="max-w-md text-on-dark-soft">
              From first-time makers to serial entrepreneurs, Bharat Hunt is where
              ideas get the wings they deserve.
            </p>
            <dl className="mt-2 grid grid-cols-2 gap-6 sm:grid-cols-4">
              {COMMUNITY_STATS.map((stat) => (
                <div key={stat.label} className="flex flex-col gap-1">
                  <dt className="sr-only">{stat.label}</dt>
                  <dd className="text-3xl font-bold text-primary">
                    <Numeric>{stat.value}</Numeric>
                  </dd>
                  <span className="text-sm text-on-dark-soft">{stat.label}</span>
                </div>
              ))}
            </dl>
          </FadeIn>

          {/* RIGHT — dotted India map with floating avatars */}
          <FadeIn delay={0.1} className="relative mx-auto aspect-square w-full max-w-md">
            {/* Orbit rings */}
            <div
              aria-hidden
              className="absolute inset-[8%] rounded-full border border-primary/15"
            />
            <div
              aria-hidden
              className="absolute inset-[22%] rounded-full border border-primary/10"
            />
            {/* Dotted map */}
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                clipPath: INDIA_CLIP,
                backgroundImage:
                  "radial-gradient(rgba(255,138,61,0.9) 1.4px, transparent 1.6px)",
                backgroundSize: "13px 13px",
                filter: "drop-shadow(0 0 24px rgba(255,107,26,0.35))",
              }}
            />
            {/* Floating avatars */}
            {AVATAR_SPOTS.map((spot, i) => (
              <span
                key={i}
                className="absolute"
                style={{ top: spot.top, left: spot.left }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={AVATARS[i]}
                  alt=""
                  className={cn(
                    "size-10 rounded-full border-2 border-primary object-cover shadow-[0_0_20px_rgba(255,107,26,0.5)]",
                  )}
                />
              </span>
            ))}
          </FadeIn>
        </div>
      </div>
    </section>
  );
}
