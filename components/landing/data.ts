import {
  Rocket,
  Users,
  TrendingUp,
  Zap,
  LayoutGrid,
  CreditCard,
  FileText,
  Package,
  Type,
  Cloud,
  Sparkles,
  Code2,
  IndianRupee,
  Palette,
  type LucideIcon,
} from "lucide-react";

/**
 * Static demo content for the landing page — matches the reference mockup
 * exactly (ZenTask / Payflow / DocuGen / ShipFast / TypeFit, the community
 * stats, etc.). This is presentation data, not live product data.
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

export type DemoProduct = {
  rank: number;
  name: string;
  tagline: string;
  category: string;
  upvotes: number;
  icon: LucideIcon;
  tone: IconTone;
};

export const TOP_PRODUCTS: DemoProduct[] = [
  {
    rank: 1,
    name: "ZenTask",
    tagline: "Task management, reimagined for teams",
    category: "SaaS",
    upvotes: 523,
    icon: LayoutGrid,
    tone: "violet",
  },
  {
    rank: 2,
    name: "Payflow",
    tagline: "Payments infrastructure for modern India",
    category: "Fintech",
    upvotes: 421,
    icon: CreditCard,
    tone: "dark",
  },
  {
    rank: 3,
    name: "DocuGen",
    tagline: "Generate documents in seconds with AI",
    category: "AI",
    upvotes: 318,
    icon: FileText,
    tone: "orange",
  },
  {
    rank: 4,
    name: "ShipFast",
    tagline: "Shipping API for e-commerce made simple",
    category: "Developer Tools",
    upvotes: 289,
    icon: Package,
    tone: "amber",
  },
  {
    rank: 5,
    name: "TypeFit",
    tagline: "AI-powered typography for stunning designs",
    category: "Design Tools",
    upvotes: 254,
    icon: Type,
    tone: "dark",
  },
];

export type Feature = {
  title: string;
  description: string;
  icon: LucideIcon;
  tone: IconTone;
};

export const FEATURES: Feature[] = [
  {
    title: "Launch with reach",
    description:
      "Get discovered by thousands of product enthusiasts and early adopters.",
    icon: Rocket,
    tone: "orange",
  },
  {
    title: "Community support",
    description: "Upvotes, feedback and real conversations that help you build better.",
    icon: Users,
    tone: "rose",
  },
  {
    title: "Build your audience",
    description: "Turn your product launch into lasting followers and customers.",
    icon: TrendingUp,
    tone: "violet",
  },
  {
    title: "Fast & easy",
    description: "Launch your product in minutes, focus on building, not setup.",
    icon: Zap,
    tone: "amber",
  },
];

export type Collection = {
  name: string;
  count: string;
  icon: LucideIcon;
  tone: IconTone;
};

export const COLLECTIONS: Collection[] = [
  { name: "SaaS", count: "1.2K products", icon: Cloud, tone: "violet" },
  { name: "AI Tools", count: "842 products", icon: Sparkles, tone: "orange" },
  { name: "Developer Tools", count: "1.1K products", icon: Code2, tone: "dark" },
  { name: "Fintech", count: "623 products", icon: IndianRupee, tone: "amber" },
  { name: "Design Tools", count: "487 products", icon: Palette, tone: "rose" },
];

export type Stat = { value: string; label: string };

export const COMMUNITY_STATS: Stat[] = [
  { value: "15K+", label: "Makers" },
  { value: "50K+", label: "Products" },
  { value: "250K+", label: "Upvotes" },
  { value: "120+", label: "Countries" },
];

/** Avatar face URLs (pravatar) used in the rating row + community map. */
export const AVATARS = [12, 5, 33, 47, 9, 60].map(
  (n) => `https://i.pravatar.cc/80?img=${n}`,
);
