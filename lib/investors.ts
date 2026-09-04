/**
 * Investor Directory vocabulary shared by the server and the browser.
 *
 * Framework-agnostic on purpose, exactly like lib/constants.ts and
 * lib/promotions.ts: no React, no Supabase, no `process.env`. The directory UI,
 * the filter drawer and the unlock card are all client components and need
 * these types, this vocabulary and this formatting, so nothing here may drag a
 * server module into the client bundle.
 *
 * Note what is *not* here: no price, and no investor data. The rupee figure
 * lives in `investor_directory_plans.amount_paise` and reaches the browser only
 * as a value the server read from it; a constant here would be a second source
 * of truth and the one a customer could be shown while the server charged the
 * other. Investor rows reach the browser only as props the server decided the
 * caller was entitled to.
 */

/**
 * The value written into every directory checkout session's `metadata.purpose`.
 *
 * This is what the shared `/api/webhooks/dodo` route dispatches on, which is why
 * it lives in this framework-agnostic module rather than beside the action that
 * writes it: a `"use server"` file may only export async functions, so a
 * constant there could not be imported by the webhook at all.
 *
 * Promotion sessions predate this field and carry no `purpose`, so the webhook
 * treats its absence as "promotion" and the existing money path is untouched by
 * this feature — the property that matters most here, because that path is live.
 *
 * Dispatching on metadata rather than on "which table has this session id" is
 * deliberate: the table lookup would work, but it makes every event a probe
 * against both products, and a third product would make it three.
 */
export const INVESTOR_CHECKOUT_PURPOSE = "investor_directory";

/** Lifecycle of a directory purchase. Mirrors the CHECK on the purchases table. */
export type InvestorPurchaseStatus =
  | "created"
  | "pending"
  | "paid"
  | "failed"
  | "refunded";

/**
 * How many investor profiles a visitor sees without paying.
 *
 * The ceiling the *query* applies, not a hint to the UI: `getFreeInvestors()`
 * passes it to `.limit()`, so flagging a fifth row `is_free_preview` in the
 * database widens the flag but not the free tier. One number, enforced on the
 * server, in the one place the rows are actually fetched.
 */
export const INVESTOR_FREE_PREVIEW_LIMIT = 4;

/**
 * How many locked cards the conversion section draws.
 *
 * These carry no investor data at all — see `LockedDirectory`. The count is
 * here only so the section and any copy about it cannot disagree.
 */
export const INVESTOR_LOCKED_TEASER_COUNT = 6;

/**
 * Funding stages, in the order a company passes through them.
 *
 * Order is the point: a `Set`-backed filter list rendered alphabetically would
 * put "Series A" before "Seed", which reads as a mistake to the founders this
 * is for. Stored on the row as `text[]`; this is the vocabulary the admin form
 * offers and the filter UI renders, not a database constraint.
 */
export const INVESTOR_STAGES = [
  "Pre-Seed",
  "Seed",
  "Series A",
  "Series B",
  "Series C",
  "Growth",
] as const;

export type InvestorStage = (typeof INVESTOR_STAGES)[number];

/**
 * Sector vocabulary.
 *
 * Deliberately *not* `PRODUCT_CATEGORIES`. That list is the taxonomy makers
 * file a launch under ("Food & Drink", "Design Tools"); this is the language
 * investors describe a mandate in ("FinTech", "Deep Tech", "Climate"). Reusing
 * one for the other would make both worse, and the two lists have no reason to
 * move together.
 */
export const INVESTOR_SECTORS = [
  "SaaS",
  "FinTech",
  "Consumer",
  "AI",
  "Developer Tools",
  "B2B",
  "Enterprise",
  "Marketplace",
  "D2C",
  "Health",
  "Education",
  "Climate",
  "Energy",
  "Mobility",
  "Logistics",
  "AgriTech",
  "Deep Tech",
  "Hardware",
  "Cybersecurity",
  "InsurTech",
  "Media",
  "Travel",
  "Food",
] as const;

export type InvestorSector = (typeof INVESTOR_SECTORS)[number];

/** What kind of cheque this is. */
export const INVESTOR_TYPES = [
  "Angel",
  "Syndicate",
  "Micro VC",
  "VC",
  "Accelerator",
  "Family Office",
  "CVC",
] as const;

export type InvestorType = (typeof INVESTOR_TYPES)[number];

/**
 * An investor as the *free preview* renders it.
 *
 * Every field here is one the free tier genuinely shows. That is why this type
 * exists separately from `InvestorFull` below rather than making the extra
 * fields optional: an optional field is a field a component may forget to
 * guard, and the field it would forget is `email`. With two types, handing
 * preview data to a component that wants contact details is a compile error.
 */
export type InvestorPreview = {
  id: string;
  name: string;
  firmName: string | null;
  logoUrl: string | null;
  location: string | null;
  investorType: string | null;
  stages: string[];
  sectors: string[];
  portfolio: string[];
  checkSizeMinInr: number | null;
  checkSizeMaxInr: number | null;
  thesis: string | null;
  /** True while this row is one of the seeded demonstration records. */
  isSample: boolean;
};

/**
 * An investor as a paying customer sees it: the preview plus the fields the
 * ₹499 actually buys.
 */
export type InvestorFull = InvestorPreview & {
  website: string | null;
  email: string | null;
  linkedin: string | null;
  contactDetails: string | null;
};

/** Narrowing helper for components that render either shape. */
export function isFullInvestor(
  investor: InvestorPreview | InvestorFull,
): investor is InvestorFull {
  return "email" in investor;
}

/** The filter state the directory search runs under. */
export type InvestorFilters = {
  /** Free text over name, firm, sector, location and thesis. */
  q: string;
  stage: string | null;
  sector: string | null;
  location: string | null;
  investorType: string | null;
};

export const EMPTY_INVESTOR_FILTERS: InvestorFilters = {
  q: "",
  stage: null,
  sector: null,
  location: null,
  investorType: null,
};

/** How many filters are set, for the "Filters (2)" badge on the mobile drawer. */
export function activeFilterCount(filters: InvestorFilters): number {
  return [filters.stage, filters.sector, filters.location, filters.investorType].filter(Boolean)
    .length;
}

/**
 * The plan, as the page receives it. One row of `investor_directory_plans`.
 *
 * `purchasable` is computed on the server from whether a Dodo product is mapped,
 * because `dodo_product_id` itself is operational detail the browser has no use
 * for — and shipping a provider id to every visitor to answer a yes/no question
 * is how internal identifiers end up in someone's page source.
 */
export type InvestorDirectoryPlan = {
  id: string;
  name: string;
  description: string | null;
  /** Integer paise. The unit Dodo's catalogue is priced in, carried unconverted. */
  amountPaise: number;
  currency: string;
  purchasable: boolean;
};

/** What a customer is shown after their directory payment is verified. */
export type InvestorPurchaseSummary = {
  /** Dodo payment id, shown to the customer as their reference. */
  reference: string;
  planName: string;
  /** The net price we quoted, in paise. */
  amountPaise: number;
  /**
   * What Dodo actually charged, tax included, in the smallest unit of
   * `chargedCurrency`. Null until a payment settles.
   *
   * Separate from `amountPaise` for the reason lib/promotions.ts records:
   * Dodo Payments is the Merchant of Record, so it adds the sales tax for the
   * customer's jurisdiction on top of the catalogue price, and a receipt
   * showing only the net figure disagrees with the customer's card statement.
   */
  chargedAmount: number | null;
  chargedCurrency: string | null;
  chargedTax: number | null;
};

/**
 * Indian digit grouping for a whole-rupee figure.
 *
 * A deliberate duplicate of `formatInr` in lib/promotions.ts rather than an
 * import from it. That module is the promotions vocabulary; importing it here
 * would make every investor component pull in promotion types it never uses,
 * and the two products are meant to be separable. Same six lines, same reason
 * for hand-rolling them: this string is rendered on the server and again during
 * hydration, and a Node build without full ICU groups differently from the
 * browser — a hydration mismatch that only appears on some hosts.
 */
function groupInr(amount: number): string {
  const rounded = Math.round(amount);
  const digits = String(Math.abs(rounded));
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}` : last3;
  return `${rounded < 0 ? "-" : ""}₹${grouped}`;
}

/**
 * Paise to a displayable rupee string: `49900` becomes `₹499`.
 *
 * Fractional rupees are rendered when a price has them. The seeded plan is a
 * whole rupee, but a paise-denominated column can hold 49999, and silently
 * rounding that on a payment screen would show a figure that is not what the
 * card is about to be charged.
 */
export function formatPaise(paise: number): string {
  const whole = Math.trunc(paise / 100);
  const remainder = Math.abs(paise % 100);
  return remainder === 0
    ? groupInr(whole)
    : `${groupInr(whole)}.${String(remainder).padStart(2, "0")}`;
}

/**
 * A cheque size in the units founders actually say out loud: `2500000` becomes
 * "₹25L", `120000000` becomes "₹12Cr".
 *
 * Lakh and crore rather than "2.5M": this is an Indian investor directory read
 * by Indian founders, and a range printed as "₹2,500,000 – ₹25,000,000" is
 * three seconds of counting zeroes on every card.
 *
 * One decimal place, and only when it changes the number — "₹1.5Cr" is useful,
 * "₹2.0Cr" is noise.
 */
export function formatCheque(rupees: number): string {
  const abs = Math.abs(rupees);
  const trim = (value: number) =>
    (Math.round(value * 10) / 10).toFixed(1).replace(/\.0$/, "");

  if (abs >= 10000000) return `₹${trim(rupees / 10000000)}Cr`;
  if (abs >= 100000) return `₹${trim(rupees / 100000)}L`;
  if (abs >= 1000) return `₹${trim(rupees / 1000)}K`;
  return groupInr(rupees);
}

/**
 * A cheque *range*, or null when neither bound is recorded.
 *
 * Null rather than a placeholder string, so a caller decides whether to render
 * a row at all. A card that prints "Cheque size: —" for half the directory
 * looks like a broken import; one that omits the row looks considered.
 */
export function formatChequeRange(
  min: number | null | undefined,
  max: number | null | undefined,
): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null) {
    return min === max ? formatCheque(min) : `${formatCheque(min)} – ${formatCheque(max)}`;
  }
  return min != null ? `${formatCheque(min)}+` : `Up to ${formatCheque(max as number)}`;
}

/**
 * What the customer is told when a directory payment does not go through.
 *
 * One fixed string per outcome rather than Dodo's own `error_message`, which is
 * written for developers, sometimes names internal gateway state, and varies
 * with the instrument. The real reason is stored on the purchase row for
 * support. Same three messages as the promotion path, worded for this product.
 */
export const INVESTOR_PAYMENT_ERROR_MESSAGE =
  "That payment did not go through. No money has been taken — you can try again.";

/** Shown when the browser hands back something the server cannot vouch for. */
export const INVESTOR_VERIFICATION_ERROR_MESSAGE =
  "We could not confirm that payment. If money has left your account it will be refunded automatically — please contact support before paying again.";

/**
 * Shown when the payment is real but has not finished settling.
 *
 * Dodo's hosted checkout can return a customer whose payment sits `processing`
 * or `requires_customer_action` — a UPI mandate awaiting approval in another
 * app, a bank page they have not finished. Telling that customer "payment
 * failed" would send them to pay a second time while the first is still in
 * flight, which is the one outcome worth spending a separate string to avoid.
 */
export const INVESTOR_PAYMENT_PENDING_MESSAGE =
  "Your payment is still going through. Do not pay again — this page updates on its own, and your access unlocks the moment it clears.";

/** Shown when someone returns from a checkout they abandoned. */
export const INVESTOR_PAYMENT_CANCELLED_MESSAGE =
  "That payment was cancelled and nothing has been charged. The directory is still here whenever you want to unlock it.";

/**
 * The standing disclaimer, rendered near the foot of /investors.
 *
 * A constant rather than inline JSX because it is a claim about what this
 * product is and is not, and it must read identically wherever it appears —
 * the page today, a receipt email tomorrow.
 */
export const INVESTOR_DISCLAIMER =
  "Investor information is provided for research and discovery purposes. Investment decisions should be independently verified. Bharat Hunt does not guarantee funding, investment decisions, or responses from investors.";
