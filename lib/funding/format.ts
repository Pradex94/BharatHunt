/**
 * How a funding figure is allowed to appear on screen.
 *
 * The rule this file exists to enforce (section 30 of the brief): a card shows
 * what the source reported, in the currency the source reported it in. Nothing
 * here converts for display. `toInr` exists solely so a chart can add a $4M seed
 * to a ₹25 Cr Series A, and every surface that uses it says underneath that it
 * did.
 *
 * Pure and client-safe — the filter bar and the cards both render through it.
 */

import { FUNDING_FX_TO_INR } from "./constants.ts";

const CRORE = 10_000_000;
const LAKH = 100_000;

/**
 * Rupees in the units an Indian reader actually thinks in: crore above a crore,
 * lakh above a lakh, plain rupees below that.
 *
 * One decimal place, and only when it carries information — "₹25 Cr" rather
 * than "₹25.0 Cr", but "₹8.5 Cr" rather than "₹9 Cr", because rounding a
 * reported figure by half a crore is changing it.
 */
export function formatInr(amount: number | null | undefined): string | null {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return null;
  if (amount < 0) return null;

  if (amount >= CRORE) return `₹${trimZero(amount / CRORE)} Cr`;
  if (amount >= LAKH) return `₹${trimZero(amount / LAKH)} L`;
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

/** Non-rupee currencies, in their own conventional units. */
export function formatForeign(amount: number | null | undefined, currency: string): string | null {
  if (amount === null || amount === undefined || !Number.isFinite(amount) || amount < 0) return null;

  const symbol = CURRENCY_SYMBOL[currency] ?? `${currency} `;
  if (amount >= 1_000_000_000) return `${symbol}${trimZero(amount / 1_000_000_000)}B`;
  if (amount >= 1_000_000) return `${symbol}${trimZero(amount / 1_000_000)}M`;
  if (amount >= 1_000) return `${symbol}${trimZero(amount / 1_000)}K`;
  return `${symbol}${Math.round(amount).toLocaleString("en-US")}`;
}

const CURRENCY_SYMBOL: Record<string, string> = {
  INR: "₹",
  USD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
};

function trimZero(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/**
 * The string a card shows for a round's amount.
 *
 * Prefers `amount` — the figure exactly as the article wrote it — and falls
 * back to formatting the parsed number in its own currency. Returns null when
 * there is no figure at all, and every caller renders "Undisclosed" for a null
 * rather than a zero. A zero would be a claim; the absence is the fact.
 */
export function displayAmount(round: {
  amount?: string | null;
  amount_numeric?: number | null;
  currency?: string | null;
}): string | null {
  if (round.amount && round.amount.trim()) return round.amount.trim();
  if (round.amount_numeric === null || round.amount_numeric === undefined) return null;

  const currency = round.currency ?? "INR";
  return currency === "INR"
    ? formatInr(round.amount_numeric)
    : formatForeign(round.amount_numeric, currency);
}

/** The word to render when there is no figure. Never "₹0", never "—". */
export const UNDISCLOSED_LABEL = "Undisclosed";

/**
 * Convert to rupees for aggregation only, returning the rate that was used so
 * the caller can record it on the row.
 *
 * Null for an unknown currency rather than a guess: a round in a currency this
 * table does not carry is left out of totals, which understates them in a way
 * the page can disclose, instead of inventing a rate that would misstate them
 * in a way nobody could see.
 */
export function toInr(
  amount: number | null | undefined,
  currency: string | null | undefined,
): { inr: number; rate: number } | null {
  if (amount === null || amount === undefined || !Number.isFinite(amount) || amount < 0) return null;

  const rate = FUNDING_FX_TO_INR[(currency ?? "INR").toUpperCase()];
  if (!rate || !Number.isFinite(rate)) return null;

  return { inr: Math.round(amount * rate), rate };
}

/**
 * Compact rupee label for a chart axis, where "₹1,240 Cr" is too wide.
 * Thousands of crore become "K Cr" rather than a lakh-crore unit nobody reads.
 */
export function formatInrCompact(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount) || amount <= 0) return "—";
  const crore = amount / CRORE;
  if (crore >= 1000) return `₹${trimZero(crore / 1000)}K Cr`;
  if (crore >= 1) return `₹${trimZero(crore)} Cr`;
  return `₹${trimZero(amount / LAKH)} L`;
}

/**
 * "2 hours ago", from an ISO timestamp.
 *
 * Caps at "on 12 Aug 2026" past a week, because "43 days ago" is a number the
 * reader has to convert back into a date. Returns null for a missing or
 * unparseable input so callers can omit the line rather than print "Invalid
 * Date", which is what a naive `toLocaleString` does with a null.
 *
 * `now` is injectable so `tests/funding-format.test.ts` can assert boundaries
 * without the clock moving underneath it.
 */
export function relativeTime(
  value: string | Date | null | undefined,
  now: Date = new Date(),
): string | null {
  if (!value) return null;
  const then = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(then.getTime())) return null;

  const seconds = Math.round((now.getTime() - then.getTime()) / 1000);

  // A source's clock can be a little ahead of ours; "in 3 minutes" on a news
  // card reads like a bug, so anything near-future is simply "just now".
  if (seconds < 60) return "just now";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.round(hours / 24);
  if (days <= 7) return `${days} day${days === 1 ? "" : "s"} ago`;

  return `on ${formatDay(then)}`;
}

/** "12 Aug 2026" — unambiguous, and the same in every locale that reads this site. */
export function formatDay(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

/** "August 2026", for a month bucket key of the form "2026-08". */
export function formatMonthKey(key: string): string {
  const [year, month] = key.split("-").map(Number);
  if (!year || !month) return key;
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-IN", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * The favicon of the publication that ran the story.
 *
 * Google's public favicon endpoint rather than fetching and storing icons: it
 * is one `<img>` with no build step, no storage and no per-source
 * configuration, and a source whose icon fails to load simply renders the
 * fallback initial. Returns null for anything unparseable so the caller can
 * skip the image entirely.
 */
export function sourceFaviconUrl(sourceUrl: string | null | undefined): string | null {
  if (!sourceUrl) return null;
  try {
    const { hostname } = new URL(sourceUrl);
    if (!hostname) return null;
    return `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(hostname)}`;
  } catch {
    return null;
  }
}

/** The publication's bare domain, for the "Source:" line when no name is stored. */
export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * The rupee equivalent of a non-rupee round, for a secondary "≈ ₹X Cr" line.
 *
 * Only ever shown *next to* the reported figure and labelled as a conversion —
 * never instead of it. Uses `amount_inr`, which was converted at the rate
 * stamped on the row (`fx_rate_to_inr`) when the round was extracted, so this
 * does not re-convert with today's table. Null for rupee rounds (nothing to
 * convert) and for rounds with no rupee figure (nothing honest to show).
 */
export function convertedInrEstimate(round: {
  currency?: string | null;
  amount_inr?: number | null;
}): string | null {
  const currency = (round.currency ?? "INR").toUpperCase();
  if (currency === "INR") return null;
  if (round.amount_inr === null || round.amount_inr === undefined) return null;
  return formatInr(round.amount_inr);
}

export type ConfidenceBand = "high" | "medium" | "low";

/**
 * The extractor's 0..1 score as a word.
 *
 * A band rather than a percentage, deliberately: "87% confidence" invites a
 * precision the heuristic does not have, while "high / medium / low" says what
 * a reader can actually use — how much to lean on the record before opening the
 * source. Null when there is no score, which callers render as nothing.
 */
export function confidenceBand(score: number | string | null | undefined): ConfidenceBand | null {
  if (score === null || score === undefined || score === "") return null;
  const value = typeof score === "string" ? Number(score) : score;
  if (!Number.isFinite(value) || value < 0 || value > 1) return null;
  if (value >= 0.8) return "high";
  if (value >= 0.55) return "medium";
  return "low";
}

/** "29 Sep 2026, 12:42 am IST" — an absolute time for a title or a footnote. */
export function formatIstDateTime(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const formatted = date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });
  return `${formatted} IST`;
}

/** Up to two initials for a logo placeholder: "Byte Ask" → "BA", "zepto" → "Z". */
export function initialsOf(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/[\s\-_.]+/).filter(Boolean);
  if (words.length === 0) return "?";
  const letters = words.length === 1 ? words[0].slice(0, 1) : words[0][0] + words[1][0];
  return letters.toUpperCase();
}

/**
 * A round's amount in one house style: "₹12.5 Cr", "₹1,455 Cr", "₹50 L",
 * "$6.7 Mn", "$1.2 Bn".
 *
 * The same *figure* as the source reported, in the source's currency — only
 * the typography is normalised, so "Rs 12.5 Crore", "₹12.5 crore" and
 * "INR 125 million" stop reading as three different numbers in one feed.
 * Built from `amount_numeric` + `currency` (what extraction parsed); when
 * there is no parsed number it falls back to the verbatim string, and callers
 * keep that verbatim string available as "as reported". Nothing is converted.
 */
export function formatReportedAmount(round: {
  amount?: string | null;
  amount_numeric?: number | null;
  currency?: string | null;
}): string | null {
  const value = round.amount_numeric;
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) {
    return round.amount?.trim() || null;
  }

  const currency = (round.currency ?? "INR").toUpperCase();
  if (currency === "INR") {
    if (value >= CRORE) {
      const crore = Math.round((value / CRORE) * 10) / 10;
      return `₹${crore >= 1000 ? Math.round(crore).toLocaleString("en-IN") : trimZero(crore)} Cr`;
    }
    if (value >= LAKH) return `₹${trimZero(value / LAKH)} L`;
    return `₹${Math.round(value).toLocaleString("en-IN")}`;
  }

  const symbol = CURRENCY_SYMBOL[currency] ?? `${currency} `;
  if (value >= 1_000_000_000) return `${symbol}${trimZero(value / 1_000_000_000)} Bn`;
  if (value >= 1_000_000) return `${symbol}${trimZero(value / 1_000_000)} Mn`;
  if (value >= 1_000) return `${symbol}${trimZero(value / 1_000)}K`;
  return `${symbol}${Math.round(value).toLocaleString("en-US")}`;
}
