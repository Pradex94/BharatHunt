"use server";

/**
 * The money path: open a Dodo Payments checkout session, then confirm the
 * payment the customer comes back from.
 *
 * Server Actions rather than Route Handlers, matching every other authenticated
 * write in this repo. That is not only consistency -- Next verifies the `Origin`
 * header against the `Host` on every Server Action POST, so CSRF protection is
 * structural here and would have to be hand-rolled on a route handler.
 *
 * The rule the whole file is built around
 * ---------------------------------------
 * The client sends a package id and a product id. It never sends an amount, and
 * there is no parameter here that could carry one. Under Razorpay the amount was
 * read from `promotion_packages` and sent to the provider; under Dodo the amount
 * lives in Dodo's own catalogue and the session names a product id. That moves
 * the risk rather than removing it -- our page could quote one figure while
 * Dodo charges another -- so `createPromotionCheckout` reads Dodo's catalogue
 * price back and refuses to open a checkout unless it equals the price we
 * displayed. A tampered request can therefore choose *which* package to buy --
 * which is just a menu -- but not what it costs, and neither can a stale
 * dashboard edit.
 *
 * Every export of a `"use server"` module is a public HTTP endpoint that anyone
 * can post to, so this file exports exactly three functions and each one
 * re-establishes identity with `auth()` as its first statement. The service-role
 * writes they perform live in lib/promotion-activation.ts, which has no
 * `"use server"` directive and is therefore not addressable from a browser.
 */

import { revalidatePath } from "next/cache";
import { auth, currentUser } from "@clerk/nextjs/server";

import { createServiceClient } from "@/lib/supabase/service";
import { ensureProfile } from "@/lib/ensure-profile";
import { checkRateLimitByIpAndUser } from "@/lib/rate-limit";
import { SITE_URL } from "@/lib/constants";
import {
  createCheckoutSession,
  fetchCheckoutSession,
  fetchPayment,
  fetchProductPrice,
  isDodoConfigured,
  isDodoId,
} from "@/lib/dodo";
import {
  PAYMENT_ERROR_MESSAGE,
  PAYMENT_PENDING_MESSAGE,
  VERIFICATION_ERROR_MESSAGE,
  type PromotionSummary,
} from "@/lib/promotions";
import {
  activatePromotion,
  audit,
  failPayment,
  markPaymentPending,
  promotionSummary,
  settlePayment,
} from "@/lib/promotion-activation";

/** What the browser needs to start paying. No secret is among these fields. */
export type CreateCheckoutResult =
  | {
      ok: true;
      /** Dodo-hosted checkout URL. The browser navigates to it. */
      checkoutUrl: string;
      /** Our own id, so the return path knows what it came back for. */
      promotionId: string;
      amountPaise: number;
      currency: string;
      packageName: string;
      productName: string;
    }
  | { ok: false; error: string };

export type ConfirmResult =
  | { ok: true; state: "paid"; summary: PromotionSummary }
  /** Real, unfinished, and must not be retried. See PAYMENT_PENDING_MESSAGE. */
  | { ok: true; state: "pending"; message: string }
  | { ok: false; error: string; retryable: boolean };

/**
 * A pending promotion older than this is not reused for a retry.
 *
 * Dodo checkout sessions expire after 24 hours, but a customer returning a day
 * later should be quoted today's price rather than resuming a session opened at
 * an old one. Fifteen minutes covers "the card failed, try another" without
 * covering "came back tomorrow".
 */
const RETRY_REUSE_MINUTES = 15;

/**
 * The signed-in buyer's email and name, for the Dodo customer record.
 *
 * Not exported. Every export of a `"use server"` module is a public endpoint,
 * and "tell me the email on this session" is not one this app needs to offer.
 *
 * Returns null when Clerk has no primary email. Dodo requires one -- it is the
 * legal seller and the address an invoice goes to -- so there is nothing
 * sensible to substitute, and inventing a placeholder would put a fake address
 * on a real receipt.
 */
async function buyerIdentity(): Promise<{ email: string; name?: string } | null> {
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress;
  if (!email) return null;

  const name =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.username || undefined;

  return { email, name };
}

// Create checkout
// ---------------

/**
 * Price a promotion server-side and open a Dodo checkout session for it.
 *
 * Gates run cheapest first, the ordering lib/actions/ad-inquiry.ts established:
 * identity, then the rate limit, then database work, and only then outbound
 * calls to Dodo. A rejected request never costs a session.
 */
export async function createPromotionCheckout(input: {
  packageId: string;
  productId: string;
}): Promise<CreateCheckoutResult> {
  const { userId } = await auth();
  if (!userId) {
    return { ok: false, error: "Please log in to promote a product." };
  }

  if (!isDodoConfigured()) {
    audit("promotion_checkout_unconfigured", { reason: "missing_credentials" });
    return { ok: false, error: "Payments are temporarily unavailable. Please try again later." };
  }

  const allowed = await checkRateLimitByIpAndUser("promotionOrder", userId);
  if (!allowed.ok) return { ok: false, error: allowed.message };

  // Shape validation before anything touches the database. `packageId` is a
  // text primary key and `productId` a uuid; anything else is a crafted request.
  const packageId = String(input?.packageId ?? "").trim();
  const productId = String(input?.productId ?? "").trim();
  if (!/^[a-z0-9-]{1,64}$/.test(packageId)) {
    return { ok: false, error: "Choose a promotion package." };
  }
  if (!/^[0-9a-f-]{36}$/i.test(productId)) {
    return { ok: false, error: "Choose a product to promote." };
  }

  // `promotions.user_id` is a foreign key to profiles.id, and the webhook that
  // creates profiles is unreliable (see lib/ensure-profile.ts). Without this a
  // first-time buyer's insert fails on the foreign key.
  try {
    await ensureProfile();
  } catch (cause) {
    return {
      ok: false,
      error: cause instanceof Error ? cause.message : "Could not prepare your account.",
    };
  }

  const supabase = createServiceClient();

  // (1) The price. Read from the table, filtered on `is_active` so a retired
  //     package cannot be bought by naming its id.
  const { data: pkg } = await supabase
    .from("promotion_packages")
    .select("id, name, placement, duration_days, amount_paise, currency, dodo_product_id")
    .eq("id", packageId)
    .eq("is_active", true)
    .maybeSingle();

  if (!pkg) {
    return { ok: false, error: "That promotion package is no longer available." };
  }

  // A package with no Dodo product behind it cannot be charged for. This is the
  // fail-closed state a fresh deployment starts in, before an operator has
  // created the matching products in the Dodo dashboard.
  if (!isDodoId(pkg.dodo_product_id, "pdt")) {
    audit("promotion_package_unmapped", { packageId: pkg.id });
    return { ok: false, error: "That promotion package is not available to buy right now." };
  }

  // (2) Ownership and eligibility. The service client bypasses RLS, so this
  //     check *is* the authorization -- there is no policy behind it to catch a
  //     mistake here. `creator_id` is compared explicitly, and `published` is
  //     required because a pending or draft launch renders nowhere for anyone,
  //     which is where this integrates with the existing review workflow.
  const { data: product } = await supabase
    .from("products")
    .select("id, name, creator_id, status")
    .eq("id", productId)
    .maybeSingle();

  if (!product || product.creator_id !== userId) {
    // One message for "does not exist" and "is not yours", so this cannot be
    // used to enumerate which product ids are real.
    return { ok: false, error: "That product is not available to promote." };
  }
  if (product.status !== "published") {
    return {
      ok: false,
      error: "Only a published product can be promoted. This one is still in review.",
    };
  }

  // (3) Already promoted? Checked here for a readable message; the partial
  //     unique index on `promotions (product_id) where status = 'active'` is
  //     what actually enforces it under a race.
  const { data: running } = await supabase
    .from("promotions")
    .select("id, ends_at")
    .eq("product_id", productId)
    .eq("status", "active")
    .gt("ends_at", new Date().toISOString())
    .maybeSingle();

  if (running) {
    return {
      ok: false,
      error:
        "This product already has a promotion running. You can buy the next one when it ends.",
    };
  }

  // (4) The catalogue price, from Dodo.
  //
  //     This is the check that replaces sending an explicit amount. Dodo will
  //     charge whatever its own product record says, so if that has drifted from
  //     `amount_paise` the customer would be charged a figure our page never
  //     showed them. Refusing is the only safe direction: silently charging the
  //     catalogue price is fraud-shaped, and silently showing it would mean the
  //     package list and the total disagreed.
  const price = await fetchProductPrice(pkg.dodo_product_id);
  if (!price.ok) {
    audit("promotion_price_lookup_failed", { packageId: pkg.id });
    return { ok: false, error: price.error };
  }

  const quoted = Number(pkg.amount_paise);
  if (
    price.data.amount !== quoted ||
    price.data.currency !== pkg.currency ||
    price.data.payWhatYouWant ||
    price.data.discount !== 0
  ) {
    audit("promotion_price_mismatch", {
      packageId: pkg.id,
      quoted,
      catalogue: price.data.amount,
      quotedCurrency: pkg.currency,
      catalogueCurrency: price.data.currency,
      payWhatYouWant: price.data.payWhatYouWant,
      discount: price.data.discount,
    });
    return {
      ok: false,
      error: "That promotion package is being repriced. Please try again in a few minutes.",
    };
  }

  // (5) Retry reuse. A customer whose card failed comes back to the same
  //     promotion and the same Dodo session rather than minting a second of
  //     each -- which is what would otherwise leave two pending promotions and
  //     two open sessions behind one purchase.
  //
  //     Only a `created` session is reused, never a `pending` one: `pending`
  //     means a payment is genuinely in flight, and handing back a second
  //     checkout for it invites paying twice.
  const reusableSince = new Date(Date.now() - RETRY_REUSE_MINUTES * 60 * 1000).toISOString();
  const { data: pendingPromotion } = await supabase
    .from("promotions")
    .select("id, amount_paise")
    .eq("user_id", userId)
    .eq("product_id", productId)
    .eq("package_id", packageId)
    .eq("status", "pending_payment")
    .gte("created_at", reusableSince)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (pendingPromotion && Number(pendingPromotion.amount_paise) === quoted) {
    const { data: openPayment } = await supabase
      .from("payments")
      .select("dodo_session_id, checkout_url, amount, currency")
      .eq("promotion_id", pendingPromotion.id)
      .eq("status", "created")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // The open session's amount is re-checked against today's package price
    // rather than assumed: if the price moved since it was opened, the stale
    // session is abandoned and a fresh one created below at the current figure.
    if (openPayment?.checkout_url && Number(openPayment.amount) === quoted) {
      audit("promotion_checkout_reused", {
        promotionId: pendingPromotion.id,
        sessionId: openPayment.dodo_session_id,
      });
      return {
        ok: true,
        checkoutUrl: openPayment.checkout_url,
        promotionId: pendingPromotion.id,
        amountPaise: quoted,
        currency: openPayment.currency,
        packageName: pkg.name,
        productName: product.name,
      };
    }
  }

  // (6) The promotion row, created before the session so the session's metadata
  //     can carry its id -- which is what lets a webhook arriving for an
  //     otherwise unknown payment still be traced back to a purchase, and what
  //     `settlePayment` checks the payment against.
  const { data: promotion, error: promotionError } = await supabase
    .from("promotions")
    .insert({
      user_id: userId,
      product_id: productId,
      package_id: pkg.id,
      placement: pkg.placement,
      duration_days: pkg.duration_days,
      // Snapshotted. A later price change must not rewrite what this customer
      // agreed to pay.
      amount_paise: pkg.amount_paise,
      currency: pkg.currency,
      status: "pending_payment",
    })
    .select("id")
    .single();

  if (promotionError || !promotion) {
    audit("promotion_insert_failed", { code: promotionError?.code ?? null });
    return { ok: false, error: "Could not start that purchase. Please try again." };
  }

  const buyer = await buyerIdentity();
  if (!buyer) {
    audit("promotion_checkout_no_email", { promotionId: promotion.id });
    return {
      ok: false,
      error: "Add a verified email address to your account before buying a promotion.",
    };
  }

  // (7) The session. `promotion` in the return URL is a pointer, not a
  //     credential: the confirm path re-derives the session id from our own row
  //     and asks Dodo what happened, so a customer editing it can at most point
  //     at a promotion that is not theirs and be told it is not theirs.
  const receipt = `bh_${promotion.id}`.slice(0, 40);
  const session = await createCheckoutSession({
    productId: pkg.dodo_product_id,
    // Prefill only, and read from Clerk rather than from the request: this
    // reaches Dodo as the customer record on a real invoice, so it must be the
    // signed-in identity and not a value the browser chose. Under Razorpay the
    // browser passed its own prefill because Checkout ran in the browser; a
    // server-created session has no such excuse.
    customer: { email: buyer.email, name: buyer.name },
    returnUrl: `${SITE_URL}/promote/checkout?status=success&promotion=${promotion.id}`,
    cancelUrl: `${SITE_URL}/promote/checkout?status=cancelled&promotion=${promotion.id}`,
    metadata: {
      promotion_id: promotion.id,
      product_id: productId,
      package_id: pkg.id,
      user_id: userId,
    },
  });

  if (!session.ok) {
    audit("promotion_checkout_failed", { promotionId: promotion.id });
    return { ok: false, error: session.error };
  }

  // (8) The payment record, storing the price we quoted. What Dodo actually
  //     charges lands in `charged_amount` at settlement.
  const { error: paymentError } = await supabase.from("payments").insert({
    user_id: userId,
    promotion_id: promotion.id,
    dodo_session_id: session.data.sessionId,
    checkout_url: session.data.checkoutUrl,
    receipt,
    amount: quoted,
    currency: pkg.currency,
    status: "created",
  });

  if (paymentError) {
    // The session exists at Dodo but we could not record it. Refusing here is
    // the safe direction: an unrecorded session nobody pays costs nothing,
    // whereas sending the customer to a checkout with no local row would take
    // money we could not afterwards match to a promotion.
    audit("payment_insert_failed", {
      promotionId: promotion.id,
      sessionId: session.data.sessionId,
      code: paymentError.code ?? null,
    });
    return { ok: false, error: "Could not start that purchase. Please try again." };
  }

  audit("promotion_checkout_created", {
    promotionId: promotion.id,
    sessionId: session.data.sessionId,
    packageId: pkg.id,
  });

  return {
    ok: true,
    checkoutUrl: session.data.checkoutUrl,
    promotionId: promotion.id,
    amountPaise: quoted,
    currency: pkg.currency,
    packageName: pkg.name,
    productName: product.name,
  };
}

// Confirm
// -------

/**
 * Confirm a returned checkout and, only then, activate the promotion.
 *
 * The customer arrives back from Dodo with `?status=success&promotion=<id>` in
 * the URL. Not one byte of that is treated as evidence. What actually happens:
 *
 *   1. the promotion id is looked up among the *caller's own* payment rows;
 *   2. the checkout session id is read from that row, never from the request;
 *   3. Dodo is asked, over the API, whether that session produced a payment and
 *      what its status is;
 *   4. the payment is re-read for its amount, currency and metadata, and
 *      `settlePayment` refuses anything that does not bind back to this
 *      promotion.
 *
 * A customer who edits the query string to another promotion's id fails at (1).
 * One who invents a session id cannot: there is no parameter for it.
 *
 * This is the fast path, not the authoritative one. The webhook settles the same
 * rows through the same functions and is what remains correct when the customer
 * closes the tab on Dodo's page or pays through a mandate that clears minutes
 * later. Both are idempotent; whichever arrives first wins.
 */
export async function confirmPromotionPayment(input: {
  promotionId: string;
}): Promise<ConfirmResult> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Please log in.", retryable: false };

  const allowed = await checkRateLimitByIpAndUser("paymentVerify", userId);
  if (!allowed.ok) return { ok: false, error: allowed.message, retryable: true };

  const promotionId = String(input?.promotionId ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(promotionId)) {
    return { ok: false, error: VERIFICATION_ERROR_MESSAGE, retryable: false };
  }

  const supabase = createServiceClient();
  const { data: payment } = await supabase
    .from("payments")
    .select("id, user_id, promotion_id, dodo_session_id, dodo_payment_id, status")
    .eq("promotion_id", promotionId)
    // Step (1). The service client bypasses RLS, so scoping to the caller here
    // *is* the authorization -- there is no policy behind it.
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!payment) {
    audit("payment_confirm_not_found", { promotionId });
    return { ok: false, error: VERIFICATION_ERROR_MESSAGE, retryable: false };
  }

  // Already settled -- by an earlier call, or by the webhook winning the race.
  // Idempotent success rather than an error: the customer paid once and should
  // see one success screen however many times this runs.
  if (payment.status === "paid") {
    await activatePromotion(payment.promotion_id);
    const existing = await promotionSummary(
      payment.promotion_id,
      payment.dodo_payment_id ?? payment.dodo_session_id,
    );
    return existing.ok
      ? { ok: true, state: "paid", summary: existing.summary }
      : { ok: false, error: existing.error, retryable: false };
  }

  // Step (3). Dodo's word, not the browser's.
  const session = await fetchCheckoutSession(payment.dodo_session_id);
  if (!session.ok) {
    return {
      ok: false,
      error: "We could not confirm that payment yet. Please refresh in a moment.",
      retryable: true,
    };
  }

  // No payment yet means the session was opened and abandoned before any
  // instrument was entered. Nothing has been charged and nothing is recorded.
  if (!session.data.paymentId) {
    return { ok: false, error: PAYMENT_ERROR_MESSAGE, retryable: true };
  }

  const status = session.data.paymentStatus;

  if (status === "failed" || status === "cancelled") {
    await failPayment({ sessionId: payment.dodo_session_id, code: status, userId });
    return { ok: false, error: PAYMENT_ERROR_MESSAGE, retryable: true };
  }

  // Everything that is neither settled nor dead. Recorded as pending and
  // reported as pending -- never as a failure, which would send a customer with
  // money in flight to pay a second time.
  if (status !== "succeeded") {
    await markPaymentPending({
      sessionId: payment.dodo_session_id,
      paymentId: session.data.paymentId,
      userId,
    });
    audit("payment_still_pending", {
      promotionId,
      paymentId: session.data.paymentId,
      remoteStatus: status,
    });
    return { ok: true, state: "pending", message: PAYMENT_PENDING_MESSAGE };
  }

  // Step (4). The amount, currency and metadata come from the payment itself.
  const remote = await fetchPayment(session.data.paymentId);
  if (!remote.ok) {
    return {
      ok: false,
      error: "We could not confirm that payment yet. Please refresh in a moment.",
      retryable: true,
    };
  }

  // The session the payment names must be the session we opened. Dodo already
  // told us these are related by returning the payment id from that session, so
  // this is belt-and-braces -- but it is the check that would catch a swapped
  // id, and it costs a string comparison.
  if (
    remote.data.checkoutSessionId &&
    remote.data.checkoutSessionId !== payment.dodo_session_id
  ) {
    audit("payment_session_mismatch", {
      promotionId,
      paymentId: remote.data.paymentId,
      expected: payment.dodo_session_id,
    });
    return { ok: false, error: VERIFICATION_ERROR_MESSAGE, retryable: false };
  }

  const settled = await settlePayment({
    sessionId: payment.dodo_session_id,
    paymentId: remote.data.paymentId,
    chargedAmount: remote.data.totalAmount,
    currency: remote.data.currency,
    tax: remote.data.tax,
    metadataPromotionId:
      typeof remote.data.metadata.promotion_id === "string"
        ? remote.data.metadata.promotion_id
        : null,
  });

  // A refusal must never be read as a success, or a mismatched charge would draw
  // a success screen over an unpaid promotion.
  if (!settled.ok) {
    audit("payment_settlement_refused", {
      promotionId,
      paymentId: remote.data.paymentId,
      reason: settled.reason,
    });
    return { ok: false, error: VERIFICATION_ERROR_MESSAGE, retryable: false };
  }

  audit("payment_confirmed", {
    promotionId: settled.promotionId,
    paymentId: remote.data.paymentId,
    firstSettlement: settled.firstWrite,
  });

  // The maker's dashboard and their promotion history both change on payment.
  revalidatePath("/dashboard");
  revalidatePath("/promote/checkout");

  const summary = await promotionSummary(settled.promotionId, remote.data.paymentId);
  return summary.ok
    ? { ok: true, state: "paid", summary: summary.summary }
    : { ok: false, error: summary.error, retryable: false };
}

/**
 * Record that a checkout was abandoned, so the customer's history is honest and
 * a retry starts from a clean state.
 *
 * Cannot mark anything paid. It only ever writes `failed`, only over a
 * still-open payment, and only over one belonging to the caller -- so the worst
 * a forged call achieves is marking the caller's own open payment failed, which
 * they can already do by walking away from Dodo's checkout page.
 */
export async function recordPromotionCheckoutCancelled(input: {
  promotionId: string;
}): Promise<{ ok: boolean }> {
  const { userId } = await auth();
  if (!userId) return { ok: false };

  const promotionId = String(input?.promotionId ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(promotionId)) return { ok: false };

  const supabase = createServiceClient();
  const { data: payment } = await supabase
    .from("payments")
    .select("dodo_session_id")
    .eq("promotion_id", promotionId)
    .eq("user_id", userId)
    .eq("status", "created")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!payment) return { ok: false };

  await failPayment({
    sessionId: payment.dodo_session_id,
    code: "checkout_cancelled",
    description: "The customer returned from Dodo checkout without paying.",
    userId,
  });

  return { ok: true };
}
