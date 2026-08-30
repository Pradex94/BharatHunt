import "server-only";

/**
 * Dodo Payments client.
 *
 * Replaces the hand-rolled Razorpay REST client this repo used to carry. The
 * official `dodopayments` SDK is used rather than raw `fetch`, and the reason is
 * the opposite of the one that justified hand-rolling before: Dodo's surface is
 * a checkout session, a session status, a payment and a product price, spread
 * over two base URLs that differ by environment, with typed webhook event unions
 * that have to stay in step with a fast-moving API. That is more than an HMAC
 * and three endpoints, and the SDK is the thing that is kept correct when Dodo
 * adds a field.
 *
 * `server-only` is load-bearing. Importing this from a client component is a
 * build error, not a runtime surprise -- which is the mechanical guarantee that
 * `DODO_PAYMENTS_API_KEY` cannot reach a browser bundle. Every Dodo API key is
 * secret: unlike Razorpay's key id, Dodo issues no publishable credential, so
 * there is nothing in this file that would be safe to expose.
 *
 * The webhook signature check deliberately lives in lib/dodo-signature.ts, which
 * has no `server-only` marker and no SDK import, so `npm test` can reach it.
 */

import DodoPayments from "dodopayments";

import { isDodoId } from "@/lib/dodo-signature";

/**
 * Anything the API can go wrong with, as one type the callers branch on without
 * catching. A money path should not use exceptions for expected outcomes -- a
 * thrown error in a Server Action becomes an opaque digest in production and the
 * cause is lost. The SDK throws; this module is the boundary where that stops.
 */
export type DodoResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** What the browser is given to start paying. Neither value is a secret. */
export type DodoCheckoutSession = {
  /** `cks_...`. Stored on the payment row; the return path is verified from it. */
  sessionId: string;
  /** Dodo-hosted checkout URL the customer is sent to. */
  checkoutUrl: string;
};

/** The status of a session, read back from Dodo on the customer's return. */
export type DodoSessionStatus = {
  /** Null while the session is still collecting details -- nobody has paid yet. */
  paymentId: string | null;
  /** Dodo's `IntentStatus`, or null for the same reason. */
  paymentStatus: string | null;
};

/** A payment, narrowed to the fields the settlement path reads. */
export type DodoPayment = {
  paymentId: string;
  /** Total charged to the customer **including tax**, in the smallest unit. */
  totalAmount: number;
  currency: string;
  /** Tax component of `totalAmount`, when Dodo reports one. */
  tax: number | null;
  status: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  /** The session that produced it. The binding a settlement is authorized on. */
  checkoutSessionId: string | null;
  /** Our own ids, echoed back. See `createCheckoutSession`. */
  metadata: Record<string, string | number | boolean>;
  /**
   * Cumulative total of every *succeeded* refund against this payment.
   *
   * Summed here rather than taken from a `refund.succeeded` event's own amount,
   * which describes one refund. Webhooks are at-least-once, so adding a
   * per-event amount to a stored running total double-counts on a replay; a
   * total recomputed from Dodo's own list is the same answer however many times
   * it is asked.
   */
  refundedAmount: number;
  /** Dodo's own verdict on whether the refund covered the payment. */
  refundStatus: "partial" | "full" | null;
};

/** A catalogue price, read back so we never charge a figure we did not show. */
export type DodoProductPrice = {
  amount: number;
  currency: string;
  taxInclusive: boolean;
  payWhatYouWant: boolean;
  /** Percentage, 0-100. A discounted product is not a fixed-price slot. */
  discount: number;
};

// Credentials
// -----------

/**
 * Reads credentials at call time, never at module scope.
 *
 * A module-level `const KEY = process.env...` is evaluated during the build,
 * where the variable may legitimately be absent, and would bake `undefined` into
 * the bundle for every later request.
 */
function apiKey(): string | null {
  return process.env.DODO_PAYMENTS_API_KEY || null;
}

/**
 * Which Dodo to talk to.
 *
 * `environment` is a narrow union and the SDK defaults it to **live_mode**, so
 * an unset variable would otherwise point a development machine at real money.
 * It is narrowed explicitly here and defaults to `test_mode`: a misconfigured
 * deployment must fail closed, taking no money, rather than fail open.
 *
 * This is the one place the Razorpay client's "live credentials only, no
 * test-mode branch" rule does not carry over, because Dodo genuinely has two
 * base URLs and two key formats. Production sets
 * `DODO_PAYMENTS_ENVIRONMENT=live_mode`.
 */
function environment(): "live_mode" | "test_mode" {
  return process.env.DODO_PAYMENTS_ENVIRONMENT === "live_mode" ? "live_mode" : "test_mode";
}

/**
 * True when the key format and the selected environment agree.
 *
 * The footgun this closes: a `dodo_live_` key with `DODO_PAYMENTS_ENVIRONMENT`
 * unset silently selects test mode, where that key is not valid -- every call
 * fails with a 401 that reads like an outage. Worse in the other direction, a
 * `dodo_test_` key against `live_mode` produces a checkout customers cannot pay
 * on. Refusing up front turns both into one clear log line.
 */
function credentialsAgree(key: string, env: "live_mode" | "test_mode"): boolean {
  if (key.startsWith("dodo_live_")) return env === "live_mode";
  if (key.startsWith("dodo_test_")) return env === "test_mode";
  // An unrecognised prefix is not evidence of a mismatch; let Dodo reject it.
  return true;
}

/** Whether Dodo credentials are configured, and consistent, in this environment. */
export function isDodoConfigured(): boolean {
  const key = apiKey();
  return key !== null && credentialsAgree(key, environment());
}

/** The webhook signing secret, a *different* value from the API key. */
export function webhookSecret(): string | null {
  return process.env.DODO_PAYMENTS_WEBHOOK_KEY || null;
}

/**
 * Structured log for the payment path.
 *
 * Ids, codes and booleans only. Never the API key, never a response body, never
 * a customer's email -- Vercel retains these logs and makes them searchable, so
 * a field added here is a field kept indefinitely.
 */
function log(event: string, fields: Record<string, string | number | boolean | null>) {
  console.error(JSON.stringify({ event, ...fields, at: new Date().toISOString() }));
}

/**
 * A client, constructed per call rather than once at module scope.
 *
 * The constructor throws when `bearerToken` is undefined, so building one
 * eagerly would turn a missing variable into a module-load crash that takes out
 * every route importing this file, rather than a handled "payments are
 * unavailable" on the one page that sells something.
 */
function client(): DodoPayments | null {
  const key = apiKey();
  const env = environment();

  if (!key) {
    log("dodo_not_configured", { reason: "missing_api_key" });
    return null;
  }
  if (!credentialsAgree(key, env)) {
    log("dodo_not_configured", { reason: "key_environment_mismatch", environment: env });
    return null;
  }

  return new DodoPayments({ bearerToken: key, environment: env, webhookKey: webhookSecret() });
}

/**
 * Turns a thrown SDK error into the result union, logging the endpoint and the
 * HTTP status only.
 *
 * Dodo's error bodies can echo request fields back, so the body is never written
 * to a log line and never shown to a customer. The caller gets one of three
 * fixed strings.
 */
function failure(endpoint: string, cause: unknown): { ok: false; error: string } {
  // `DodoPayments.APIError` rather than a deep import of the SDK's error module:
  // the static is the documented surface and does not move when the package's
  // internal file layout does.
  if (cause instanceof DodoPayments.APIError) {
    log("dodo_api_error", { endpoint, status: cause.status ?? null });
    return { ok: false, error: "The payment provider rejected that request." };
  }
  log("dodo_request_failed", {
    endpoint,
    reason: cause instanceof Error ? cause.name : "unknown",
  });
  return { ok: false, error: "Could not reach the payment provider." };
}

const UNCONFIGURED = { ok: false as const, error: "Payments are not configured." };

// Endpoints
// ---------

/**
 * Read a product's catalogue price.
 *
 * This call is what preserves the guarantee the Razorpay integration got for
 * free by sending an explicit amount. Under Dodo the price lives in Dodo's own
 * catalogue and a checkout session names a `product_id`, not a figure -- so the
 * amount shown on our page and the amount charged come from two sources that can
 * silently drift apart. The caller compares them and refuses to open a checkout
 * when they disagree.
 */
export async function fetchProductPrice(productId: string): Promise<DodoResult<DodoProductPrice>> {
  // Interpolated into an outbound request path, so validated rather than
  // trusted even though it came from our own database.
  if (!isDodoId(productId, "pdt")) {
    return { ok: false, error: "Invalid product reference." };
  }

  const dodo = client();
  if (!dodo) return UNCONFIGURED;

  try {
    const product = await dodo.products.retrieve(productId);
    const price = product.price;

    // A promotion slot is a one-off purchase of a fixed-price placement. A
    // recurring or usage-based price on this product would mean the dashboard
    // and this code disagree about what is being sold, and the safe reading of
    // that disagreement is "do not sell it".
    if (price.type !== "one_time_price") {
      log("dodo_product_price_unsupported", { productId, priceType: price.type });
      return { ok: false, error: "That promotion package is misconfigured." };
    }

    return {
      ok: true,
      data: {
        amount: price.price,
        currency: price.currency,
        taxInclusive: price.tax_inclusive ?? false,
        payWhatYouWant: price.pay_what_you_want ?? false,
        discount: price.discount,
      },
    };
  } catch (cause) {
    return failure("products.retrieve", cause);
  }
}

/**
 * Open a hosted checkout session for one promotion package.
 *
 * `metadata` carries our own ids into Dodo's dashboard and back out on every
 * webhook, which is what lets a payment be traced to a promotion without a
 * lookup table -- and, more importantly, what the settlement path checks a
 * payment against. It is visible to anyone with dashboard access, so it holds
 * ids and nothing else: no email, no name.
 *
 * The customer's email is passed for prefill only. It is never used to identify
 * the buyer server-side; that is `auth()`'s job, and the caller has already done
 * it.
 */
export async function createCheckoutSession(params: {
  productId: string;
  customer: { email: string; name?: string };
  returnUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
}): Promise<DodoResult<DodoCheckoutSession>> {
  if (!isDodoId(params.productId, "pdt")) {
    return { ok: false, error: "Invalid product reference." };
  }

  const dodo = client();
  if (!dodo) return UNCONFIGURED;

  try {
    const session = await dodo.checkoutSessions.create({
      product_cart: [{ product_id: params.productId, quantity: 1 }],
      customer: { email: params.customer.email, name: params.customer.name ?? null },
      return_url: params.returnUrl,
      cancel_url: params.cancelUrl,
      metadata: params.metadata,
      feature_flags: {
        // A promotion slot is a fixed-price product sold in one currency.
        // Letting the customer switch currency at checkout would produce a
        // `total_amount` in a currency our row does not record, and there is no
        // discount programme behind this to accept a code for.
        allow_currency_selection: false,
        allow_discount_code: false,
      },
    });

    // `checkout_url` is null only for the confirm-mode inline flow, which this
    // integration does not use. Treating it as an error rather than asserting on
    // it keeps a surprising API response from becoming a runtime crash on the
    // one page that takes money.
    if (!session.checkout_url) {
      log("dodo_session_without_url", { sessionId: session.session_id });
      return { ok: false, error: "Could not open the payment page. Please try again." };
    }

    return { ok: true, data: { sessionId: session.session_id, checkoutUrl: session.checkout_url } };
  } catch (cause) {
    return failure("checkoutSessions.create", cause);
  }
}

/**
 * Read a checkout session back from Dodo.
 *
 * This is the call that makes the return path mean something. The customer
 * arrives back on our site with a promotion id in the query string, which is a
 * claim; this is Dodo's own answer to "was this session paid, and by which
 * payment". Everything the browser said is discarded in favour of it.
 */
export async function fetchCheckoutSession(
  sessionId: string,
): Promise<DodoResult<DodoSessionStatus>> {
  if (!isDodoId(sessionId, "cks")) {
    return { ok: false, error: "Invalid checkout reference." };
  }

  const dodo = client();
  if (!dodo) return UNCONFIGURED;

  try {
    const status = await dodo.checkoutSessions.retrieve(sessionId);
    return {
      ok: true,
      data: { paymentId: status.payment_id ?? null, paymentStatus: status.payment_status ?? null },
    };
  } catch (cause) {
    return failure("checkoutSessions.retrieve", cause);
  }
}

/** Read a payment back from Dodo, for the amount and the ids it was made under. */
export async function fetchPayment(paymentId: string): Promise<DodoResult<DodoPayment>> {
  if (!isDodoId(paymentId, "pay")) {
    return { ok: false, error: "Invalid payment reference." };
  }

  const dodo = client();
  if (!dodo) return UNCONFIGURED;

  try {
    const payment = await dodo.payments.retrieve(paymentId);

    const refundedAmount = (payment.refunds ?? [])
      .filter((refund) => refund.status === "succeeded")
      .reduce((total, refund) => total + (refund.amount ?? 0), 0);

    return {
      ok: true,
      data: {
        paymentId: payment.payment_id,
        totalAmount: payment.total_amount,
        currency: payment.currency,
        tax: payment.tax ?? null,
        status: payment.status ?? null,
        errorCode: payment.error_code ?? null,
        errorMessage: payment.error_message ?? null,
        checkoutSessionId: payment.checkout_session_id ?? null,
        metadata: payment.metadata ?? {},
        refundedAmount,
        refundStatus: payment.refund_status ?? null,
      },
    };
  } catch (cause) {
    return failure("payments.retrieve", cause);
  }
}

export { verifyWebhookSignature, isDodoId } from "@/lib/dodo-signature";
