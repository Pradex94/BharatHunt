import { z } from "zod";

/**
 * What a launch promo needs to know about a product.
 *
 * These are the fields a `products` row already carries, so a promo can be
 * generated for any published launch without inventing copy: name, tagline,
 * category and slug come straight off the row, `makerName` off the joined
 * profile, `upvotes` off the aggregate the marketplace already computes.
 *
 * Deliberately no colours, fonts or sizes. Those are the brand, they are the
 * same in every promo, and putting them in the schema would invite a video that
 * does not look like Bharat Hunt. What varies here is the product.
 */
export const launchPromoSchema = z.object({
  /** Product name. The hero of scene 2 — long names shrink, see ProductReveal. */
  productName: z.string().min(1).max(60),
  /** One-line pitch, as shown on the product card. */
  tagline: z.string().min(1).max(120),
  /** Category label, e.g. "Developer Tools". Rendered as a chip. */
  category: z.string().min(1).max(40),
  /** Display name of the maker, for the credit line. */
  makerName: z.string().min(1).max(40),
  /** Upvote count at the time the promo is rendered. */
  upvotes: z.number().int().min(0),
  /** Product slug, for the closing URL. No leading slash. */
  slug: z.string().min(1).max(80),
});

export type LaunchPromoProps = z.infer<typeof launchPromoSchema>;

/**
 * The product every composition falls back to in the Studio.
 *
 * ZenTask is one of the static demo products in components/landing/data.ts, so
 * the placeholder here is the same fiction the landing page already tells rather
 * than a second invented one — and it is obviously not a real launch, which is
 * what you want a default to be.
 */
export const DEFAULT_PROMO: LaunchPromoProps = {
  productName: "ZenTask",
  tagline: "Calm task management for Indian founders",
  category: "Productivity",
  makerName: "Ananya Sharma",
  upvotes: 412,
  slug: "zentask",
};
