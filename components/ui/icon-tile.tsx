/* Design system: design.md (Bharat Hunt — orange) · icon containers.
 *
 * The one way a UI icon sits in a tinted square: orange stroke icon on a
 * primary/10 wash, 12px radius, a slightly deeper wash when its card (`group`)
 * is hovered. Sizes pair a container with an icon so the ratio never drifts:
 *
 *   sm  32 / 16  compact — chips, network nodes, list rows
 *   md  36 / 18  small cards
 *   lg  40 / 20  category tiles and cards
 *   xl  48 / 24  page heroes
 *
 * This is for UI icons only. Product and company logos go through
 * `ProductLogo` / `CompanyMark` and are never swapped for an icon.
 *
 * No hooks, so it renders in server and client trees alike.
 */

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { TOPIC_ICONS, type TopicKey } from "@/lib/constants";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: { tile: "size-8", icon: "size-4" },
  md: { tile: "size-9", icon: "size-4.5" },
  lg: { tile: "size-10", icon: "size-5" },
  xl: { tile: "size-12", icon: "size-6" },
} as const;

export type IconTileSize = keyof typeof SIZES;

type IconTileProps = {
  icon: LucideIcon;
  size?: IconTileSize;
  className?: string;
  /** Overlays pinned to the tile (a status dot, a badge). */
  children?: ReactNode;
};

export function IconTile({ icon: Icon, size = "md", className, children }: IconTileProps) {
  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors duration-200 group-hover:bg-primary/15",
        SIZES[size].tile,
        className,
      )}
    >
      <Icon className={SIZES[size].icon} aria-hidden="true" />
      {children}
    </span>
  );
}

/** A topic's canonical icon (see `TOPIC_ICONS`) in the standard tile. */
export function CategoryIcon({ topic, ...props }: { topic: TopicKey } & Omit<IconTileProps, "icon">) {
  return <IconTile icon={TOPIC_ICONS[topic]} {...props} />;
}
