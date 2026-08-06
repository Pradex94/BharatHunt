import { LayoutDashboard, Link2, MessageSquare, Users, type LucideIcon } from "lucide-react";

/**
 * Presentation constants for the landing page.
 *
 * Everything a visitor can read as a *claim* — products, upvote counts, maker
 * and community numbers — is queried live in `app/page.tsx`. Only styling
 * tokens and our own feature copy live here.
 */

export type IconTone = "orange" | "violet" | "rose" | "amber" | "dark";

/** Gradient tile classes per tone (white glyph on top). No blue, no green. */
export const ICON_TONE: Record<IconTone, string> = {
  orange: "bg-gradient-to-br from-[#ff6b1a] to-[#ff8a3d]",
  violet: "bg-gradient-to-br from-[#8b5cf6] to-[#a78bfa]",
  rose: "bg-gradient-to-br from-[#f43f5e] to-[#fb7185]",
  amber: "bg-gradient-to-br from-[#f59e0b] to-[#ff8a3d]",
  dark: "bg-gradient-to-br from-[#2b2620] to-[#4b4238]",
};

export type Feature = {
  title: string;
  description: string;
  icon: LucideIcon;
  tone: IconTone;
};

/**
 * Each of these describes something the product actually does — the import
 * flow, the comment thread, the maker dashboard. Vague benefit copy ("build
 * your audience", "fast & easy") tells a maker nothing they can check.
 */
export const FEATURES: Feature[] = [
  {
    title: "Launch from a link",
    description:
      "Paste your URL and we pull in your logo, description and screenshots. Change anything you like before it goes live.",
    icon: Link2,
    tone: "orange",
  },
  {
    title: "Feedback you can use",
    description:
      "Comments and questions from people who opened your product — not a vanity counter.",
    icon: MessageSquare,
    tone: "rose",
  },
  {
    title: "Made for Indian makers",
    description:
      "Categories that match what India actually ships, and a community that already has the context.",
    icon: Users,
    tone: "violet",
  },
  {
    title: "Yours to edit, always",
    description:
      "Track views and upvotes from your dashboard, and update your launch whenever the product moves on.",
    icon: LayoutDashboard,
    tone: "amber",
  },
];
