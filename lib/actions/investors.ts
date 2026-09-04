"use server";

/**
 * The Investor Directory's public surface: open a Dodo checkout, confirm the
 * payment the customer comes back from, and serve the directory to someone who
 * has paid for it.
 *
 * Server Actions rather than Route Handlers, matching every other authenticated
 * path in this repo. That is not only consistency — Next verifies the `Origin`
 * header against the `Host` on every Server Action POST, so CSRF protection is
 * structural here and would have to be hand-rolled on a route handler. It also
 * means there is no `/api/investors` endpoint to find: the directory has no URL
 * a scraper can point at, only an action id that answers with rows for a paying
 * caller and an error for everyone else.
 *
 * Every export of a `"use server"` module is a public HTTP endpoint that anyone
 * can post to. So this file exports exactly four functions, each one
 * re-establishes identity with `auth()` as its first statement, and the one
 * that returns investor data re-checks entitlement through
 * `getInvestorDirectory`, which checks it again itself. The service-role writes
 * they perform live in lib/investor-access.ts, which has no `"use server"`
 * directive and is therefore not addressable from a browser.
 *
 * The rule the payment half is built around
 * -----------------------------------------
 * The client sends nothing but a plan id — and there is only one plan. There is
 * no parameter here that could carry an amount. The price lives in
 * `investor_directory_plans.amount_paise`, Dodo charges what its own catalogue
 * says, and `createInvestorCheckout` reads that catalogue back and refuses to
 * open a session unless the two agree. A tampered request can therefore choose
 * nothing at all, and neither a crafted payload nor a stale dashboard edit can
 * change what is charged.
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
  INVESTOR_CHECKOUT_PURPOSE,
  INVESTOR_PAYMENT_ERROR_MESSAGE,
  INVESTOR_PAYMENT_PENDING_MESSAGE,
  INVESTOR_VERIFICATION_ERROR_MESSAGE,
  type InvestorFilters,
  type InvestorFull,
  type InvestorPurchaseSummary,
} from "@/lib/investors";
import {
  audit,
  failInvestorPurchase,
  investorPurchaseSummary,
  markInvestorPurchasePending,
  settleInvestorPurchase,
} from "@/lib/investor-access";
import {
  getInvestorDirectory,
  hasInvestorDirectoryAccess,
  INVESTOR_PAGE_SIZE,
} from "@/services/investors";

/** The only plan there is. Named once so the action and the page agree. */
const PLAN_ID = "full-access";

/** What the browser needs to start paying. No secret is among these fields. */
export type CreateInvestorCheckoutResult =
  | {
      ok: true;
      /** Dodo-hosted checkout URL. The browser navigates to it. */
      checkoutUrl: string;
      /** Our own id, so the return path knows what it came back for. */
      purchaseId: string;
      amountPaise: number;
      currency: string;
    }
  | { ok: false; error: string };

export type ConfirmInvestorResult =
  | { ok: true; state: "paid"; summary: InvestorPurchaseSummary }
  /** Real, unfinished, and must not be retried. See the pending message. */
  | { ok: true; state: "pending"; message: string }
  | { ok: false; error: string; retryable: boolean };

/**
 * An open purchase older than this is not reused for a retry.
 *
 * Dodo checkout sessions expire after 24 hours, but a customer returning a day
 * later should be quoted today's price rather than resuming a session opened at
 * an old one. Fifteen minutes covers "the card failed, try another" without
 * covering "came back tomorrow" — the same window the promotion path uses.
 */
const RETRY_REUSE_MINUTES = 15;

/**
 * The signed-in buyer's email and name, for the Dodo customer record.
 *
 * Not exported. Every export of a `"use server"` module is a public endpoint,
 * and "tell me the email on this session" is not one this app needs to offer.
 *
 * Returns null when Clerk has no primary email. Dodo requires one — it is the
 * legal seller and the address an invoice goes to — so there is nothing sensible
 * to substitute, and inventing a placeholder would put a fake address on a real
 * receipt.
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
 * Price the directory server-side and open a Dodo checkout session for it.
 *
 * Gates run cheapest first, the ordering lib/actions/ad-inquiry.ts established:
 * identity, then the rate limit, then database work, and only then outbound
 * calls to Dodo. A rejected request never costs a session.
 */
export async function createInvestorCheckout(): Promise<CreateInvestorCheckoutResult> {
  const { userId } = await auth();
  if (!userId) {
    return { ok: false, error: "Please log in to unlock the investor directory." };
  }

  if (!isDodoConfigured()) {
    audit("investor_checkout_unconfigured", { reason: "missing_credentials" });
    return { ok: false, error: "Payments are temporarily unavailable. Please try again later." };
  }

  const allowed = await checkRateLimitByIpAndUser("investorUnlock", userId);
  if (!allowed.ok) return { ok: false, error: allowed.message };

  // (1) Already bought it? Checked before anything is spent, so a customer who
  //     clicks Unlock from a stale tab is told they already have access rather
  //     than being charged a second time. There is deliberately no unique index
  //     enforcing this in the database — see the note on
  //     `investor_directory_purchases_paid_idx` — because a constraint here
  //     would make the webhook unable to record money that had already left an
  //     account. This is the gate that can fail safely; the database's job is
  //     to record what happened, not to refuse it.
  if (await hasInvestorDirectoryAccess(userId)) {
    return { ok: false, error: "You already have full access to the investor directory." };
  }

  // `investor_directory_purchases.user_id` is a foreign key to profiles.id, and
  // the webhook that creates profiles is unreliable (see lib/ensure-profile.ts).
  // Without this a first-time buyer's insert fails on the foreign key.
  try {
    await ensureProfile();
  } catch (cause) {
    return {
      ok: false,
      error: cause instanceof Error ? cause.message : "Could not prepare your account.",
    };
  }

  const supabase = createServiceClient();

  // (2) The price. Read from the table, filtered on `is_active` so a retired
  //     plan cannot be bought by naming its id.
  const { data: plan } = await supabase
    .from("investor_directory_plans")
    .select("id, name, amount_paise, currency, dodo_product_id")
    .eq("id", PLAN_ID)
    .eq("is_active", true)
    .maybeSingle();

  if (!plan) {
    return { ok: false, error: "The investor directory is not available to buy right now." };
  }

  // A plan with no Dodo product behind it cannot be charged for. This is the
  // fail-closed state a fresh deployment starts in, before an operator has
  // created the matching product in the Dodo dashboard.
  if (!isDodoId(plan.dodo_product_id, "pdt")) {
    audit("investor_plan_unmapped", { planId: plan.id });
    return { ok: false, error: "The investor directory is not available to buy right now." };
  }

  // (3) The catalogue price, from Dodo.
  //
  //     Dodo will charge whatever its own product record says, so if that has
  //     drifted from `amount_paise` the customer would be charged a figure our
  //     page never showed them. Refusing is the only safe direction: silently
  //     charging the catalogue price is fraud-shaped, and silently showing it
  //     would mean the pricing card and the total disagreed.
  const price = await fetchProductPrice(plan.dodo_product_id);
  if (!price.ok) {
    audit("investor_price_lookup_failed", { planId: plan.id });
    return { ok: false, error: price.error };
  }

  const quoted = Number(plan.amount_paise);
  if (
    price.data.amount !== quoted ||
    price.data.currency !== plan.currency ||
    price.data.payWhatYouWant ||
    price.data.discount !== 0
  ) {
    audit("investor_price_mismatch", {
      planId: plan.id,
      quoted,
      catalogue: price.data.amount,
      quotedCurrency: plan.currency,
      catalogueCurrency: price.data.currency,
      payWhatYouWant: price.data.payWhatYouWant,
      discount: price.data.discount,
    });
    return {
      ok: false,
      error: "The directory is being repriced. Please try again in a few minutes.",
    };
  }

  // (4) Retry reuse. A customer whose card failed comes back to the same
  //     purchase and the same Dodo session rather than minting a second of
  //     each — which is what would otherwise leave two open sessions behind one
  //     intent to buy.
  //
  //     Only a `created` session is reused, never a `pending` one: `pending`
  //     means a payment is genuinely in flight, and handing back a second
  //     checkout for it invites paying twice.
  const reusableSince = new Date(Date.now() - RETRY_REUSE_MINUTES * 60 * 1000).toISOString();
  const { data: open } = await supabase
    .from("investor_directory_purchases")
    .select("id, dodo_session_id, checkout_url, amount, currency")
    .eq("user_id", userId)
    .eq("plan_id", PLAN_ID)
    .eq("status", "created")
    .gte("created_at", reusableSince)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // The open session's amount is re-checked against today's plan price rather
  // than assumed: if the price moved since it was opened, the stale session is
  // abandoned and a fresh one created below at the current figure.
  if (open?.checkout_url && Number(open.amount) === quoted) {
    audit("investor_checkout_reused", {
      purchaseId: open.id,
      sessionId: open.dodo_session_id,
    });
    return {
      ok: true,
      checkoutUrl: open.checkout_url,
      purchaseId: open.id,
      amountPaise: quoted,
      currency: open.currency,
    };
  }

  const buyer = await buyerIdentity();
  if (!buyer) {
    audit("investor_checkout_no_email", { userId });
    return {
      ok: false,
      error: "Add a verified email address to your account before unlocking the directory.",
    };
  }

  // (5) The session, created before the row so its id can be stored on it.
  //
  //     `purchase` in the return URL is a pointer, not a credential: the confirm
  //     path re-derives the session id from our own row and asks Dodo what
  //     happened, so a customer editing it can at most point at a purchase that
  //     is not theirs and be told it is not theirs.
  //
  //     The row is written *after* the session here, the opposite order from
  //     the promotion path. That path needs its promotion id inside the session
  //     metadata; this one binds on `user_id`, which is already known, so there
  //     is nothing to create first — and creating the session first means a
  //     failure there leaves no orphan row behind.
  const session = await createCheckoutSession({
    productId: plan.dodo_product_id,
    // Prefill only, and read from Clerk rather than from the request: this
    // reaches Dodo as the customer record on a real invoice, so it must be the
    // signed-in identity and not a value the browser chose.
    customer: { email: buyer.email, name: buyer.name },
    // No id in either URL. The confirm path finds the caller's own open
    // purchase from their session, so there is nothing here worth editing —
    // `status` only decides which screen is drawn before the server answers.
    returnUrl: `${SITE_URL}/investors?status=success`,
    cancelUrl: `${SITE_URL}/investors?status=cancelled`,
    metadata: {
      // What the shared webhook dispatches on. Without it, a directory payment
      // would be handed to the promotion settler and refused as an unknown
      // session — recoverable, but only by hand.
      purpose: INVESTOR_CHECKOUT_PURPOSE,
      plan_id: plan.id,
      user_id: userId,
    },
  });

  if (!session.ok) {
    audit("investor_checkout_failed", { planId: plan.id });
    return { ok: false, error: session.error };
  }

  // (6) The purchase row, storing the price we quoted. What Dodo actually
  //     charges lands in `charged_amount` at settlement.
  const receipt = `bhid_${session.data.sessionId}`.slice(0, 40);
  const { data: purchase, error: insertError } = await supabase
    .from("investor_directory_purchases")
    .insert({
      user_id: userId,
      plan_id: plan.id,
      dodo_session_id: session.data.sessionId,
      checkout_url: session.data.checkoutUrl,
      receipt,
      amount: quoted,
      currency: plan.currency,
      status: "created",
    })
    .select("id")
    .single();

  if (insertError || !purchase) {
    // The session exists at Dodo but we could not record it. Refusing here is
    // the safe direction: an unrecorded session nobody pays costs nothing,
    // whereas sending the customer to a checkout with no local row would take
    // money that no settlement could afterwards attach to an account.
    audit("investor_purchase_insert_failed", {
      sessionId: session.data.sessionId,
      code: insertError?.code ?? null,
    });
    return { ok: false, error: "Could not start that purchase. Please try again." };
  }

  audit("investor_checkout_created", {
    purchaseId: purchase.id,
    sessionId: session.data.sessionId,
    planId: plan.id,
  });

  return {
    ok: true,
    checkoutUrl: session.data.checkoutUrl,
    purchaseId: purchase.id,
    amountPaise: quoted,
    currency: plan.currency,
  };
}

// Confirm
// -------

/**
 * Confirm a returned checkout and, only then, report access as granted.
 *
 * The customer arrives back from Dodo with `?status=success` in the URL. Not one
 * byte of that is treated as evidence. What actually happens:
 *
 *   1. the caller's most recent open purchase is found among their *own* rows;
 *   2. the checkout session id is read from that row, never from the request;
 *   3. Dodo is asked, over the API, whether that session produced a payment and
 *      what its status is;
 *   4. the payment is re-read for its amount, currency and metadata, and
 *      `settleInvestorPurchase` refuses anything that does not bind back to this
 *      customer.
 *
 * Note there is no `purchaseId` parameter at all. The promotion flow needs one
 * because a maker can have several promotions in flight; a customer has at most
 * one directory purchase open, so the server can find it without being told —
 * and a parameter that does not exist cannot be tampered with.
 *
 * This is the fast path, not the authoritative one. The webhook settles the same
 * row through the same function and is what remains correct when the customer
 * closes the tab on Dodo's page or pays through a mandate that clears minutes
 * later. Both are idempotent; whichever arrives first wins.
 */
export async function confirmInvestorPayment(): Promise<ConfirmInvestorResult> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Please log in.", retryable: false };

  const allowed = await checkRateLimitByIpAndUser("paymentVerify", userId);
  if (!allowed.ok) return { ok: false, error: allowed.message, retryable: true };

  const supabase = createServiceClient();
  const { data: purchase } = await supabase
    .from("investor_directory_purchases")
    .select("id, dodo_session_id, dodo_payment_id, status")
    // Step (1). The service client bypasses RLS, so scoping to the caller here
    // *is* the authorization — there is no policy behind it.
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!purchase) {
    audit("investor_confirm_not_found", { userId });
    return { ok: false, error: INVESTOR_VERIFICATION_ERROR_MESSAGE, retryable: false };
  }

  // Already settled — by an earlier call, or by the webhook winning the race.
  // Idempotent success rather than an error: the customer paid once and should
  // see one success screen however many times this runs.
  if (purchase.status === "paid") {
    const existing = await investorPurchaseSummary(
      purchase.id,
      purchase.dodo_payment_id ?? purchase.dodo_session_id,
    );
    return existing.ok
      ? { ok: true, state: "paid", summary: existing.summary }
      : { ok: false, error: existing.error, retryable: false };
  }

  // Step (3). Dodo's word, not the browser's.
  const session = await fetchCheckoutSession(purchase.dodo_session_id);
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
    return { ok: false, error: INVESTOR_PAYMENT_ERROR_MESSAGE, retryable: true };
  }

  const status = session.data.paymentStatus;

  if (status === "failed" || status === "cancelled") {
    await failInvestorPurchase({ sessionId: purchase.dodo_session_id, code: status, userId });
    return { ok: false, error: INVESTOR_PAYMENT_ERROR_MESSAGE, retryable: true };
  }

  // Everything that is neither settled nor dead. Recorded as pending and
  // reported as pending — never as a failure, which would send a customer with
  // money in flight to pay a second time.
  if (status !== "succeeded") {
    await markInvestorPurchasePending({
      sessionId: purchase.dodo_session_id,
      paymentId: session.data.paymentId,
      userId,
    });
    audit("investor_payment_still_pending", {
      purchaseId: purchase.id,
      paymentId: session.data.paymentId,
      remoteStatus: status,
    });
    return { ok: true, state: "pending", message: INVESTOR_PAYMENT_PENDING_MESSAGE };
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
  // this is belt-and-braces — but it is the check that would catch a swapped id,
  // and it costs a string comparison.
  if (
    remote.data.checkoutSessionId &&
    remote.data.checkoutSessionId !== purchase.dodo_session_id
  ) {
    audit("investor_payment_session_mismatch", {
      purchaseId: purchase.id,
      paymentId: remote.data.paymentId,
      expected: purchase.dodo_session_id,
    });
    return { ok: false, error: INVESTOR_VERIFICATION_ERROR_MESSAGE, retryable: false };
  }

  const settled = await settleInvestorPurchase({
    sessionId: purchase.dodo_session_id,
    paymentId: remote.data.paymentId,
    chargedAmount: remote.data.totalAmount,
    currency: remote.data.currency,
    tax: remote.data.tax,
    metadataUserId:
      typeof remote.data.metadata.user_id === "string" ? remote.data.metadata.user_id : null,
  });

  // A refusal must never be read as a success, or a mismatched charge would
  // unlock a directory nobody paid for.
  if (!settled.ok) {
    audit("investor_settlement_refused", {
      purchaseId: purchase.id,
      paymentId: remote.data.paymentId,
      reason: settled.reason,
    });
    return { ok: false, error: INVESTOR_VERIFICATION_ERROR_MESSAGE, retryable: false };
  }

  audit("investor_payment_confirmed", {
    purchaseId: settled.purchaseId,
    paymentId: remote.data.paymentId,
    firstSettlement: settled.firstWrite,
  });

  // The page this customer is standing on has just changed from locked to
  // unlocked, and it is a `force-dynamic` server component — so the refresh the
  // client triggers has to re-render against the new entitlement.
  revalidatePath("/investors");

  const summary = await investorPurchaseSummary(settled.purchaseId, remote.data.paymentId);
  return summary.ok
    ? { ok: true, state: "paid", summary: summary.summary }
    : { ok: false, error: summary.error, retryable: false };
}

/**
 * Record that a checkout was abandoned, so the customer's history is honest and
 * a retry starts from a clean state.
 *
 * Cannot mark anything paid. It only ever writes `failed`, only over a
 * still-open purchase, and only over one belonging to the caller — so the worst
 * a forged call achieves is marking the caller's own open purchase failed, which
 * they can already do by walking away from Dodo's checkout page.
 */
export async function recordInvestorCheckoutCancelled(): Promise<{ ok: boolean }> {
  const { userId } = await auth();
  if (!userId) return { ok: false };

  const supabase = createServiceClient();
  const { data: purchase } = await supabase
    .from("investor_directory_purchases")
    .select("dodo_session_id")
    .eq("user_id", userId)
    .eq("status", "created")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!purchase) return { ok: false };

  await failInvestorPurchase({
    sessionId: purchase.dodo_session_id,
    code: "checkout_cancelled",
    description: "The customer returned from Dodo checkout without paying.",
    userId,
  });

  return { ok: true };
}

// Search
// ------

export type InvestorSearchResult =
  | { ok: true; investors: InvestorFull[]; total: number; pageSize: number }
  | { ok: false; error: string };

/**
 * Search and filter the directory, for a customer who has paid.
 *
 * This is the *only* way premium investor data reaches a browser after the
 * first render, and it is worth being explicit about what protects it:
 *
 *   - `auth()` establishes who is asking; an unauthenticated post gets an error
 *     and no rows.
 *   - `getInvestorDirectory` re-reads the purchase row itself and returns `null`
 *     for anyone without a settled payment. The entitlement is never a
 *     parameter, so there is nothing here to forge.
 *   - the result is capped at `INVESTOR_PAGE_SIZE`, so no single call is an
 *     export of the dataset.
 *   - a rate limit bounds how fast the pages can be walked.
 *
 * Filters arrive as free text and are treated as data throughout: the search
 * term is length-capped and stripped of the two characters that would otherwise
 * change the meaning of a PostgREST filter string, and stage/sector/type are
 * matched with equality and containment rather than being interpolated into
 * anything.
 */
export async function searchInvestors(input: {
  filters?: Partial<InvestorFilters>;
  page?: number;
}): Promise<InvestorSearchResult> {
  const { userId } = await auth();
  if (!userId) {
    return { ok: false, error: "Please log in to search the investor directory." };
  }

  const allowed = await checkRateLimitByIpAndUser("investorSearch", userId);
  if (!allowed.ok) return { ok: false, error: allowed.message };

  const raw = input?.filters ?? {};
  // Every field is coerced to a bounded string here rather than trusted. These
  // are the values that reach the query builder, and "it came from our own
  // select element" is not a property the server can verify.
  const asFilter = (value: unknown): string | null => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim().slice(0, 80);
    return trimmed || null;
  };

  const filters: Partial<InvestorFilters> = {
    q: asFilter(raw.q) ?? "",
    stage: asFilter(raw.stage),
    sector: asFilter(raw.sector),
    location: asFilter(raw.location),
    investorType: asFilter(raw.investorType),
  };

  const page = Number.isFinite(input?.page) ? Math.max(0, Math.trunc(input.page as number)) : 0;

  const result = await getInvestorDirectory(userId, filters, page);

  // `null` is "has not paid", which is distinct from "paid, nothing matched".
  // One fixed message, so a probe cannot tell an empty directory from a locked
  // one.
  if (!result) {
    return { ok: false, error: "Unlock the investor directory to search it." };
  }

  return {
    ok: true,
    investors: result.investors,
    total: result.total,
    pageSize: INVESTOR_PAGE_SIZE,
  };
}
