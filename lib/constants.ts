import {
  Code2,
  Zap,
  Wallet,
  UtensilsCrossed,
  Palette,
  Megaphone,
  HeartPulse,
  GraduationCap,
  Users,
  Shapes,
  type LucideIcon,
} from "lucide-react";

export type NavLink = {
  label: string;
  href: string;
};

export const NAV_LINKS: NavLink[] = [
  { label: "Home", href: "/" },
  { label: "Products", href: "/marketplace" },
  { label: "Launches", href: "/marketplace?sort=newest" },
  { label: "People", href: "/categories" },
  { label: "Resources", href: "/blog" },
  { label: "Advertise", href: "/advertise" },
];

/**
 * The real taxonomy products are submitted under (see product-form.tsx's
 * category select). This is the only list that matches actual `category`
 * values stored on product rows — use it anywhere a filter/query needs to
 * match real data.
 */
export const PRODUCT_CATEGORIES = [
  "Developer Tools",
  "Productivity",
  "Finance",
  "Food & Drink",
  "Design Tools",
  "Marketing",
  "Health & Fitness",
  "Education",
  "Social",
  "Other",
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const PRODUCT_SORTS = ["trending", "newest", "price-low", "price-high", "top-rated"] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

export const PRODUCT_PRICING_TYPES = ["free", "freemium", "paid"] as const;
export type ProductPricingType = (typeof PRODUCT_PRICING_TYPES)[number];

export const PRICING_TYPE_LABELS: Record<ProductPricingType, string> = {
  free: "Free",
  freemium: "Freemium",
  paid: "Paid",
};

export type Category = {
  /** The exact `category` value stored on product rows (from PRODUCT_CATEGORIES). */
  name: ProductCategory;
  /** URL-safe slug used for /categories/[slug]. */
  slug: string;
  icon: LucideIcon;
  /** One-line editorial blurb shown on the categories index + detail hero. */
  blurb: string;
};

/**
 * The real category taxonomy. Every entry's `name` is an actual value products
 * are stored under (see PRODUCT_CATEGORIES), so a category page can filter live
 * data. `slugFor`/`categoryFromSlug` map between the two.
 */
export const CATEGORIES: Category[] = [
  {
    name: "Developer Tools",
    slug: "developer-tools",
    icon: Code2,
    blurb: "APIs, CLIs, and infrastructure that make shipping software faster.",
  },
  {
    name: "Productivity",
    slug: "productivity",
    icon: Zap,
    blurb: "Focus, planning, and automation tools that give you hours back.",
  },
  {
    name: "Finance",
    slug: "finance",
    icon: Wallet,
    blurb: "Invoicing, accounting, and money tools built for small teams.",
  },
  {
    name: "Food & Drink",
    slug: "food-and-drink",
    icon: UtensilsCrossed,
    blurb: "Ordering, discovery, and kitchen tools for food-first businesses.",
  },
  {
    name: "Design Tools",
    slug: "design-tools",
    icon: Palette,
    blurb: "Icon makers, editors, and design systems for people who ship interfaces.",
  },
  {
    name: "Marketing",
    slug: "marketing",
    icon: Megaphone,
    blurb: "Email, SEO, and growth tools tuned for reaching real audiences.",
  },
  {
    name: "Health & Fitness",
    slug: "health-and-fitness",
    icon: HeartPulse,
    blurb: "Habit, training, and wellbeing apps that actually stick.",
  },
  {
    name: "Education",
    slug: "education",
    icon: GraduationCap,
    blurb: "Learning platforms and study tools for curious minds.",
  },
  {
    name: "Social",
    slug: "social",
    icon: Users,
    blurb: "Communities, networking, and the tools that connect people.",
  },
  {
    name: "Other",
    slug: "other",
    icon: Shapes,
    blurb: "Everything that doesn't fit a box yet — the experiments and one-offs.",
  },
];

const SLUG_BY_CATEGORY = new Map(CATEGORIES.map((c) => [c.name, c.slug]));
const CATEGORY_BY_SLUG = new Map(CATEGORIES.map((c) => [c.slug, c]));

/** Returns the URL slug for a stored category name (e.g. "Design Tools" → "design-tools"). */
export function slugForCategory(name: string): string | undefined {
  return SLUG_BY_CATEGORY.get(name as ProductCategory);
}

/** Resolves a URL slug back to its Category (or undefined if unknown). */
export function categoryFromSlug(slug: string): Category | undefined {
  return CATEGORY_BY_SLUG.get(slug);
}

