/**
 * Promotion vocabulary shared by the server and the browser.
 *
 * Framework-agnostic on purpose, exactly like lib/constants.ts: no React, no
 * Supabase, no `process.env`. The checkout is a client component and needs
 * these types and this formatting, so nothing here may drag a server module
 * into the client bundle.
 *
 * Note what is *not* here: no prices. Every rupee figure lives in the
 * `promotion_packages` table and reaches the browser only as data the server
 * read from it. A constant here would be a second source of truth, and the one
 * the client could be shown while the server charged the other.
 */

/** Lifecycle of a purchased slot. Mirrors the CHECK constraint on `promotions`. */
export type PromotionStatus =
  | "pending_payment"
  | "active"
  | "expired"
  | "cancelled"
  | "refunded";

/** Lifecycle of a Razorpay payment. Mirrors the CHECK constraint on `payments`. */
export type PaymentStatus = "created" | "pending" | "paid" | "failed" | "refunded";

/** Where a slot renders. Mirrors the `placement` column on `promotion_packages`. */
export type PromotionPlacement = "spotlight" | "featured" | "category";

/** A row of `promotion_packages`, as the checkout receives it. */
export type PromotionPackage = {
  id: string;
  name: string;
  description: string | null;
  placement: PromotionPlacement;
  durationDays: number;
  /** Integer paise. The unit Razorpay is charged in, carried unconverted. */
  amountPaise: number;
  currency: string;
};

/**
 * What a customer is shown after a payment is verified.
 *
 * Lives here rather than beside the code that builds it: the success screen is
 * a client component, and lib/promotion-activation.ts is `server-only`. A type
 * import from there is erased at compile time and would work, but it puts a
 * server module's path in a client file's import list, which is exactly the
 * thing a reviewer should never have to think twice about.
 */
export type PromotionSummary = {
  /** Razorpay payment id, shown to the customer as their reference. */
  reference: string;
  productName: string;
  packageName: string;
  startsAt: string | null;
  endsAt: string | null;
  amountPaise: number;
};

/** A product the signed-in maker may buy a slot for. */
export type PromotableProduct = {
  id: string;
  name: string;
  slug: string;
  category: string;
  /** True when a slot is already running for it, so the UI can say why not. */
  hasActivePromotion: boolean;
};

/**
 * Indian digit grouping, hand-rolled rather than `Intl.NumberFormat("en-IN")`.
 *
 * This string is rendered on the server and again during hydration. A Node
 * build without full ICU groups differently from the browser, which would be a
 * hydration mismatch that only appears on some hosts — the worst kind. Six
 * lines of arithmetic have no such failure mode.
 */
export function formatInr(amount: number): string {
  const rounded = Math.round(amount);
  const digits = String(Math.abs(rounded));
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}` : last3;
  return `${rounded < 0 ? "-" : ""}₹${grouped}`;
}

/**
 * Paise to a displayable rupee string: `499900` becomes `₹4,999`.
 *
 * Reuses `formatInr` above rather than `Intl.NumberFormat("en-IN")` for the
 * reason given there -- a Node build without full ICU groups digits differently
 * from the browser, and this string is rendered on both sides of a hydration
 * boundary.
 *
 * Fractional rupees are rendered when a price has them. Every seeded package is
 * a whole rupee, but a paise-denominated column can hold 49999, and silently
 * rounding that on a payment screen would show a figure that is not what the
 * card is about to be charged.
 */
export function formatPaise(paise: number): string {
  const whole = Math.trunc(paise / 100);
  const remainder = Math.abs(paise % 100);
  return remainder === 0
    ? formatInr(whole)
    : `${formatInr(whole)}.${String(remainder).padStart(2, "0")}`;
}

/** `7` becomes `7 days`, `1` becomes `1 day`. */
export function formatDuration(days: number): string {
  return `${days} ${days === 1 ? "day" : "days"}`;
}

/**
 * The window a promotion runs for, measured from the moment payment cleared.
 *
 * Pure and exported so it is unit-testable: the end of the window is what the
 * customer bought, and computing it inside the activation update would make it
 * checkable only against a live database.
 */
export function promotionWindow(
  startedAt: Date,
  durationDays: number,
): { startsAt: string; endsAt: string } {
  const ends = new Date(startedAt.getTime() + durationDays * 24 * 60 * 60 * 1000);
  return { startsAt: startedAt.toISOString(), endsAt: ends.toISOString() };
}

/**
 * What the customer is told when a payment does not go through.
 *
 * Deliberately one fixed string per outcome rather than Razorpay's own
 * `error_description`. That text is written for developers, sometimes names
 * internal gateway state, and is attacker-influenceable in the sense that it
 * varies with the instrument -- none of which belongs on a checkout screen. The
 * real reason is stored on the payment row for support.
 */
export const PAYMENT_ERROR_MESSAGE =
  "That payment did not go through. No money has been taken — you can try again.";

/** Shown when the browser hands back something the server cannot vouch for. */
export const VERIFICATION_ERROR_MESSAGE =
  "We could not confirm that payment. If money has left your account it will be refunded automatically — please contact support before paying again.";
