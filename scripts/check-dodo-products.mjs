/**
 * Asks Dodo Payments what it actually knows about our promotion products.
 *
 *   node scripts/check-dodo-products.mjs
 *
 * Reads `.env.local` and calls `GET /products/{id}` for each `pdt_` id passed on
 * the command line, or for the three ids in supabase/link-dodo-products.sql when
 * none are given. Prints what came back and says plainly whether each one is
 * usable.
 *
 * Pass `--paise=N` to also assert the price, which is what you want when
 * checking a product this script has no expectation for -- the Investor
 * Directory plan, say:
 *
 *   node scripts/check-dodo-products.mjs pdt_xxx --paise=49900
 *
 * Why this exists
 * ---------------
 * Three things can be wrong about a product id and none of them is visible from
 * our side of the wire:
 *
 *   1. it was transcribed wrong (`0` vs `O`, `I` vs `l`);
 *   2. it exists in the *other* environment -- a product created in the test
 *      dashboard is a 404 in live mode, and the reverse;
 *   3. its price drifted from `promotion_packages.amount_paise`, or it is
 *      archived, recurring, discounted, or pay-what-you-want.
 *
 * All three produce the same symptom in the app: the package silently stops
 * being purchasable. `createPromotionCheckout` is right to fail closed there,
 * but "right" is not the same as "diagnosable", and this script is the
 * difference.
 *
 * Read-only. It creates nothing, charges nothing, and never prints the API key.
 */

import { readFileSync } from "node:fs";

/** The ids and prices supabase/link-dodo-products.sql writes, kept in step. */
const EXPECTED = [
  { packageId: "spotlight-7d", paise: 499900, id: "pdt_0NmXGgBNvbblpm36iVB9e" },
  { packageId: "featured-7d", paise: 249900, id: "pdt_0NmXHLoS0jTCR3OJks6HJ" },
  { packageId: "category-7d", paise: 99900, id: "pdt_0NmXHRmsIsa9wnSTT3ziC" },
];

/**
 * A minimal `.env.local` reader.
 *
 * Deliberately not `dotenv`: this repo has no such dependency and a diagnostic
 * script is a poor reason to add one to a payment path. Handles `KEY=value`,
 * `export KEY=value`, surrounding quotes and `#` comments, which is all a
 * hand-edited env file contains.
 */
function loadEnv(path = ".env.local") {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return {};
  }

  const env = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).replace(/^export\s+/, "").trim();
    const value = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/, "$2");
    env[key] = value;
  }
  return env;
}

const file = loadEnv();
const apiKey = process.env.DODO_PAYMENTS_API_KEY ?? file.DODO_PAYMENTS_API_KEY;
const configured = process.env.DODO_PAYMENTS_ENVIRONMENT ?? file.DODO_PAYMENTS_ENVIRONMENT;

if (!apiKey) {
  console.error("DODO_PAYMENTS_API_KEY is not set (checked the environment and .env.local).");
  process.exit(1);
}

/* The same narrowing lib/dodo.ts does: anything but the exact string is test. */
const environment = configured === "live_mode" ? "live_mode" : "test_mode";
const baseUrl =
  environment === "live_mode" ? "https://live.dodopayments.com" : "https://test.dodopayments.com";

/* The prefix check that would otherwise fail as an unexplained 401. */
const keyMode = apiKey.startsWith("dodo_live_")
  ? "live_mode"
  : apiKey.startsWith("dodo_test_")
    ? "test_mode"
    : null;

console.log(`environment : ${environment}${configured ? "" : "  (DODO_PAYMENTS_ENVIRONMENT unset — defaulted)"}`);
console.log(`base url    : ${baseUrl}`);
console.log(`key prefix  : ${keyMode ?? "unrecognised"}`);

if (keyMode && keyMode !== environment) {
  console.error(
    `\n✗ The API key is a ${keyMode} key but ${environment} is selected.\n` +
      `  lib/dodo.ts refuses this combination, so the checkout would report\n` +
      `  "Payments are temporarily unavailable". Set DODO_PAYMENTS_ENVIRONMENT=${keyMode}.`,
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const ids = args.filter((arg) => arg.startsWith("pdt_"));

/*
 * The expected price for ids given on the command line.
 *
 * Without it an argv id is only checked for shape -- one-time, INR, no discount
 * -- and the single most likely mistake, a product priced at something other
 * than what our own table quotes, would pass. `createInvestorCheckout` and
 * `createPromotionCheckout` both refuse that mismatch at runtime, so this is
 * about finding it now rather than from a customer's bug report.
 */
const paiseArg = args.find((arg) => arg.startsWith("--paise="));
const expectedPaise = paiseArg ? Number.parseInt(paiseArg.slice("--paise=".length), 10) : null;

if (paiseArg && !Number.isFinite(expectedPaise)) {
  console.error(`--paise expects an integer number of paise, e.g. --paise=49900`);
  process.exit(1);
}

const targets = ids.length
  ? ids.map((id) => ({ id, packageId: null, paise: expectedPaise }))
  : EXPECTED;

const rupees = (paise) => `₹${(paise / 100).toLocaleString("en-IN")}`;

let failures = 0;

for (const target of targets) {
  console.log(`\n${"─".repeat(68)}\n${target.packageId ?? "(id from argv)"}  ${target.id}`);

  let response;
  try {
    response = await fetch(`${baseUrl}/products/${encodeURIComponent(target.id)}`, {
      headers: { authorization: `Bearer ${apiKey}` },
    });
  } catch (cause) {
    failures += 1;
    console.error(`  ✗ could not reach Dodo: ${cause.message}`);
    continue;
  }

  if (!response.ok) {
    failures += 1;
    console.error(`  ✗ HTTP ${response.status}`);
    if (response.status === 404) {
      console.error(
        `    Not found in ${environment}. Either the id is mistyped, or the\n` +
          `    product lives in the other Dodo environment.`,
      );
    } else if (response.status === 401 || response.status === 403) {
      console.error("    The API key was rejected.");
    }
    continue;
  }

  const product = await response.json();
  const price = product.price ?? {};

  console.log(`  name         : ${product.name ?? "(unnamed)"}`);
  console.log(`  price type   : ${price.type ?? "(none)"}`);
  console.log(`  price        : ${price.price != null ? rupees(price.price) : "?"} ${price.currency ?? ""}`);
  console.log(`  tax inclusive: ${price.tax_inclusive ?? false}`);
  console.log(`  discount     : ${price.discount ?? 0}%`);

  /* Exactly the conditions createPromotionCheckout enforces before it will open
   * a checkout, so a pass here means the Pay button works. */
  const problems = [];
  if (price.type !== "one_time_price") problems.push(`price type is "${price.type}", not one_time_price`);
  if (price.currency !== "INR") problems.push(`currency is ${price.currency}, not INR`);
  if (price.pay_what_you_want) problems.push("pay-what-you-want is on");
  if ((price.discount ?? 0) !== 0) problems.push(`a ${price.discount}% discount is applied`);
  if (target.paise != null && price.price !== target.paise) {
    problems.push(`price is ${rupees(price.price)}, but the package quotes ${rupees(target.paise)}`);
  }

  if (problems.length) {
    failures += 1;
    console.error("  ✗ not purchasable:");
    for (const problem of problems) console.error(`    - ${problem}`);
  } else {
    console.log("  ✓ usable");
  }
}

console.log(`\n${"─".repeat(68)}`);
if (failures) {
  console.error(`${failures} of ${targets.length} product(s) would not sell. Fix the above, then re-run.`);
  process.exit(1);
}
console.log(
  ids.length
    ? `All ${targets.length} product(s) check out.`
    : `All ${targets.length} products check out. Run supabase/link-dodo-products.sql next.`,
);
