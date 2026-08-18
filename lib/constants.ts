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

/** A single maker may launch at most this many products. */
export const MAX_PRODUCTS_PER_USER = 3;

/**
 * Gallery screenshots per product. Enforced in the submit form (so makers see
 * the ceiling) and again server-side in `lib/actions/products.ts` (so it is
 * real). Shared from here to stop the two drifting apart.
 */
export const MAX_GALLERY_IMAGES = 8;

/**
 * Canonical public origin — the single source of truth for absolute URLs used
 * by metadata (`metadataBase`), the sitemap, robots.txt, and JSON-LD. Override
 * per-environment with `NEXT_PUBLIC_SITE_URL` (e.g. a preview or custom domain);
 * the trailing slash is stripped so callers can safely concatenate paths.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://bharat-hunt.vercel.app"
).replace(/\/+$/, "");

/** The human-facing site name, reused across metadata and structured data. */
export const SITE_NAME = "Bharat Hunt";

/**
 * Google Tag Manager container. Not a secret — it ships in the page source of
 * every site that uses one — so it lives here rather than in an env var, and
 * `NEXT_PUBLIC_GTM_ID` overrides it when a preview needs its own container.
 * Empty string disables the tag entirely (see `components/analytics/`).
 */
export const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID ?? "GTM-548ZQGWC";

/**
 * GA4 measurement ID (`G-XXXXXXXXXX`), from GA4 Admin > Data streams > your web
 * stream. Like the container ID it is not a secret, but unlike it there is no
 * sensible default to hardcode — an ID belongs to one property, and shipping
 * someone else's would silently send this site's traffic to their reports. So
 * it comes from `NEXT_PUBLIC_GA_ID` and GA4 stays off until that is set.
 *
 * GA4 is loaded here in code rather than as a tag inside the GTM container.
 * Both work; this way the measurement setup is version-controlled, reviewable,
 * and gated by the same consent bootstrap as everything else, instead of
 * living as UI state in an account only one person can see. The trade-off is
 * that a GA4 tag must NOT also be added in the GTM UI, or every page view is
 * counted twice.
 */
export const GA_ID = process.env.NEXT_PUBLIC_GA_ID ?? "";

/**
 * Whether to actually mount the Google tags.
 *
 * Off outside production by default, because `npm run dev` otherwise reports
 * every local page view as real traffic and quietly poisons the numbers you
 * are trying to read. Set `NEXT_PUBLIC_GTM_DEBUG=true` in `.env.local` when you
 * need Tag Assistant or the GA4 DebugView to see a local page.
 */
const ANALYTICS_ENABLED =
  process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_GTM_DEBUG === "true";

export const GTM_ENABLED = ANALYTICS_ENABLED && Boolean(GTM_ID);

export const GA_ENABLED = ANALYTICS_ENABLED && Boolean(GA_ID);

/**
 * Whether anything needs the shared bootstrap script (consent defaults + the
 * loaders). Either tag alone is reason enough to emit it.
 */
export const GOOGLE_TAGS_ENABLED = GTM_ENABLED || GA_ENABLED;

/**
 * Where advertising inquiries go. Single source of truth for the /advertise
 * form, the chatbot, and the fallback message shown when a lead can't be
 * saved — keep the address here, not inline, so the two never drift apart.
 */
export const ADS_EMAIL = "ads@bharathunt.org";

/**
 * Platform admins, by email (case-insensitive). Admins bypass the launch limit
 * and can moderate (edit/delete) any product; server-side checks are the real
 * gate (`lib/admin.ts`) — the client only uses this to show/hide the Admin link.
 * Override with a comma-separated `NEXT_PUBLIC_ADMIN_EMAILS` env var (defaults to
 * the project owner so admin access works with zero config).
 */
export const ADMIN_EMAILS = (
  process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "bislapardeep007@gmail.com"
)
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

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

/**
 * Multi-platform availability matrix (stored in `products.platform_links` jsonb,
 * keyed by `key`). Website + GitHub keep their own dedicated columns; this covers
 * the app-store / marketplace links. Shared by the submit form and the product
 * detail page so both stay in lockstep.
 */
export const PRODUCT_PLATFORMS = [
  { key: "ios", label: "iOS App Store", placeholder: "https://apps.apple.com/app/…" },
  { key: "android", label: "Google Play", placeholder: "https://play.google.com/store/apps/…" },
  { key: "chrome", label: "Chrome Web Store", placeholder: "https://chromewebstore.google.com/…" },
  { key: "figma", label: "Figma Community", placeholder: "https://figma.com/community/…" },
  { key: "producthunt", label: "Product Hunt", placeholder: "https://producthunt.com/products/…" },
  { key: "appsumo", label: "AppSumo", placeholder: "https://appsumo.com/products/…" },
] as const;

export type ProductPlatformKey = (typeof PRODUCT_PLATFORMS)[number]["key"];

// "relevance" only makes sense with a search term, so it is deliberately last
// and is never offered as a browse sort — see components/marketplace/sort-pills.tsx.
export const PRODUCT_SORTS = [
  "trending",
  "newest",
  "price-low",
  "price-high",
  "top-rated",
  "relevance",
] as const;
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

