/**
 * Razorpay Standard Checkout, typed and loaded on demand.
 *
 * The script is fetched when the customer clicks Pay, not on page load. It is
 * ~90KB from a third-party origin that the rest of the site never needs, and
 * `/promote/checkout` is a page most visitors will read without buying
 * anything. `next/script` would tie the load to the render instead.
 *
 * No key, no secret and no amount appears in this file. Everything Checkout is
 * opened with comes from the server's order-creation response.
 */

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

/** What Checkout hands back on success. The three fields the server verifies. */
export type RazorpayCheckoutResponse = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

/** The `payment.failed` payload, narrowed to what is worth recording. */
export type RazorpayFailure = {
  error?: {
    code?: string;
    description?: string;
    reason?: string;
    metadata?: { order_id?: string; payment_id?: string };
  };
};

export type RazorpayOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (response: RazorpayCheckoutResponse) => void;
  prefill?: { name?: string; email?: string };
  notes?: Record<string, string>;
  theme?: { color?: string };
  modal?: { ondismiss?: () => void; escape?: boolean; confirm_close?: boolean };
};

type RazorpayInstance = {
  open: () => void;
  close: () => void;
  on: (event: "payment.failed", handler: (payload: RazorpayFailure) => void) => void;
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

/**
 * One in-flight load shared by every caller.
 *
 * Without this, a double-click that got past the button's own guard would append
 * two script tags and race two definitions of `window.Razorpay`. The promise is
 * cleared on failure so a customer who lost connectivity can retry rather than
 * being stuck with a permanently rejected promise.
 */
let loader: Promise<void> | null = null;

export function loadRazorpayCheckout(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Checkout can only be opened in a browser."));
  }
  if (window.Razorpay) return Promise.resolve();
  if (loader) return loader;

  loader = new Promise<void>((resolve, reject) => {
    // A tag may already exist from an earlier attempt that has not finished.
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${CHECKOUT_SRC}"]`);
    const script = existing ?? document.createElement("script");

    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener(
      "error",
      () => reject(new Error("Could not load the payment window.")),
      { once: true },
    );

    if (!existing) {
      script.src = CHECKOUT_SRC;
      script.async = true;
      document.body.appendChild(script);
    }
  });

  loader = loader.catch((cause) => {
    loader = null;
    throw cause;
  });

  return loader;
}

export function openRazorpayCheckout(
  options: RazorpayOptions,
  onFailure: (payload: RazorpayFailure) => void,
): void {
  const Razorpay = window.Razorpay;
  if (!Razorpay) throw new Error("The payment window is not ready.");

  const instance = new Razorpay(options);
  instance.on("payment.failed", onFailure);
  instance.open();
}
